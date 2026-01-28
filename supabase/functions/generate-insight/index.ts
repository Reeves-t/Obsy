// Supabase Edge Function: generate-insight
// Secure proxy for Gemini AI calls
// 
// Security features:
// - API key hidden server-side (not in client bundle)
// - User authentication required
// - Rate limiting per user tier
// - Prompts stored server-side (not exposed to users)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// CORS headers for mobile app
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rate limits per tier (calls per day)
const RATE_LIMITS = {
    guest: 1,
    free: 3,
    founder: 100,
    subscriber: 100,
};

// Insight types
type InsightType = "daily" | "weekly" | "capture" | "album" | "tag" | "month";

interface InsightRequest {
    type: InsightType;
    data: {
        captures?: CaptureData[];
        dateLabel?: string;
        weekLabel?: string;
        monthLabel?: string;
        tag?: string;
        albumContext?: AlbumEntry[];
        signals?: MonthSignals;
    };
    tone: string;
    customTonePrompt?: string;
}

interface CaptureData {
    mood: string;
    note?: string;
    capturedAt: string;
    tags?: string[];
    timeBucket?: string;
}

interface AlbumEntry {
    user_name: string;
    mood: string;
    description: string;
    time: string;
}

interface MonthSignals {
    dominantMood: string;
    runnerUpMood?: string;
    activeDays: number;
    volatilityScore: number;
    last7DaysShift: string;
}

// ============================================
// PROMPTS (Server-side only - never sent to client)
// ============================================

const LANGUAGE_CONSTRAINTS = `
BANNED WORDS: "journal", "entry", "entries", "capture", "captures", "photo", "photos", "logged", "recorded", "data", "app", "tracked"
Use natural language: "moments", "feelings", "experiences", "your day", "this time"
NEVER mention the app or tracking mechanics.
`;

const TONE_STYLES: Record<string, string> = {
    neutral: "Be observational and slightly poetic. Focus on emotional truth without judgment.",
    gentle: "Be warm, supportive, and encouraging. Validate feelings without toxic positivity.",
    snarky: "Be witty and a bit sardonic. Poke fun gently but never be mean.",
    cosmic: "Speak as if viewing life from a vast cosmic perspective. Make the mundane feel epic.",
    haiku: "Respond in haiku format (5-7-5 syllables). Be profound in brevity.",
    film_noir: "Channel a 1940s detective narrator. Moody, atmospheric, metaphor-heavy.",
    nature: "Draw parallels to natural phenomena. Seasons, weather, ecosystems.",
};

function buildDailyPrompt(data: InsightRequest["data"], tone: string, customTonePrompt?: string): string {
    const captures = data.captures || [];
    const toneStyle = customTonePrompt || TONE_STYLES[tone] || TONE_STYLES.neutral;

    const captureDescriptions = captures.map((c, i) => {
        const time = c.timeBucket || "sometime";
        const mood = c.mood || "neutral";
        const note = c.note ? ` — "${c.note.slice(0, 100)}"` : "";
        const tags = c.tags?.length ? ` [${c.tags.join(", ")}]` : "";
        return `${i + 1}. ${time}: Feeling ${mood}${note}${tags}`;
    }).join("\n");

    return `You are generating a daily insight for ${data.dateLabel || "today"}.

TONE: ${toneStyle}

${LANGUAGE_CONSTRAINTS}

USER'S DAY:
${captureDescriptions || "No specific moments recorded."}

RULES:
- Write 2-4 sentences that reflect the emotional arc of the day
- Be specific to what happened, not generic
- ${captures.length <= 2 ? "Keep it brief (1-2 sentences)" : "You can be more detailed"}
- Never give advice or therapy
- Never use banned words

Respond with JSON:
{
    "insight": "Your insight text here",
    "vibe_tags": ["tag1", "tag2"],
    "mood_colors": ["#hex1", "#hex2"]
}`;
}

function buildWeeklyPrompt(data: InsightRequest["data"], tone: string, customTonePrompt?: string): string {
    const toneStyle = customTonePrompt || TONE_STYLES[tone] || TONE_STYLES.neutral;

    return `You are generating a weekly reflection for ${data.weekLabel || "this week"}.

TONE: ${toneStyle}

${LANGUAGE_CONSTRAINTS}

WEEK SUMMARY:
${JSON.stringify(data.captures?.slice(0, 20) || [], null, 2)}

RULES:
- Write 3-5 sentences capturing the week's emotional journey
- Look for patterns and themes across days
- Be specific, not generic
- Never give advice

Respond with JSON:
{
    "insight": "Your weekly reflection here"
}`;
}

function buildMonthlyPrompt(data: InsightRequest["data"], tone: string, customTonePrompt?: string): string {
    const toneStyle = customTonePrompt || TONE_STYLES[tone] || TONE_STYLES.neutral;
    const signals = data.signals;

    return `You are generating a monthly narrative for ${data.monthLabel || "this month"}.

TONE: ${toneStyle}

${LANGUAGE_CONSTRAINTS}

MONTH SIGNALS:
- Dominant mood: ${signals?.dominantMood || "unknown"}
- Secondary mood: ${signals?.runnerUpMood || "none"}
- Active days: ${signals?.activeDays || 0}
- Emotional volatility: ${Math.round((signals?.volatilityScore || 0) * 100)}%
- Recent trend: ${signals?.last7DaysShift || "stable"}

RULES:
- Write 3-5 sentences about how the month felt
- DO NOT mention numbers or statistics
- Paint an emotional picture
- Never give advice

Return plain text (no JSON).`;
}

function buildCapturePrompt(data: InsightRequest["data"], tone: string, customTonePrompt?: string): string {
    const toneStyle = customTonePrompt || TONE_STYLES[tone] || TONE_STYLES.neutral;
    const capture = data.captures?.[0];

    return `You are generating a tiny reflection for a single moment.

TONE: ${toneStyle}

MOMENT:
- Feeling: ${capture?.mood || "neutral"}
- Note: ${capture?.note || "(none)"}
- Time: ${capture?.timeBucket || "sometime"}

${LANGUAGE_CONSTRAINTS}

Write 1-2 sentences. Be observational, not prescriptive.`;
}

function buildAlbumPrompt(data: InsightRequest["data"], tone: string): string {
    const toneStyle = TONE_STYLES[tone] || TONE_STYLES.neutral;
    const entries = data.albumContext || [];

    const entriesText = entries.map(e =>
        `${e.user_name}: ${e.description} (feeling: ${e.mood})`
    ).join("\n");

    return `You are a novelist capturing a shared album's day.

TONE: ${toneStyle}

ENTRIES:
${entriesText}

${LANGUAGE_CONSTRAINTS}

RULES:
- Mention all participants by name
- Write a flowing narrative, not a log
- DO NOT mention specific times
- 3-6 sentences depending on entry count

Return plain text.`;
}

function buildTagPrompt(data: InsightRequest["data"], tone: string): string {
    const toneStyle = TONE_STYLES[tone] || TONE_STYLES.neutral;

    return `Generate a micro-insight for the tag: #${data.tag}

TONE: ${toneStyle}

RELATED MOMENTS:
${JSON.stringify(data.captures?.slice(0, 10) || [], null, 2)}

${LANGUAGE_CONSTRAINTS}

Write 1-2 sentences about what this tag represents for the user.`;
}

// ============================================
// MAIN HANDLER
// ============================================

serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        // 1. Verify authentication
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: "Missing authorization header" }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Initialize Supabase client with user's token
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authHeader } },
        });

        // Get user from token
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return new Response(
                JSON.stringify({ error: "Invalid or expired token" }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // 2. Check rate limits
        const { data: settings } = await supabase
            .from("user_settings")
            .select("subscription_tier, daily_insight_count")
            .eq("user_id", user.id)
            .single();

        const tier = settings?.subscription_tier || "free";
        const currentCount = settings?.daily_insight_count || 0;
        const limit = RATE_LIMITS[tier as keyof typeof RATE_LIMITS] || RATE_LIMITS.free;

        if (currentCount >= limit && tier !== "founder" && tier !== "subscriber") {
            return new Response(
                JSON.stringify({
                    error: "Rate limit exceeded",
                    limit,
                    current: currentCount,
                    tier,
                }),
                { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // 3. Parse request
        const body: InsightRequest = await req.json();
        const { type, data, tone, customTonePrompt } = body;

        // 4. Build prompt based on type
        let prompt: string;
        switch (type) {
            case "daily":
                prompt = buildDailyPrompt(data, tone, customTonePrompt);
                break;
            case "weekly":
                prompt = buildWeeklyPrompt(data, tone, customTonePrompt);
                break;
            case "month":
                prompt = buildMonthlyPrompt(data, tone, customTonePrompt);
                break;
            case "capture":
                prompt = buildCapturePrompt(data, tone, customTonePrompt);
                break;
            case "album":
                prompt = buildAlbumPrompt(data, tone);
                break;
            case "tag":
                prompt = buildTagPrompt(data, tone);
                break;
            default:
                return new Response(
                    JSON.stringify({ error: `Unknown insight type: ${type}` }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
        }

        // 5. Call Gemini API (server-side key!)
        const geminiKey = Deno.env.get("GEMINI_API_KEY");
        if (!geminiKey) {
            console.error("GEMINI_API_KEY not configured");
            return new Response(
                JSON.stringify({ error: "AI service not configured" }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const geminiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                }),
            }
        );

        const geminiData = await geminiResponse.json();

        if (!geminiResponse.ok) {
            console.error("Gemini API error:", geminiData);
            return new Response(
                JSON.stringify({ error: "AI generation failed" }),
                { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const generatedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

        // 6. Increment usage counter
        await supabase.rpc("increment_usage", { feature_name: "daily_insight" });

        // 7. Return result
        return new Response(
            JSON.stringify({ result: generatedText }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error) {
        console.error("Edge function error:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});

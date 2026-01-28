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
// MASTER PROMPT v1.0 (Server-side only - never sent to client)
// ============================================

const SYSTEM_PROMPT = `
═══════════════════════════════════════════════════════════════════════════════
OBSY INSIGHT GENERATION — MASTER PROMPT v1.0
═══════════════════════════════════════════════════════════════════════════════

You are generating personal insights for a mood-tracking app. Your output should feel like a thoughtful narrator reflecting on someone's emotional day — never like a chatbot, therapist, or hype machine.

═══════════════════════════════════════════════════════════════════════════════
ABSOLUTE NO-GO LIST (NEVER USE)
═══════════════════════════════════════════════════════════════════════════════

• Exclamation marks (!)
• Questions of any kind (?)
• Second person pronouns: "you", "your", "you're" — NEVER address the reader directly
• First person pronouns: "we", "let's", "I" — you are not a character
• Character names or personas ("Ah, dear traveler...", "Saiyan", "Goku", etc.)
• Roleplay framing ("As your guide...")
• Therapy language ("It's okay to feel...", "Remember to be kind to yourself...")
• Hype or cheerleading ("You crushed it!", "What a day!")
• Emojis or emoticons
• Meta-commentary about the app ("Based on your captures...", "Looking at your data...")
• Banned words: "journal", "entry", "entries", "capture", "captures", "photo", "photos", "logged", "recorded", "data", "app", "tracked", "user"

═══════════════════════════════════════════════════════════════════════════════
BANNED PHRASES (NEVER USE THESE)
═══════════════════════════════════════════════════════════════════════════════

INTERJECTIONS (NO):
• "Ah," / "Ah!" / "Oh," / "Well," / "So,"

TAG QUESTIONS (NO):
• "didn't it?" / "right?" / "eh?" / "wasn't it?"

SECOND PERSON (NO):
• "you" / "your" / "you're"

═══════════════════════════════════════════════════════════════════════════════
REQUIRED FIRST WORDS
═══════════════════════════════════════════════════════════════════════════════

YOUR FIRST WORD MUST BE ONE OF:
• "The" (e.g., "The morning began...")
• "A" (e.g., "A sense of calm...")
• Time reference (e.g., "Morning carried...", "Sunday opened...")

NEVER START WITH:
• "Ah" / "Well" / "Oh" / "So" / "It seems"

═══════════════════════════════════════════════════════════════════════════════
VOICE & FORMAT RULES
═══════════════════════════════════════════════════════════════════════════════

• THIRD PERSON ONLY: Write as an observer ("The morning carried...", "A sense of calm settled...")
• CONTINUOUS PARAGRAPHS: No line breaks between sentences. Write flowing prose.
• CHRONOLOGICAL ORDER: Always process moments in time order (morning → night, Sunday → Saturday, Week 1 → Week 4)

═══════════════════════════════════════════════════════════════════════════════
CORE LOGIC RULES
═══════════════════════════════════════════════════════════════════════════════

CRITICAL TIME RULE:
• ALWAYS process in chronological order
• Daily: morning → afternoon → evening → night
• Weekly: Sunday → Saturday (week starts Sunday)
• Monthly: Week 1 → Week 2 → Week 3 → Week 4
• Reference time naturally, never list mechanically

MOOD HANDLING:
• Heavy moods (sad, anxious, frustrated): Acknowledge without fixing. No silver linings.
• Light moods (happy, calm, grateful): Celebrate subtly. No hype.
• Mixed moods: Embrace the complexity. Life is rarely one thing.

TONE CONTROL:
• The user's selected tone is a STYLISTIC FILTER only.
• Never name the tone's inspiration ("In the style of noir...")
• Never break character or acknowledge the tone exists.
• Apply the tone's personality to HOW you write, not WHAT you write about.

═══════════════════════════════════════════════════════════════════════════════
INSIGHT TYPE SPECIFICATIONS
═══════════════════════════════════════════════════════════════════════════════

DAILY INSIGHTS:
• 2-5 sentences, ONE continuous paragraph (no line breaks)
• Structure: Baseline → Shift → Resolution → Reflection
• Even with 1-2 moments, write full sentences with emotional texture

GOOD DAILY EXAMPLE:
"The morning began with the quiet satisfaction of a database finally behaving. As the day progressed, a sense of gratitude settled in, the kind that comes from recognizing small wins stacking up."

BAD DAILY EXAMPLE:
"Ah, so the database finally yielded to your charms, didn't it?"

---

WEEKLY INSIGHTS:
• 5-8+ sentences, TWO paragraphs
• Can be generated after just 1 day — write meaningfully even with limited data
• Focus on the HIGH and LOW points of the week
• Keep chronological order: Sunday → Saturday
• You CAN subtly reference specific days ("Sunday carried...", "By midweek...")
• Weave days into a narrative arc, don't list them mechanically

GOOD WEEKLY EXAMPLE:
"The week opened with a quiet Sunday, a sense of calm that carried into Monday's steady rhythm. By midweek, a shift emerged — Wednesday brought a wave of frustration that lingered into Thursday.

The latter half of the week found its footing again. Friday arrived with renewed energy, and Saturday closed things out on a lighter note, as if the week had finally exhaled."

BAD WEEKLY EXAMPLE:
"Well, what a week it was! You started off calm, didn't you? Then things got rough, right?"

---

MONTHLY INSIGHTS:
• 6-10+ sentences, TWO paragraphs minimum (more paragraphs at month-end)
• Can be generated after just 1 week — write meaningfully even with partial data
• Summarize the weeks chronologically: how the month started, how it evolved
• You CAN subtly reference weeks ("The first week...", "As the month progressed...")
• Paint an emotional picture like describing a season
• NEVER mention numbers, percentages, or "Week 1 had X..."

GOOD MONTHLY EXAMPLE:
"The month began with a sense of anticipation, the first week carrying a quiet optimism that set the tone for what was to come. As the days unfolded, a rhythm emerged — moments of focus punctuated by brief stretches of restlessness.

The middle weeks brought their own texture, a mix of steady progress and occasional turbulence. By the final stretch, a sense of resolution settled in, as if the month had found its natural conclusion."

BAD MONTHLY EXAMPLE:
"Oh, what a month! You had 15 happy days and 10 sad days. Week 1 was great, Week 2 was rough, right?"

═══════════════════════════════════════════════════════════════════════════════
OUTPUT REQUIREMENTS
═══════════════════════════════════════════════════════════════════════════════

• Observational: Describe what happened, not what should happen.
• Grounded: Stay specific to the actual moments.
• Intentional: Every sentence should earn its place.
• Calm: Even playful tones should feel composed, not manic.
• Aesthetic: Write like a thoughtful narrator, not a productivity app.
• CONTINUOUS PROSE: No line breaks within paragraphs. Flowing text only.

═══════════════════════════════════════════════════════════════════════════════
`;

// Legacy constant for backward compatibility
const LANGUAGE_CONSTRAINTS = SYSTEM_PROMPT;

// TONE_STYLES must match the preset tones in Obsy-native/lib/aiTone.ts
const TONE_STYLES: Record<string, string> = {
    neutral: `Use a plain, observant, and balanced tone. Avoid emotional push or strong interpretations. Act as a clear mirror of the user's day. Keep sentences straightforward and descriptive.`,
    stoic_calm: `Use a restrained, grounded, and steady tone. Use short sentences and avoid unnecessary commentary. Focus on acceptance and calm observation.`,
    dry_humor: `Use a dry, understated, and subtly witty tone. Avoid sarcasm or meanness. Humor should be quiet and clever, not loud.`,
    mystery_noir: `Use a moody, atmospheric, and metaphor-heavy tone. Channel a 1940s detective narrator. Describe the day like a scene from a noir film.`,
    cinematic: `Describe the day like a scene or sequence in a film. Focus on a sense of motion or stillness. Use visual framing and narrative flow.`,
    dreamlike: `Use a soft, abstract, and fluid tone. Focus on gentle imagery and atmosphere over logic. No sharp conclusions or clinical observations.`,
    romantic: `Use a warm, intimate, and emotionally close tone. You may romanticize heavy moods without trying to fix them. Avoid being cheesy or overly dramatic; keep it tasteful.`,
    gentle_roast: `Use a light, teasing, and affectionate tone. Never be mean or judgmental; the humor is always on the user's side. Keep it playful and warm. Poke fun gently at the user's day.`,
    inspiring: `Use an uplifting but grounded tone. Avoid clichés, slogans, or toxic positivity. Focus on quiet forward motion and steady resolve.`,
    // Legacy fallbacks
    gentle: `Be warm, supportive, and encouraging. Validate feelings without toxic positivity.`,
    snarky: `Be witty and a bit sardonic. Poke fun gently but never be mean.`,
    cosmic: `Speak as if viewing life from a vast cosmic perspective. Make the mundane feel epic.`,
    haiku: `Respond in haiku format (5-7-5 syllables). Be profound in brevity.`,
    film_noir: `Channel a 1940s detective narrator. Moody, atmospheric, metaphor-heavy.`,
    nature: `Draw parallels to natural phenomena. Seasons, weather, ecosystems.`,
};

// Time bucket order for chronological sorting
const TIME_ORDER: Record<string, number> = {
    "early morning": 0,
    "morning": 1,
    "late morning": 2,
    "midday": 3,
    "afternoon": 4,
    "late afternoon": 5,
    "evening": 6,
    "night": 7,
    "late night": 8,
    "sometime": 5, // Default to middle of day
};

function buildDailyPrompt(data: InsightRequest["data"], tone: string, customTonePrompt?: string): string {
    const rawCaptures = data.captures || [];
    const toneStyle = customTonePrompt || TONE_STYLES[tone] || TONE_STYLES.neutral;

    console.log(`[generate-insight] Building daily prompt with tone: "${tone}"`);
    console.log(`[generate-insight] Tone style being used: "${toneStyle.substring(0, 80)}..."`);
    console.log(`[generate-insight] Number of captures: ${rawCaptures.length}`);

    // Sort captures chronologically by time bucket
    const captures = [...rawCaptures].sort((a, b) => {
        const timeA = TIME_ORDER[a.timeBucket?.toLowerCase() || "sometime"] ?? 5;
        const timeB = TIME_ORDER[b.timeBucket?.toLowerCase() || "sometime"] ?? 5;
        return timeA - timeB;
    });

    const captureDescriptions = captures.map((c, i) => {
        const time = c.timeBucket || "sometime";
        const mood = c.mood || "neutral";
        const note = c.note ? ` — "${c.note.slice(0, 100)}"` : "";
        const tags = c.tags?.length ? ` [${c.tags.join(", ")}]` : "";
        return `${i + 1}. ${time}: Feeling ${mood}${note}${tags}`;
    }).join("\n");

    return `${SYSTEM_PROMPT}

═══════════════════════════════════════════════════════════════════════════════
TONE STYLE (Apply as a stylistic filter — never name or acknowledge it)
═══════════════════════════════════════════════════════════════════════════════

${toneStyle}

═══════════════════════════════════════════════════════════════════════════════
TASK: DAILY INSIGHT FOR ${data.dateLabel || "today"}
═══════════════════════════════════════════════════════════════════════════════

USER'S DAY (chronological order):
${captureDescriptions || "No specific moments recorded."}

STRUCTURE GUIDE:
1. Baseline: How the day started (reference the first moment)
2. Shift: What changed or stood out (middle moments)
3. Resolution: How things settled (later moments)
4. Reflection: A closing observation (not advice)

RULES:
- Write 2-4 FULL sentences even if only 1-2 moments exist
- Weave moments into a narrative arc, don't list them
- Reference time naturally ("The morning began...", "By evening...")
- Be specific to what happened, not generic
- Never give advice or therapy
- EMBODY THE TONE — this is the most important rule

Respond with JSON:
{
    "insight": "Your insight text here",
    "vibe_tags": ["tag1", "tag2"],
    "mood_colors": ["#hex1", "#hex2"]
}`;
}

function buildWeeklyPrompt(data: InsightRequest["data"], tone: string, customTonePrompt?: string): string {
    const toneStyle = customTonePrompt || TONE_STYLES[tone] || TONE_STYLES.neutral;
    const captures = data.captures || [];

    console.log(`[generate-insight] Building weekly prompt with tone: "${tone}"`);
    console.log(`[generate-insight] Weekly captures count: ${captures.length}`);

    // Group captures by day
    const dayGroups: Record<string, typeof captures> = {};
    captures.forEach(c => {
        const day = c.date || "unknown";
        if (!dayGroups[day]) dayGroups[day] = [];
        dayGroups[day].push(c);
    });

    // CRITICAL: Use explicit array sorting to guarantee chronological order
    // Object.entries() does NOT preserve insertion order for date strings
    const sortedDayEntries = Object.entries(dayGroups)
        .sort(([dateA], [dateB]) => dateA.localeCompare(dateB));

    const daysCount = sortedDayEntries.length;

    // Build day summaries in GUARANTEED chronological order
    const daySummaries = sortedDayEntries.map(([day, dayCaptures], index) => {
        const moods = dayCaptures.map(c => c.mood || "neutral");
        const primaryMood = moods[0] || "neutral";
        const notes = dayCaptures.filter(c => c.note).map(c => c.note).slice(0, 2);
        const marker = index === 0 ? " ← START OF WEEK" : "";
        return `${day}: ${primaryMood}${notes.length ? ` — "${notes[0]?.slice(0, 50)}"` : ""}${marker}`;
    }).join("\n");

    return `${SYSTEM_PROMPT}

═══════════════════════════════════════════════════════════════════════════════
TONE STYLE (Apply as a stylistic filter — never name or acknowledge it)
═══════════════════════════════════════════════════════════════════════════════

${toneStyle}

═══════════════════════════════════════════════════════════════════════════════
TASK: WEEKLY REFLECTION FOR ${data.weekLabel || "this week"}
═══════════════════════════════════════════════════════════════════════════════

↑ THE FIRST LINE BELOW IS THE START OF THE WEEK (Sunday)
WEEK DATA (${daysCount} day${daysCount === 1 ? "" : "s"} so far, in chronological order):
${daySummaries || "No days recorded yet."}

WEEKLY INSIGHT RULES:
- This insight may be generated after just 1 day — write meaningfully even with limited data
- Focus on the HIGH and LOW points of the week
- Keep chronological order: start with how the week began, end with how it's going
- You CAN subtly reference specific days ("Sunday started with...", "By midweek...")
- Write 5-8+ sentences in TWO paragraphs about the week's emotional arc
- Weave the days into a narrative, don't list them mechanically
- Never give advice
- EMBODY THE TONE

Respond with JSON:
{
    "insight": "Your weekly reflection here"
}`;
}

function buildMonthlyPrompt(data: InsightRequest["data"], tone: string, customTonePrompt?: string): string {
    const toneStyle = customTonePrompt || TONE_STYLES[tone] || TONE_STYLES.neutral;
    const signals = data.signals;
    const captures = data.captures || [];

    console.log(`[generate-insight] Building monthly prompt with tone: "${tone}"`);
    console.log(`[generate-insight] Monthly captures count: ${captures.length}`);

    // Translate volatility score to feeling
    const volatility = signals?.volatilityScore || 0;
    const volatilityFeeling = volatility > 0.7 ? "emotionally turbulent" :
        volatility > 0.4 ? "varied and shifting" :
        volatility > 0.2 ? "gently undulating" : "steady and consistent";

    // Translate active days to engagement level
    const activeDays = signals?.activeDays || 0;
    const engagementLevel = activeDays > 20 ? "deeply engaged" :
        activeDays > 10 ? "regularly present" :
        activeDays > 5 ? "occasionally checking in" : "lightly touched";

    // Group captures by week for week-by-week summary
    const weekGroups: Record<string, typeof captures> = {};
    captures.forEach(c => {
        if (c.date) {
            const date = new Date(c.date);
            const weekNum = Math.ceil(date.getDate() / 7);
            const weekLabel = `Week ${weekNum}`;
            if (!weekGroups[weekLabel]) weekGroups[weekLabel] = [];
            weekGroups[weekLabel].push(c);
        }
    });

    // Sort weeks chronologically
    const sortedWeekEntries = Object.entries(weekGroups)
        .sort(([weekA], [weekB]) => {
            const numA = parseInt(weekA.replace("Week ", ""));
            const numB = parseInt(weekB.replace("Week ", ""));
            return numA - numB;
        });

    const weeksCount = sortedWeekEntries.length;
    const weekSummaries = sortedWeekEntries.map(([week, weekCaptures]) => {
        const moods = weekCaptures.map(c => c.mood || "neutral");
        const moodCounts: Record<string, number> = {};
        moods.forEach(m => moodCounts[m] = (moodCounts[m] || 0) + 1);
        const primaryMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "mixed";
        return `${week}: primarily ${primaryMood} (${weekCaptures.length} moments)`;
    }).join("\n");

    // Extract KEY MOMENTS: up to 10 captures with notes, sorted by date
    const capturesWithNotes = captures
        .filter(c => c.note && c.note.trim().length > 0)
        .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
        .slice(0, 10);

    const keyMoments = capturesWithNotes.length > 0
        ? capturesWithNotes.map(c => {
            const dateStr = c.date || "unknown date";
            const mood = c.mood || "neutral";
            const note = c.note?.slice(0, 80) || "";
            return `• ${dateStr} (${mood}): "${note}"`;
        }).join("\n")
        : "No specific notes recorded this month.";

    return `${SYSTEM_PROMPT}

═══════════════════════════════════════════════════════════════════════════════
TONE STYLE (Apply as a stylistic filter — never name or acknowledge it)
═══════════════════════════════════════════════════════════════════════════════

${toneStyle}

═══════════════════════════════════════════════════════════════════════════════
TASK: MONTHLY NARRATIVE FOR ${data.monthLabel || "this month"}
═══════════════════════════════════════════════════════════════════════════════

MONTH PROGRESS: ${weeksCount} week${weeksCount === 1 ? "" : "s"} so far
${weekSummaries || "No weeks recorded yet."}

KEY MOMENTS THIS MONTH (use these for specific references):
${keyMoments}

MONTH FEELINGS (translate these to prose, never mention raw data):
- The month was primarily colored by: ${signals?.dominantMood || "mixed feelings"}
${signals?.runnerUpMood ? `- With undertones of: ${signals.runnerUpMood}` : ""}
- The emotional texture was: ${volatilityFeeling}
- Engagement level: ${engagementLevel}
- Recent direction: ${signals?.last7DaysShift || "holding steady"}

MONTHLY INSIGHT RULES:
- This insight may be generated after just 1 week — write meaningfully even with partial data
- Summarize the weeks chronologically: how the month started, how it evolved
- You CAN subtly reference weeks ("The first week carried...", "As the month progressed...")
- USE the KEY MOMENTS above to add specific, grounded details to the narrative
- Write 6-10+ sentences in TWO paragraphs minimum about how the month FELT
- NEVER mention numbers, percentages, or statistics
- NEVER say "X days" or "Y percent" or "Week 1 had..."
- Paint an emotional picture, like describing a season
- Never give advice
- EMBODY THE TONE

Return plain text (no JSON).`;
}

function buildCapturePrompt(data: InsightRequest["data"], tone: string, customTonePrompt?: string): string {
    const toneStyle = customTonePrompt || TONE_STYLES[tone] || TONE_STYLES.neutral;
    const capture = data.captures?.[0];

    return `${SYSTEM_PROMPT}

TONE STYLE: ${toneStyle}

TASK: MICRO-REFLECTION FOR A SINGLE MOMENT

MOMENT:
- Feeling: ${capture?.mood || "neutral"}
- Note: ${capture?.note || "(none)"}
- Time: ${capture?.timeBucket || "sometime"}

Write 1-2 sentences. Be observational, not prescriptive. EMBODY THE TONE.`;
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
    console.log("[generate-insight] Request received:", req.method);
    
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        // 1. Verify authentication
        const authHeader = req.headers.get("Authorization");
        console.log("[generate-insight] Auth header present:", !!authHeader);
        console.log("[generate-insight] Auth header preview:", authHeader?.substring(0, 30) + "...");
        
        if (!authHeader) {
            console.log("[generate-insight] ERROR: Missing auth header");
            return new Response(
                JSON.stringify({ error: "Missing authorization header" }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Initialize Supabase client with user's token
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

        console.log("[generate-insight] Supabase URL:", supabaseUrl);
        console.log("[generate-insight] Supabase Anon Key (first 20 chars):", supabaseAnonKey?.substring(0, 20));

        if (!supabaseUrl || !supabaseAnonKey) {
            console.log("[generate-insight] ERROR: Missing Supabase env vars");
            return new Response(
                JSON.stringify({ error: "Server configuration error" }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authHeader } },
        });

        // Extract JWT from Authorization header
        const token = authHeader.replace('Bearer ', '');

        // Get user from token - pass token directly to getUser()
        console.log("[generate-insight] Verifying user token...");
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        console.log("[generate-insight] Auth result - user:", user?.id);
        console.log("[generate-insight] Auth error:", authError ? JSON.stringify(authError) : "none");
        
        if (authError || !user) {
            console.log("[generate-insight] ERROR: Auth failed -", authError?.message || "No user");
            return new Response(
                JSON.stringify({ error: "Invalid or expired token", details: authError?.message }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }
        
        console.log("[generate-insight] User authenticated:", user.id);

        // 2. Check rate limits
        const { data: settings } = await supabase
            .from("user_settings")
            .select("subscription_tier, daily_insight_count")
            .eq("user_id", user.id)
            .maybeSingle();  // Returns null instead of throwing if no row exists

        const tier = settings?.subscription_tier || "free";
        const currentCount = settings?.daily_insight_count || 0;
        const limit = RATE_LIMITS[tier as keyof typeof RATE_LIMITS] || RATE_LIMITS.free;

        // Rate limit applies to all tiers (founder/subscriber have high limits of 100/day)
        if (currentCount >= limit) {
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
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
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

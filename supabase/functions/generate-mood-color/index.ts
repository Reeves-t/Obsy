// Supabase Edge Function: generate-mood-color
// Uses shared Claude-primary routing to assign a semantically appropriate two-tone gradient to a custom mood.
//
// Input:  { moodName: string }
// Output: { gradient_from: string, gradient_to: string }

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { runAiTextTask } from "../_shared/ai/router.ts";
import type { AiPostProcessResult } from "../_shared/ai/types.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

const SYSTEM_PROMPT = `You are a color designer for a mood-tracking app called Obsy.

Given a mood name, return exactly TWO hex colors that form a dual-tone pair for a 3D marble-effect orb.

Rules:
- "from" is the PRIMARY color (emotionally resonant, dominant in the marble blend). Vibrant, saturated.
- "to" is the SECONDARY color (the "undertone" or "shadow emotion" beneath the primary). Must create visible contrast.
- CRITICAL: The two colors MUST differ by at least 40 degrees on the color wheel. Never return two shades of the same hue. Light blue + dark blue is WRONG. The colors must be visually identifiable as DIFFERENT hues when blended.
- Think of the secondary as the emotional undercurrent: Anxious = electric violet (primary) + sickly yellow-green (secondary), Joyful = warm golden yellow (primary) + hot coral (secondary).
- Both colors should be emotionally accurate to the mood name.
- Match energy level: low-energy moods lean cooler (teal, blue, purple), high-energy lean warmer (orange, red, gold).
- Stay within the Obsy aesthetic: rich saturation but not neon (unless the mood is explicitly manic/intense).
- Both colors must be valid 6-digit hex codes starting with #.

Examples of GOOD pairs (notice STRONG hue shift, 40+ degrees):
- "Calm" → teal #7DD3C8 + sky blue #5BAED6 (teal to blue)
- "Creative" → amber #FCC832 + gold-orange #E8A820 (yellow to orange)
- "Melancholy" → orchid #9A7ED0 + deep violet #7660B8 (purple to violet)
- "Anxious" → electric violet #E050B0 + deep pink #C83898 (magenta to pink)
- "Joyful" → bright pink #F888C0 + hot pink #E060A0 (pink spectrum shift)

Examples of BAD pairs (same hue family, too similar):
- #4A7BA8 + #2C5A84 (both steel blue — no marble effect, WRONG)
- #66AA66 + #448844 (both green, just darker — boring, WRONG)
- #FF6B6B + #CC5555 (both red-coral, just lighter/darker — WRONG)

Respond with ONLY a JSON object, no markdown, no explanation:
{"from":"#XXXXXX","to":"#XXXXXX"}`;

serve(async (req: Request) => {
    const requestId = crypto.randomUUID();

    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        // 1. Authenticate user
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: "Missing authorization" }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_ANON_KEY") ?? "",
            { global: { headers: { Authorization: authHeader } } }
        );

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return new Response(
                JSON.stringify({ error: "Unauthorized" }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // 2. Parse request
        const { moodName } = await req.json();
        if (!moodName || typeof moodName !== "string" || moodName.trim().length === 0) {
            return new Response(
                JSON.stringify({ error: "moodName is required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const trimmedName = moodName.trim();
        console.log(`[generate-mood-color] Generating colors for: "${trimmedName}" (user: ${user.id})`);

        const prompt = `Mood name: "${trimmedName}"`;

        // 4. Parse the JSON response
        let parsed: { from?: string; to?: string } | null = null;
        const aiResult = await runAiTextTask({
            requestId,
            userId: user.id,
            feature: "generate_mood_color",
            task: "mood_color",
            prompt,
            systemPrompt: SYSTEM_PROMPT,
            inputMode: "text",
            responseFormat: "json",
            maxTokens: 300,
            temperature: 0.4,
            promptVersion: "generate_mood_color_v1",
            requestPayload: {
                mood_name: trimmedName,
            },
            postProcess: (rawText: string): AiPostProcessResult => {
                try {
                    const cleaned = rawText
                        .replace(/^```(?:json)?\s*\n?/i, "")
                        .replace(/\n?```\s*$/i, "")
                        .trim();
                    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
                    if (!jsonMatch) {
                        return {
                            ok: false,
                            stage: "parse",
                            message: "Failed to parse AI color response",
                            status: 502,
                        };
                    }
                    parsed = JSON.parse(jsonMatch[0]);
                    return { ok: true, text: jsonMatch[0] };
                } catch {
                    return {
                        ok: false,
                        stage: "parse",
                        message: "Failed to parse AI color response",
                        status: 502,
                    };
                }
            },
        });

        if (!aiResult.ok || !parsed) {
            console.error(`[generate-mood-color] [${requestId}] AI routing failed:`, aiResult.ok ? "missing parsed payload" : aiResult.message);
            return new Response(
                JSON.stringify({ error: aiResult.ok ? "Failed to parse AI color response" : aiResult.message }),
                { status: aiResult.ok ? 502 : aiResult.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // 5. Validate hex colors
        const gradientFrom = parsed.from?.trim();
        const gradientTo = parsed.to?.trim();

        if (!gradientFrom || !gradientTo || !HEX_RE.test(gradientFrom) || !HEX_RE.test(gradientTo)) {
            console.error(`[generate-mood-color] [${requestId}] Invalid hex colors:`, { gradientFrom, gradientTo });
            return new Response(
                JSON.stringify({ error: "AI returned invalid colors" }),
                { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        console.log(`[generate-mood-color] Generated: "${trimmedName}" → ${gradientFrom} → ${gradientTo}`);

        // 6. Return colors
        return new Response(
            JSON.stringify({ gradient_from: gradientFrom, gradient_to: gradientTo }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (err) {
        console.error("[generate-mood-color] Unexpected error:", err);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});

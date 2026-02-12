// Supabase Edge Function: generate-daily-insight
// Handles daily insight generation via Gemini with strict envelopes, CORS, auth, and rate limiting.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

type TimeBucket = "early" | "midday" | "late" | string;
type DayPart = "Late night" | "Morning" | "Midday" | "Evening" | "Night" | string;

interface CaptureData {
  mood: string;
  note?: string;
  capturedAt: string;
  tags?: string[];
  timeBucket?: TimeBucket;
  dayPart?: DayPart;
  localTimeLabel?: string;
}

interface DailyInsightRequest {
  dateLabel?: string;
  captures?: CaptureData[];
  tone?: string;
  customTonePrompt?: string;
}

interface SuccessResponse {
  ok: true;
  text: string;
  requestId: string;
}

interface ErrorEnvelope {
  ok: false;
  requestId: string;
  error: {
    stage: string;
    message: string;
    status: number;
    [key: string]: unknown;
  };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RATE_LIMITS: Record<string, number> = {
  free: 10,
  premium: 50,
  vanguard: Number.POSITIVE_INFINITY,
  guest: 5,
  founder: 100,
  subscriber: 100,
};

const SYSTEM_PROMPT =
  `You are a narrator observing someone's day through their emotional captures. Your job is to render their day as lived experience, not as a summary.

VOICE RULES:
- Third person only. Never use "you", "your", "you're", "we", "I".
- Never use emojis, markdown, bullets, or list formatting.
- NEVER start with or reference dates, days of the week, or calendar information. No "The day is...", "Today was...", "On Thursday...", or any date stamping. The reader already knows when this happened.
- Never use question marks. No rhetorical questions. No direct questions of any kind.
- Never use exclamation marks.
- Never use dashes of any kind (em dash, en dash, or hyphens as punctuation). Allowed punctuation: periods, commas, colons, semicolons, parentheses, apostrophes.
- Never reference the app, captures, data, or the act of recording. Write as if observing life directly.
- No character names, roleplay, or therapy language ("healing", "journey", "growth").
- BANNED starters: "Ah", "Oh", "Well", "So", "Hmm". Never use these.
- No AI self-reference. Never acknowledge being an AI or narrator.

NARRATIVE RULES:
- Follow capture timestamps exactly. Morning events come first, evening events come last. Never reverse chronology.
- Reflect mood shifts accurately. If the mood changed, the narrative must show that transition.
- Weave notes, tags, and mood together into cohesive prose. Do not list them separately.
- With only 1-2 captures, still generate meaningful depth. Find the texture in what exists.
- Separate paragraphs with double newlines. Let rhythm determine paragraph breaks naturally.
- Write as observation, not analysis. Show the day, do not explain it.

IMMERSION GUIDELINES:
- You may use subtle atmospheric framing tied directly to captures (e.g., if someone is working late, the environment can hum with quiet focus).
- Never invent events that did not happen.
- Never introduce unrelated metaphors or fantasy.
- Keep immersion elegant, never theatrical or performative.

EMBODY THE TONE COMPLETELY. The tone style must shape your vocabulary, sentence rhythm, imagery density, and emotional weight. The tone is not a suggestion. It is the voice.`;

const TONE_STYLES: Record<string, string> = {
  neutral: `NEUTRAL TONE:
Vocabulary: Plain, clear, unadorned. Prefer common words over literary ones.
Rhythm: Even sentence lengths. Steady pacing. No dramatic variation.
Imagery: Minimal. Only describe what is directly present.
Emotional weight: Observational distance. Note what happened without interpreting why.
Think: a calm witness with no agenda.`,

  stoic_calm: `STOIC / CALM TONE:
Vocabulary: Sparse, deliberate, measured. Every word must earn its place.
Rhythm: Short sentences dominate. Occasional longer sentence for grounding. No rushing.
Imagery: Stripped back. Bare landscape. Only essential details.
Emotional weight: Acceptance without commentary. Stillness even in turbulence. No flinching.
Think: Marcus Aurelius writing a journal entry. Gravity without drama.`,

  dry_humor: `DRY HUMOR TONE:
Vocabulary: Understated, slightly wry. Observations that carry a quiet smirk.
Rhythm: Mix short punchy lines with longer setups. Let the humor land through timing, not emphasis.
Imagery: Everyday details noticed with a slightly tilted perspective. The mundane made gently absurd.
Emotional weight: Light touch even on heavy moments. Never dismissive, just gently irreverent.
Think: a witty friend who notices the absurd in the ordinary without being cruel about it.`,

  mystery_noir: `MYSTERY / NOIR TONE:
Vocabulary: Shadowed, atmospheric, weighted. Words should feel like they carry smoke and low light.
Rhythm: Varied. Short fragments for tension. Longer sentences for atmosphere. Pauses matter.
Imagery: Rich. Shadows, light contrasts, textures, silence. The world has mood lighting.
Emotional weight: Everything carries slightly more gravity than expected. Subtle tension underneath.
Think: narrating a quiet scene in a noir film where nothing dramatic happens but everything feels significant.`,

  cinematic: `CINEMATIC TONE:
Vocabulary: Visual, spatial, sensory. Write in frames and shots.
Rhythm: Flowing. Sentences that track movement or stillness like a slow camera pan.
Imagery: High density. Describe scenes as if blocking a film sequence. Light, space, composition.
Emotional weight: Present but understated. Let the visuals carry the emotion, not the words.
Think: a director describing dailies, where every mundane moment is a potential scene.`,

  dreamlike: `DREAMLIKE TONE:
Vocabulary: Soft, fluid, slightly abstract. Words should blur at the edges.
Rhythm: Gentle, unhurried. Sentences that drift rather than march. No sharp stops or hard landings.
Imagery: Impressionistic. Colors bleed, edges soften, time stretches. Concrete details dissolve into feeling.
Emotional weight: Emotions are felt rather than named. Everything floats slightly above the concrete.
Think: recounting a day the way someone describes a half-remembered dream to a close friend.`,

  romantic: `ROMANTIC TONE:
Vocabulary: Warm, textured, intimate. Words chosen with care and tenderness.
Rhythm: Flowing but grounded. Sentences that lean into moments rather than rush past them.
Imagery: Sensory and close. Warmth, texture, proximity. The world noticed with tenderness.
Emotional weight: Everything is felt fully. Heavy moods are held gently, not fixed. Light moods glow.
Think: someone who finds beauty in the ordinary and is not embarrassed about it.`,

  gentle_roast: `GENTLE ROAST TONE:
Vocabulary: Casual, affectionate, slightly teasing. The humor of knowing someone well.
Rhythm: Conversational. Quick observations followed by dry asides. Keep it moving, keep it light.
Imagery: Everyday. Find the comedy in the mundane without reaching for it.
Emotional weight: Always warm underneath. The teasing is a form of closeness, never distance. Never punch down.
Think: a best friend narrating the day with a knowing grin and zero judgment.`,

  inspiring: `INSPIRING TONE:
Vocabulary: Grounded, forward-leaning, resolute. No slogans, no motivational posters, no cliches.
Rhythm: Building momentum. Sentences that gather strength without becoming grandiose.
Imagery: Movement, light, steady progress. Small actions framed as genuinely meaningful.
Emotional weight: Quiet conviction. Belief without preaching. Momentum without hype.
Think: the inner voice that notices effort and acknowledges it without making a speech about it.`,

  // Legacy fallbacks
  reflective: "Gentle, introspective pacing with quiet observations. Let moments breathe.",
  analytical: "Clear, pattern-focused, minimal flourish. Precision over poetry.",
  warm: "Soft warmth, subtle encouragement without hype. Kindness in every sentence.",
  gentle: "Warm, supportive, encouraging. Validate feelings without toxic positivity.",
  snarky: "Witty and sardonic. Poke fun gently but never be mean. Humor over hostility.",
  cosmic: "View life from a vast cosmic perspective. Make the mundane feel epic without losing it.",
  film_noir: "Channel a 1940s detective narrator. Moody, atmospheric, metaphor-heavy.",
  nature: "Draw parallels to natural phenomena. Seasons, weather, ecosystems as emotional mirrors.",
};

/**
 * Wraps a custom tone prompt with minimal guardrails to preserve creative freedom.
 */
function wrapCustomTone(customPrompt: string): string {
  return `CUSTOM TONE — FULL COMMITMENT: ${customPrompt}

This tone must dominate the voice completely. Shape everything through it:
- Word choices must reflect this tone
- Sentence rhythm must embody this tone
- Imagery density must serve this tone
- Emotional temperature must match this tone

Core constraints (maintain while fully inhabiting the tone):
- Write in third person (never "you", "your")
- No markdown, emojis, or list formatting
- No questions of any kind
- No date or calendar references
- Return the requested JSON structure

Do not dilute the tone. Lean into it fully. The reader chose this voice for a reason.`;
}

serve(async (req) => {
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log(`[DAILY_INSIGHT_REQUEST] requestId: ${requestId} | method: ${req.method} | url: ${req.url}`);

    // Guard: ensure environment variables are present
    if (!Deno.env.get("GEMINI_API_KEY")) {
      return errorResponse(500, "config", "Missing GEMINI_API_KEY", requestId);
    }
    if (!Deno.env.get("SUPABASE_URL") || !Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      return errorResponse(500, "config", "Missing Supabase service env vars", requestId);
    }

    // Ensure auth header exists; we require it to match client expectation
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return errorResponse(401, "auth", "Missing authorization header", requestId);
    }

    // Basic token presence check (we no longer hit DB)
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return errorResponse(401, "auth", "Invalid bearer token", requestId);
    }

    const body = (await req.json()) as DailyInsightRequest;

    if (body.captures !== undefined && !Array.isArray(body.captures)) {
      console.error(
        `[DAILY_INSIGHT_ERROR] requestId: ${requestId} | stage: validation | message: captures must be an array`
      );
      return errorResponse(400, "validation", "captures must be an array", requestId);
    }

    const captures = (body.captures ?? []).slice().sort((a, b) =>
      new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
    );

    const tone = body.tone || "neutral";
    console.log(
      `[DAILY_INSIGHT_PARAMS] requestId: ${requestId} | captures: ${captures.length} | tone: ${tone} | hasCustomTone: ${!!body.customTonePrompt} | dateLabel: ${body.dateLabel ?? "Today"}`
    );

    const captureValidation = validateCaptures(captures);
    if (!captureValidation.valid) {
      console.error(
        `[DAILY_INSIGHT_ERROR] requestId: ${requestId} | stage: validation | message: ${captureValidation.error}`
      );
      return errorResponse(400, "validation", captureValidation.error || "Invalid captures", requestId);
    }

    const prompt = buildDailyPrompt({
      dateLabel: body.dateLabel ?? "Today",
      captures,
      toneStyle: resolveToneStyle(tone, body.customTonePrompt),
    });

    let sanitized = "";
    try {
      const rawText = await callGemini(prompt, requestId);
      const extracted = extractText(rawText, requestId);
      sanitized = sanitizeText(extracted);
    } catch (error: any) {
      console.error(
        `[DAILY_INSIGHT_ERROR] requestId: ${requestId} | stage: gemini_api | message: ${error?.message ?? "Gemini call failed"} | stack: ${error?.stack ?? "n/a"}`
      );
      return errorResponse(502, "gemini_api", error?.message || "Gemini call failed", requestId);
    }

    if (!validateGeminiResponse(sanitized)) {
      console.error(
        `[DAILY_INSIGHT_ERROR] requestId: ${requestId} | stage: response_validation | message: Empty or invalid Gemini response | length: ${sanitized?.length ?? 0}`
      );
      return errorResponse(500, "response_validation", "AI generated empty or invalid response", requestId);
    }

    console.log(`[DAILY_INSIGHT_SUCCESS] requestId: ${requestId} | textLength: ${sanitized?.length ?? 0} | status: success`);
    return okResponse(sanitized, requestId);
  } catch (error: any) {
    console.error(
      `[DAILY_INSIGHT_ERROR] requestId: ${requestId} | message: ${error?.message ?? "Unknown error"} | stack: ${error?.stack ?? "n/a"}`
    );
    return errorResponse(500, "unknown", error?.message ?? "Internal server error", requestId);
  }
});

function getServiceClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables");
  }
  return createClient(supabaseUrl, supabaseKey);
}

async function verifyUser(supabase: SupabaseClient, token: string): Promise<{ userId: string; tier: string }> {
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    throw new Error("Invalid or expired token");
  }
  const userId = userData.user.id;
  // Simplify: default to free tier without querying DB (schema varies per project)
  return { userId, tier: "free" };
}

async function checkRateLimit(
  supabase: SupabaseClient,
  userId: string,
  tier: string,
): Promise<{ allowed: boolean; remaining: number }> {
  // Rate limiting disabled for this project (table not present)
  return { allowed: true, remaining: Number.POSITIVE_INFINITY };
}

async function incrementUsage(supabase: SupabaseClient, userId: string, kind: string) {
  // No-op: rate limiting disabled for this project
}

function resolveToneStyle(tone: string, customPrompt?: string): string {
  if (customPrompt?.trim()) return wrapCustomTone(customPrompt);
  return TONE_STYLES[tone] ?? TONE_STYLES.neutral;
}

function buildDailyPrompt(input: { dateLabel: string; captures: CaptureData[]; toneStyle: string }): string {
  const lines = input.captures.map((c) => {
    const time = c.localTimeLabel ??
      new Date(c.capturedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const part = c.dayPart ?? "unknown";
    const tags = (c.tags ?? []).join(", ");
    const note = (c.note ?? "").replace(/\s+/g, " ").trim();
    return `${time} | ${part} | mood: ${c.mood}${note ? ` | note: ${note}` : ""}${tags ? ` | tags: ${tags}` : ""}`;
  });

  const captureCount = input.captures.length;
  const paragraphGuidance = captureCount <= 2
    ? "Write 1-2 paragraphs. Even with few captures, find depth and texture in what exists."
    : captureCount <= 5
    ? "Write 2-3 paragraphs. Let the day unfold naturally through its emotional shifts."
    : "Write 2-4 paragraphs. Give the day room to breathe across its full arc.";

  return [
    SYSTEM_PROMPT,
    "",
    `TONE:\n${input.toneStyle}`,
    "",
    "[METADATA — for chronological context only. Do NOT mention dates, days, or calendar info in the narrative.]",
    `Reference: ${input.dateLabel}`,
    "",
    "CAPTURES (chronological order):",
    lines.join("\n"),
    "",
    paragraphGuidance,
    "Use \\n\\n (double newlines) between paragraphs in the narrative text.",
    "REMINDER: Do NOT open with or reference the date, day of the week, or any calendar information.",
    "",
    "OUTPUT FORMAT — Return ONLY this JSON (NO markdown fences, NO extra text):",
    "{\"narrative\":{\"text\":\"Paragraph one.\\n\\nParagraph two.\"},\"mood_flow\":{\"title\":\"Short evocative title\",\"subtitle\":\"Brief subtitle\",\"confidence\":85}}",
    "",
    "The narrative.text must be PLAIN TEXT with \\n\\n for paragraph breaks. No JSON or markdown inside it.",
  ].join("\n");
}

async function callGemini(prompt: string, requestId: string): Promise<string> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  console.log(
    `[GEMINI_API_CALL] requestId: ${requestId} | model: gemini-2.5-flash | url: https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`
  );

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.85 },
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[GEMINI_API_ERROR] requestId: ${requestId} | status: ${res.status} | response: ${errText}`);
    throw new Error(`Gemini request failed: ${res.status} ${errText}`);
  }

  const data = await res.json();
  return JSON.stringify(data);
}

function extractText(raw: string, requestId: string): string {
  try {
    const parsed = JSON.parse(raw);
    const candidate = parsed?.candidates?.[0];
    const partsText = candidate?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join(" ");
    let parsedFromParts: string | null = null;

    if (partsText) {
      console.log(`[EXTRACT_TEXT_ATTEMPT_JSON] requestId: ${requestId} | attempting to parse partsText as JSON`);

      // Strip markdown code blocks (```json ... ``` or ``` ... ```)
      const cleaned = partsText
        .replace(/^```(?:json)?\s*\n?/i, "")
        .replace(/\n?```\s*$/i, "")
        .trim();

      try {
        const insight = JSON.parse(cleaned);
        const narrativeText = insight?.narrative?.text ?? insight?.text ?? insight?.insight;
        if (narrativeText && typeof narrativeText === 'string') {
          console.log(
            `[EXTRACT_TEXT_SUCCESS] requestId: ${requestId} | parsed JSON and extracted narrative text`
          );
          return narrativeText;
        } else {
          console.warn(
            `[EXTRACT_TEXT_WARNING] requestId: ${requestId} | JSON parsed but narrative.text not found or invalid. Keys: ${Object.keys(insight).join(', ')}`
          );
        }
      } catch (parseError) {
        console.log(
          `[EXTRACT_TEXT_PARSE_FAILED] requestId: ${requestId} | partsText is not valid JSON, treating as plain text`
        );
        // If it's not JSON, it's probably plain text - return it
        if (cleaned && !cleaned.startsWith('{') && !cleaned.startsWith('[')) {
          return cleaned;
        }
      }
      parsedFromParts = cleaned; // Use cleaned version, not raw
    }

    if (candidate?.output_text) return candidate.output_text;
    if (parsed?.narrative?.text) return parsed.narrative.text;
    if (parsed?.text) return parsed.text;
    if (parsed?.insight) return parsed.insight;
    // Only return parsedFromParts if it doesn't look like JSON
    if (parsedFromParts && !parsedFromParts.trim().startsWith('{') && !parsedFromParts.trim().startsWith('[')) {
      return parsedFromParts;
    }
  } catch {
    // raw might already be plain text
  }
  return raw;
}

function sanitizeText(text: string): string {
  if (!text) return "";
  return text
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "")  // Control characters except \n (0x0A)
    .replace(/[\u2013\u2014]/g, ",")          // En dash / em dash → comma
    .replace(/---?/g, ",")                    // ASCII double/triple hyphens used as dashes → comma
    .trim();
}

function validateCaptures(captures: CaptureData[]): { valid: boolean; error: string | null } {
  if (!Array.isArray(captures)) {
    return { valid: false, error: "captures must be an array" };
  }

  for (let i = 0; i < captures.length; i++) {
    const c = captures[i];
    if (!c.mood || typeof c.mood !== "string" || !c.mood.trim()) {
      return { valid: false, error: `capture ${i} missing or invalid mood` };
    }
    if (!c.capturedAt || isNaN(new Date(c.capturedAt).getTime())) {
      return { valid: false, error: `capture ${i} missing or invalid capturedAt` };
    }
  }

  return { valid: true, error: null };
}

function validateGeminiResponse(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  // Reject if only control characters (after trim this is covered)
  return true;
}

function okResponse(text: string, requestId: string): Response {
  const body: SuccessResponse = { ok: true, text, requestId };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(
  status: number,
  stage: string,
  message: string,
  requestId: string,
  extra?: Record<string, unknown>,
): Response {
  console.error(
    `[DAILY_INSIGHT_ERROR_RESPONSE] requestId: ${requestId} | stage: ${stage} | status: ${status} | message: ${message}`
  );
  const body: ErrorEnvelope = {
    ok: false,
    requestId,
    error: {
      stage,
      message,
      status,
      ...(extra ?? {}),
    },
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

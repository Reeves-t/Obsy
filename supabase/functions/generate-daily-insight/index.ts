// Supabase Edge Function: generate-daily-insight
// Handles daily insight generation via Gemini with strict envelopes, CORS, auth, and rate limiting.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { runAiTextTask } from "../_shared/ai/router.ts";
import type { AiPostProcessResult } from "../_shared/ai/types.ts";

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
  mood_flow?: any; // Mood flow data from AI
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
- PARAGRAPH STRUCTURE: Each paragraph must be exactly 2-3 sentences. Never write a paragraph longer than 3 sentences.
- BLENDING: When many captures share similar moods or routine moments, blend them into a single flowing observation rather than narrating each one individually. Only spotlight specific captures when they carry notable detail (a unique note, a strong mood shift, or meaningful tags).

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
- Each paragraph must be 2-3 sentences max. Blend similar captures together rather than narrating each one.
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
    let moodFlow: any = null;
    const aiResult = await runAiTextTask({
      requestId,
      feature: "generate_daily_insight",
      task: "daily_insight",
      prompt,
      inputMode: "text",
      responseFormat: "json",
      maxTokens: 1400,
      temperature: 0.85,
      promptVersion: "generate_daily_insight_v1",
      requestPayload: {
        tone,
        has_custom_tone: Boolean(body.customTonePrompt),
        capture_count: captures.length,
        date_label: body.dateLabel ?? "Today",
      },
      postProcess: (rawText: string): AiPostProcessResult => {
        const parsed = extractTextAndMoodFlow(rawText, requestId);
        const text = sanitizeText(parsed.text);
        if (!text) {
          return {
            ok: false,
            stage: "validate",
            message: "AI generated empty or invalid response",
            status: 500,
          };
        }
        moodFlow = parsed.moodFlow;
        return { ok: true, text };
      },
    });

    if (!aiResult.ok) {
      console.error(
        `[DAILY_INSIGHT_ERROR] requestId: ${requestId} | stage: ai_router | message: ${aiResult.message}`
      );
      return errorResponse(aiResult.status, aiResult.stage, aiResult.message, requestId);
    }

    sanitized = aiResult.text;

    if (!validateGeminiResponse(sanitized)) {
      console.error(
        `[DAILY_INSIGHT_ERROR] requestId: ${requestId} | stage: response_validation | message: Empty or invalid Gemini response | length: ${sanitized?.length ?? 0}`
      );
      return errorResponse(500, "response_validation", "AI generated empty or invalid response", requestId);
    }

    console.log(`[DAILY_INSIGHT_SUCCESS] requestId: ${requestId} | textLength: ${sanitized?.length ?? 0} | hasMoodFlow: ${!!moodFlow} | status: success`);
    return okResponse(sanitized, moodFlow, requestId);
  } catch (error: any) {
    console.error(
      `[DAILY_INSIGHT_ERROR] requestId: ${requestId} | message: ${error?.message ?? "Unknown error"} | stack: ${error?.stack ?? "n/a"}`
    );
    return errorResponse(500, "unknown", error?.message ?? "Internal server error", requestId);
  }
});

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
    ? "Write 1-2 short paragraphs (2-3 sentences each). Even with few captures, find depth and texture in what exists."
    : captureCount <= 4
    ? "Write 2 paragraphs (2-3 sentences each). Let the day unfold naturally through its emotional shifts."
    : "Write exactly 3 paragraphs, each 2-3 sentences long, separated by double newlines. Blend similar moods and routine captures together rather than describing each one. Only spotlight a specific capture when it carries notable detail or a clear mood shift. The result should feel like a cohesive reflection, not a play-by-play.";

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
    "CRITICAL OUTPUT FORMAT:",
    "Return ONLY this JSON structure (NO markdown fences, NO extra text):",
    "{",
    "  \"narrative\":{\"text\":\"Paragraph one.\\n\\nParagraph two.\"},",
    "  \"mood_flow\":{",
    "    \"title\":\"Short evocative title (2-4 words)\",",
    "    \"subtitle\":\"Original descriptive sentence about the day's emotional arc (NOT the journal quote)\",",
    "    \"confidence\":85,",
    "    \"segments\":[",
    "      {\"mood\":\"calm\",\"percentage\":60,\"color\":\"#6BA5D4\"},",
    "      {\"mood\":\"anxious\",\"percentage\":40,\"color\":\"#D946A6\"}",
    "    ]",
    "  }",
    "}",
    "",
    "MOOD FLOW REQUIREMENTS:",
    "- title: Short, poetic phrase capturing the day (e.g., \"quiet unraveling\", \"steady momentum\")",
    "- subtitle: YOUR OWN UNIQUE SENTENCE about the emotional pattern. NEVER copy journal text. Be creative and descriptive.",
    "- segments: List moods from captures with their percentages (must sum to 100) and hex colors",
    "- For CUSTOM moods (not standard moods), generate an appropriate hex color based on the mood's emotional tone",
    "- confidence: 0-100 score of how well you understand the day",
    "",
    "IMPORTANT: The narrative.text field must contain PLAIN TEXT with \\n\\n for paragraph breaks. No JSON or markdown inside it.",
    "The text should be a flowing narrative, not JSON data.",
  ].join("\n");
}

function extractTextAndMoodFlow(raw: string, requestId: string): { text: string; moodFlow: any | null } {
  const cleaned = raw
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  try {
    const insight = JSON.parse(cleaned);
    const narrativeText = insight?.narrative?.text ?? insight?.text ?? insight?.insight;
    const moodFlow = insight?.mood_flow ?? null;

    if (narrativeText && typeof narrativeText === "string") {
      console.log(
        `[EXTRACT_TEXT_SUCCESS] requestId: ${requestId} | parsed JSON and extracted narrative text | hasMoodFlow: ${!!moodFlow}`
      );
      return { text: narrativeText, moodFlow };
    }
  } catch {
    if (cleaned && !cleaned.startsWith("{") && !cleaned.startsWith("[")) {
      return { text: cleaned, moodFlow: null };
    }
  }

  return { text: "", moodFlow: null };
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

function okResponse(text: string, moodFlow: any | null, requestId: string): Response {
  const body: SuccessResponse = { ok: true, text, requestId };
  if (moodFlow) {
    body.mood_flow = moodFlow;
  }
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

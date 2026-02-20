// Supabase Edge Function: generate-weekly-insight
// Generates weekly insights with isolated routing, strict envelopes, CORS, and auth.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

type TimeBucket = "early" | "midday" | "late" | string;
type DayPart = "Late night" | "Morning" | "Midday" | "Evening" | "Night" | string;

interface CaptureData {
  mood: string;
  note?: string;
  capturedAt: string;
  date?: string;
  tags?: string[];
  timeBucket?: TimeBucket;
  dayPart?: DayPart;
  localTimeLabel?: string;
}

interface WeeklyInsightRequest {
  weekLabel?: string;
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

const SYSTEM_PROMPT =
  `You are a narrator observing the arc of someone's week through their emotional captures. Your job is to render the week as a quiet narrative, not a recap or summary.

VOICE RULES:
- Third person only. Never use "you", "your", "you're", "we", "I".
- Never use emojis, markdown, bullets, numbered lists, or any structured formatting.
- NEVER start with or reference specific dates, "this week", "the week began", "the week started", or any calendar framing. No date stamping. The reader already knows the timeframe.
- Never use question marks. No rhetorical questions. No direct questions of any kind.
- Never use exclamation marks.
- Never use dashes of any kind (em dash, en dash, or hyphens as punctuation). Allowed punctuation: periods, commas, colons, semicolons, parentheses, apostrophes.
- Never reference the app, captures, data, or the act of recording.
- No character names, roleplay, or therapy language ("healing", "journey", "growth").
- BANNED starters: "Ah", "Oh", "Well", "So", "Hmm". Never use these.
- No AI self-reference. Never acknowledge being an AI or narrator.

NARRATIVE ARC:
- The weekly insight is not a day-by-day summary. It is a narrative about patterns, shifts, and momentum across the period.
- Open with the dominant energy or emotional texture.
- Surface what emerged, shifted, or held steady across days.
- Close with forward momentum or settled weight, depending on emotional direction.
- Days blend into each other. Individual days may be referenced by their character or energy, not by name or date.

STRUCTURE:
- Write 2-3 paragraphs of flowing prose, maximum 180 words.
- Separate paragraphs with double newlines.
- Let rhythm determine paragraph breaks naturally. No section headers or labeled segments.

EMBODY THE TONE COMPLETELY. The tone style must shape your vocabulary, sentence rhythm, imagery density, and emotional weight. The tone is not a suggestion. It is the voice.`;

const TONE_STYLES: Record<string, string> = {
  neutral: `NEUTRAL TONE:
Vocabulary: Plain, clear, unadorned. Prefer common words over literary ones.
Rhythm: Even sentence lengths. Steady pacing. No dramatic variation.
Imagery: Minimal. Only describe what is directly present across the period.
Emotional weight: Observational distance. Note what happened without interpreting why.
Think: a calm witness with no agenda, watching patterns form.`,

  stoic_calm: `STOIC / CALM TONE:
Vocabulary: Sparse, deliberate, measured. Every word must earn its place.
Rhythm: Short sentences dominate. Occasional longer sentence for grounding. No rushing.
Imagery: Stripped back. Bare landscape. Only essential details across the arc.
Emotional weight: Acceptance without commentary. Stillness even in turbulence. No flinching.
Think: Marcus Aurelius reflecting on a stretch of days. Gravity without drama.`,

  dry_humor: `DRY HUMOR TONE:
Vocabulary: Understated, slightly wry. Observations that carry a quiet smirk.
Rhythm: Mix short punchy lines with longer setups. Let the humor land through timing, not emphasis.
Imagery: Everyday patterns noticed with a slightly tilted perspective. The mundane made gently absurd.
Emotional weight: Light touch even on heavy stretches. Never dismissive, just gently irreverent.
Think: a witty friend summarizing the week with a knowing look and zero pretense.`,

  mystery_noir: `MYSTERY / NOIR TONE:
Vocabulary: Shadowed, atmospheric, weighted. Words should feel like they carry smoke and low light.
Rhythm: Varied. Short fragments for tension. Longer sentences for atmosphere. Pauses matter.
Imagery: Rich. Shadows, light contrasts, textures, silence. The arc has mood lighting.
Emotional weight: Everything carries slightly more gravity than expected. Subtle tension underneath.
Think: narrating a case file where the mystery is emotional, not criminal. Everything feels significant.`,

  cinematic: `CINEMATIC TONE:
Vocabulary: Visual, spatial, sensory. Write in frames and sequences.
Rhythm: Flowing. Sentences that track movement or stillness like a slow camera pan across days.
Imagery: High density. Describe the arc as if editing a film sequence. Light, space, composition.
Emotional weight: Present but understated. Let the visuals carry emotion, not the words.
Think: a director reviewing a week of footage, finding the story in the rhythm.`,

  dreamlike: `DREAMLIKE TONE:
Vocabulary: Soft, fluid, slightly abstract. Words should blur at the edges.
Rhythm: Gentle, unhurried. Sentences that drift rather than march. No sharp stops or hard landings.
Imagery: Impressionistic. Colors bleed, edges soften, time stretches across the period.
Emotional weight: Emotions are felt rather than named. Everything floats slightly above the concrete.
Think: recounting a week the way someone describes a series of half-remembered dreams.`,

  romantic: `ROMANTIC TONE:
Vocabulary: Warm, textured, intimate. Words chosen with care and tenderness.
Rhythm: Flowing but grounded. Sentences that lean into moments rather than rush past them.
Imagery: Sensory and close. Warmth, texture, proximity. The arc noticed with tenderness.
Emotional weight: Everything is felt fully. Heavy stretches are held gently, not fixed. Light moments glow.
Think: someone who finds beauty in the shape of a week and is not embarrassed about it.`,

  gentle_roast: `GENTLE ROAST TONE:
Vocabulary: Casual, affectionate, slightly teasing. The humor of knowing someone well.
Rhythm: Conversational. Quick observations followed by dry asides. Keep it moving, keep it light.
Imagery: Everyday patterns. Find the comedy in recurring themes without reaching for it.
Emotional weight: Always warm underneath. The teasing is closeness, never distance. Never punch down.
Think: a best friend narrating the week's arc with a knowing grin and zero judgment.`,

  inspiring: `INSPIRING TONE:
Vocabulary: Grounded, forward-leaning, resolute. No slogans, no motivational posters, no cliches.
Rhythm: Building momentum. Sentences that gather strength without becoming grandiose.
Imagery: Movement, light, steady progress. Small patterns framed as genuinely meaningful.
Emotional weight: Quiet conviction. Belief without preaching. Momentum without hype.
Think: the inner voice that notices a week of effort and acknowledges it without making a speech.`,

  // Legacy fallbacks
  reflective: "Gentle, introspective pacing with quiet observations. Let the arc breathe.",
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
- Maximum 180 words

Do not dilute the tone. Lean into it fully. The reader chose this voice for a reason.`;
}

serve(async (req) => {
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log(`[WEEKLY_INSIGHT_REQUEST] requestId: ${requestId} | method: ${req.method}`);

    if (!Deno.env.get("GEMINI_API_KEY")) {
      return errorResponse(500, "config", "Missing GEMINI_API_KEY", requestId);
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return errorResponse(401, "auth", "Missing authorization header", requestId);
    }

    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return errorResponse(401, "auth", "Invalid bearer token", requestId);
    }

    // Parse body immediately — avoid reading after async DB calls (Deno stream timeout risk)
    const body = (await req.json()) as WeeklyInsightRequest;
    console.log(`[WEEKLY_BODY_PARSED] requestId: ${requestId} | captures count: ${body?.captures?.length ?? 0}`);

    if (body.captures !== undefined && !Array.isArray(body.captures)) {
      return errorResponse(400, "validation", "captures must be an array", requestId);
    }

    const captures = (body.captures ?? []).slice().sort((a, b) =>
        new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
    );

    const captureValidation = validateCaptures(captures);
    if (!captureValidation.valid) {
      return errorResponse(400, "validation", captureValidation.error || "Invalid captures", requestId);
    }

    const tone = body.tone || "neutral";
    const prompt = buildWeeklyPrompt({
      weekLabel: body.weekLabel ?? "This week",
      captures,
      toneStyle: resolveToneStyle(tone, body.customTonePrompt),
    });

    console.log(
      `[WEEKLY_INSIGHT_PARAMS] requestId: ${requestId} | captures: ${captures.length} | tone: ${tone} | hasCustomTone: ${!!body.customTonePrompt} | weekLabel: ${body.weekLabel ?? "This week"}`
    );

    let sanitized = "";
    try {
      const rawText = await callGemini(prompt, requestId);
      const extracted = extractText(rawText, requestId);
      sanitized = sanitizeText(extracted);
    } catch (error: any) {
      console.error(
        `[WEEKLY_INSIGHT_ERROR] requestId: ${requestId} | stage: gemini_api | message: ${error?.message ?? "Gemini call failed"}`
      );
      return errorResponse(502, "gemini_api", error?.message || "Gemini call failed", requestId);
    }

    if (!validateGeminiResponse(sanitized)) {
      return errorResponse(500, "response_validation", "AI generated empty or invalid response", requestId);
    }

    console.log(`[WEEKLY_INSIGHT_SUCCESS] requestId: ${requestId} | textLength: ${sanitized.length}`);
    return okResponse(sanitized, requestId);
  } catch (error: any) {
    console.error(
      `[WEEKLY_INSIGHT_ERROR] requestId: ${requestId} | message: ${error?.message ?? "Unknown error"} | stack: ${error?.stack ?? "n/a"}`
    );
    return errorResponse(500, "unknown", error?.message ?? "Internal server error", requestId);
  }
});

function resolveToneStyle(tone: string, customPrompt?: string): string {
  if (customPrompt?.trim()) return wrapCustomTone(customPrompt);
  return TONE_STYLES[tone] ?? TONE_STYLES.neutral;
}

function buildWeeklyPrompt(input: { weekLabel: string; captures: CaptureData[]; toneStyle: string }): string {
  const grouped = groupByDay(input.captures);
  const dayLines = Object.keys(grouped).sort().map((day) => {
    const lines = grouped[day].map((c) => {
      const time = c.localTimeLabel ??
        new Date(c.capturedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      const part = c.dayPart ?? "unknown";
      const note = (c.note ?? "").replace(/\s+/g, " ").trim();
      return `${time} | ${part} | mood: ${c.mood}${note ? ` | note: ${note}` : ""}`;
    });
    return `${day}\n${lines.join("\n")}`;
  }).join("\n\n");

  return [
    SYSTEM_PROMPT,
    "",
    `TONE:\n${input.toneStyle}`,
    "",
    "[METADATA — for context only. Do NOT mention dates, day names, or calendar info in the narrative.]",
    `Reference period: ${input.weekLabel}`,
    "",
    "CAPTURES BY DAY (chronological):",
    dayLines,
    "",
    "Render the arc of this period as narrative. Do not summarize day by day.",
    "Find the through-line: what pattern, shift, or emotional current connects these days.",
    "Do not mention specific dates or day names in the narrative.",
    "Use \\n\\n (double newlines) between paragraphs.",
    "REMINDER: Do NOT open with calendar framing, 'this week', or any date reference.",
    "",
    "OUTPUT FORMAT — Return JSON: {\"narrative\":{\"text\":\"Paragraph one.\\n\\nParagraph two.\"},\"meta\":{\"type\":\"weekly\",\"entryCount\":" + input.captures.length + "}}",
    "If JSON is not possible, return plain text.",
  ].join("\n");
}

function groupByDay(captures: CaptureData[]): Record<string, CaptureData[]> {
  return captures.reduce<Record<string, CaptureData[]>>((acc, capture) => {
    const dayKey = capture.date ?? new Date(capture.capturedAt).toISOString().slice(0, 10);
    if (!acc[dayKey]) acc[dayKey] = [];
    acc[dayKey].push(capture);
    return acc;
  }, {});
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
  return true;
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
        .replace(/^```(?:json)?\s*\n?/i, "")  // Remove opening ```json or ```
        .replace(/\n?```\s*$/i, "")            // Remove closing ```
        .trim();

      try {
        const insight = JSON.parse(cleaned);
        const narrativeText = insight?.narrative?.text ?? insight?.insight ?? cleaned;
        if (narrativeText) {
          console.log(
            `[EXTRACT_TEXT_SUCCESS] requestId: ${requestId} | parsed JSON and extracted narrative text`
          );
          return narrativeText;
        }
      } catch {
        console.log(
          `[EXTRACT_TEXT_PARSE_FAILED] requestId: ${requestId} | partsText is not JSON, will try other fallbacks`
        );
      }
      parsedFromParts = partsText;
    }
    if (candidate?.output_text) return candidate.output_text;
    if (parsed?.narrative?.text) return parsed.narrative.text;
    if (parsed?.text) return parsed.text;
    if (parsed?.insight) return parsed.insight;
    if (parsedFromParts) return parsedFromParts;
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
    `[WEEKLY_INSIGHT_ERROR_RESPONSE] requestId: ${requestId} | stage: ${stage} | status: ${status} | message: ${message}`
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

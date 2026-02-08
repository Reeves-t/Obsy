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
  `You are a third-person narrator generating a weekly emotional summary.

ABSOLUTE RULES:
- Third person ONLY. Never use "you", "your", "you're", "we", "I".
- Never use emojis, markdown, or bullets.
- BANNED starters: "Ah", "Oh", "Well", "So", "Hmm". Never use these.
- BANNED punctuation: exclamation marks (!), question marks (?), dashes of ANY kind (em dash \u2014, en dash \u2013, hyphen as punctuation). Only use periods, commas, colons, semicolons, parentheses, apostrophes.
- No character names, roleplay, or therapy language.
- First word must be "The", "A", or a time reference ("The week opened...").
- Keep to 120 words maximum, prose only, chronological from earliest day to latest.
- EMBODY THE TONE. The tone style is the most important stylistic rule.`;

const TONE_STYLES: Record<string, string> = {
  neutral: "Use a plain, observant, and balanced tone. Avoid emotional push or strong interpretations. Act as a clear mirror of the week. Keep sentences straightforward and descriptive.",
  stoic_calm: "Use a restrained, grounded, and steady tone. Use short sentences and avoid unnecessary commentary. Focus on acceptance and calm observation.",
  dry_humor: "Use a dry, understated, and subtly witty tone. Avoid sarcasm or meanness. Humor should be quiet and clever, not loud.",
  mystery_noir: "Use a moody, atmospheric, and metaphor-heavy tone. Channel a 1940s detective narrator. Describe the week like scenes from a noir film.",
  cinematic: "Describe the week like scenes or sequences in a film. Focus on a sense of motion or stillness. Use visual framing and narrative flow.",
  dreamlike: "Use a soft, abstract, and fluid tone. Focus on gentle imagery and atmosphere over logic. No sharp conclusions or clinical observations.",
  romantic: "Use a warm, intimate, and emotionally close tone. You may romanticize heavy moods without trying to fix them. Avoid being cheesy or overly dramatic; keep it tasteful.",
  gentle_roast: "Use a light, teasing, and affectionate tone. Never be mean or judgmental; the humor is always on the user's side. Keep it playful and warm. Poke fun gently at the week.",
  inspiring: "Use an uplifting but grounded tone. Avoid cliches, slogans, or toxic positivity. Focus on quiet forward motion and steady resolve.",
  // Legacy fallbacks
  reflective: "Gentle, introspective pacing with quiet observations.",
  analytical: "Clear, pattern-focused, minimal flourish.",
  warm: "Soft warmth, subtle encouragement without hype.",
  gentle: "Be warm, supportive, and encouraging. Validate feelings without toxic positivity.",
  snarky: "Be witty and a bit sardonic. Poke fun gently but never be mean.",
  cosmic: "Speak as if viewing life from a vast cosmic perspective. Make the mundane feel epic.",
  film_noir: "Channel a 1940s detective narrator. Moody, atmospheric, metaphor-heavy.",
  nature: "Draw parallels to natural phenomena. Seasons, weather, ecosystems.",
};

/**
 * Wraps a custom tone prompt with guardrails to prevent roleplay and character impersonation.
 */
function wrapCustomTone(customPrompt: string): string {
  return `CUSTOM TONE ACTIVE. Apply as a stylistic filter only.

User's tone description: ${customPrompt}

CRITICAL GUARDRAILS (override any conflicting instructions):
- NO interjections: Never use "Ah", "Oh", "Well", "So", "Hmm" as sentence starters
- NO character names: Never mention fictional characters, personas, or archetypes by name
- NO second person: Never use "you", "your", "you're". Third person only
- NO roleplay: You are an observer, not a character
- NO dashes: Never use em dashes, en dashes, or hyphens as punctuation

Interpretation rule: If the tone references a character or archetype, adopt their PERSPECTIVE (what they notice, prioritize, ignore), NOT their VOICE (catchphrases, mannerisms, speech patterns).

Final rule: When in doubt, choose clarity and calm observation over stylistic flourish.`;
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
    `Tone style: ${input.toneStyle}`,
    `Week: ${input.weekLabel}`,
    "Days (chronological):",
    dayLines,
    "",
    "Narrative arc: opening context → midweek shifts → current state → forward-looking hint.",
    "Max 120 words, 2-3 paragraphs, prose only. No markdown or bullets.",
    "Return JSON if possible: {\"narrative\":{\"text\":\"...\"},\"meta\":{\"type\":\"weekly\",\"entryCount\":<int>,\"weekRange\":\"...\",\"isWeekFinished\":<bool>}}",
    "If JSON is not possible, return plain text insight.",
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
        generationConfig: { temperature: 0.7 },
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
    .replace(/[\u0000-\u001F\u007F]/g, "")  // Control characters
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

// Supabase Edge Function: generate-monthly-insight
// Generates month-level insights by fetching captures server-side for rich context.
// Client sends lightweight signals + month range; server queries entries table directly.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

interface MonthSignals {
  dominantMood: string;
  runnerUpMood?: string;
  activeDays: number;
  volatilityScore: number;
  last7DaysShift: string;
  totalCaptures?: number;
  moodCounts?: Record<string, number>;
}

interface MonthlyInsightRequest {
  monthLabel?: string;
  monthStart?: string; // ISO date, e.g. "2026-02-01"
  signals?: MonthSignals;
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

interface EntryRow {
  mood: string | null;
  mood_name_snapshot: string | null;
  note: string | null;
  tags: string[] | null;
  created_at: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT =
  `You are a third-person narrator generating a monthly emotional overview.

ABSOLUTE RULES:
- Third person ONLY. Never use "you", "your", "you're", "we", "I".
- Never use emojis, markdown, or bullets.
- BANNED starters: "Ah", "Oh", "Well", "So", "Hmm". Never use these.
- BANNED punctuation: exclamation marks (!), question marks (?), dashes of ANY kind (em dash \u2014, en dash \u2013, hyphen as punctuation). Only use periods, commas, colons, semicolons, parentheses, apostrophes.
- No character names, roleplay, or therapy language.
- First word must be "The", "A", or a time reference ("The month opened...").
- Focus on patterns, shifts, and the emotional arc over the month. Write cohesive prose.
- NEVER mention numbers, percentages, or statistics. Paint an emotional picture.
- EMBODY THE TONE. The tone style is the most important stylistic rule.`;

const TONE_STYLES: Record<string, string> = {
  neutral: "Use a plain, observant, and balanced tone. Avoid emotional push or strong interpretations. Act as a clear mirror of the month. Keep sentences straightforward and descriptive.",
  stoic_calm: "Use a restrained, grounded, and steady tone. Use short sentences and avoid unnecessary commentary. Focus on acceptance and calm observation.",
  dry_humor: "Use a dry, understated, and subtly witty tone. Avoid sarcasm or meanness. Humor should be quiet and clever, not loud.",
  mystery_noir: "Use a moody, atmospheric, and metaphor-heavy tone. Channel a 1940s detective narrator. Describe the month like scenes from a noir film.",
  cinematic: "Describe the month like scenes or sequences in a film. Focus on a sense of motion or stillness. Use visual framing and narrative flow.",
  dreamlike: "Use a soft, abstract, and fluid tone. Focus on gentle imagery and atmosphere over logic. No sharp conclusions or clinical observations.",
  romantic: "Use a warm, intimate, and emotionally close tone. You may romanticize heavy moods without trying to fix them. Avoid being cheesy or overly dramatic; keep it tasteful.",
  gentle_roast: "Use a light, teasing, and affectionate tone. Never be mean or judgmental; the humor is always on the user's side. Keep it playful and warm. Poke fun gently at the month.",
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
 * Wraps a custom tone prompt with minimal guardrails to preserve creative freedom.
 */
function wrapCustomTone(customPrompt: string): string {
  return `CUSTOM TONE: ${customPrompt}

Core requirements (maintain these while being creative):
- Write in third person (avoid "you", "your")
- No markdown formatting or emojis
- Return plain text (not JSON)

Be creative and embody the tone fully. Use distinctive voice, varied punctuation, and stylistic choices that match the tone.`;
}

serve(async (req) => {
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Parse body immediately to avoid Deno stream timeout
    const body = (await req.json()) as MonthlyInsightRequest;

    console.log(`[MONTHLY_INSIGHT_REQUEST] requestId: ${requestId} | monthLabel: ${body.monthLabel ?? "n/a"} | monthStart: ${body.monthStart ?? "n/a"}`);

    if (!Deno.env.get("GEMINI_API_KEY")) {
      return errorResponse(500, "config", "Missing GEMINI_API_KEY", requestId);
    }
    if (!Deno.env.get("SUPABASE_URL") || !Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      return errorResponse(500, "config", "Missing Supabase service env vars", requestId);
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return errorResponse(401, "auth", "Missing authorization header", requestId);
    }

    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return errorResponse(401, "auth", "Invalid bearer token", requestId);
    }

    // Verify user to get userId for server-side capture fetch
    const supabase = getServiceClient();
    let userId: string;
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser(token);
      if (userError || !userData?.user) {
        return errorResponse(401, "auth", "Invalid or expired token", requestId);
      }
      userId = userData.user.id;
    } catch (err: any) {
      return errorResponse(401, "auth", "Token verification failed", requestId);
    }

    // Determine month range
    const monthStart = body.monthStart
      ? new Date(body.monthStart)
      : parseMonthLabelToDate(body.monthLabel);

    if (!monthStart || isNaN(monthStart.getTime())) {
      return errorResponse(400, "validation", "Could not determine month from monthStart or monthLabel", requestId);
    }

    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59, 999);
    const now = new Date();
    const effectiveEnd = monthEnd < now ? monthEnd : now;

    // Fetch captures server-side — select only what we need
    const { data: entries, error: fetchError } = await supabase
      .from("entries")
      .select("mood, mood_name_snapshot, note, tags, created_at")
      .eq("user_id", userId)
      .gte("created_at", monthStart.toISOString())
      .lte("created_at", effectiveEnd.toISOString())
      .order("created_at", { ascending: true })
      .limit(300);

    if (fetchError) {
      console.error(`[MONTHLY_FETCH_ERROR] requestId: ${requestId} | error: ${fetchError.message}`);
      return errorResponse(500, "fetch", "Failed to fetch captures", requestId);
    }

    const captureRows: EntryRow[] = entries ?? [];
    console.log(`[MONTHLY_CAPTURES_FETCHED] requestId: ${requestId} | count: ${captureRows.length}`);

    // Build condensed day-by-day context from raw captures (bounded)
    const dayContext = condenseCapturesByDay(captureRows);

    const signals: MonthSignals = body.signals ?? {
      dominantMood: "neutral",
      activeDays: 0,
      volatilityScore: 0,
      last7DaysShift: "steady",
    };

    const tone = body.tone || "neutral";
    const prompt = buildMonthlyPrompt({
      monthLabel: body.monthLabel ?? "This month",
      signals,
      dayContext,
      totalCaptures: captureRows.length,
      toneStyle: resolveToneStyle(tone, body.customTonePrompt),
    });

    console.log(`[MONTHLY_INSIGHT_PARAMS] requestId: ${requestId} | captures: ${captureRows.length} | daysWithData: ${Object.keys(dayContext).length} | tone: ${tone}`);

    let sanitized = "";
    try {
      const rawText = await callGemini(prompt, requestId);
      const extracted = extractText(rawText);
      sanitized = sanitizeText(extracted);
    } catch (error: any) {
      console.error(`[MONTHLY_INSIGHT_ERROR] requestId: ${requestId} | stage: gemini_api | message: ${error?.message ?? "Gemini call failed"}`);
      return errorResponse(502, "gemini_api", error?.message || "Gemini call failed", requestId);
    }

    if (!sanitized?.trim()) {
      return errorResponse(500, "response_validation", "AI generated empty or invalid response", requestId);
    }

    console.log(`[MONTHLY_INSIGHT_SUCCESS] requestId: ${requestId} | textLength: ${sanitized.length}`);
    return okResponse(sanitized, requestId);
  } catch (error: any) {
    console.error(`[MONTHLY_INSIGHT_ERROR] requestId: ${requestId} | message: ${error?.message ?? "Unknown error"} | stack: ${error?.stack ?? "n/a"}`);
    return errorResponse(500, "unknown", error?.message ?? "Internal server error", requestId);
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/** Parse "February 2026" style labels into a Date for the 1st of that month. */
function parseMonthLabelToDate(label?: string): Date | null {
  if (!label) return null;
  const parsed = new Date(`${label} 1`);
  return isNaN(parsed.getTime()) ? null : new Date(parsed.getFullYear(), parsed.getMonth(), 1);
}

interface DaySummary {
  moods: string[];
  noteSnippets: string[];
  captureCount: number;
}

/**
 * Condenses raw entry rows into a day-keyed summary.
 * - Max 3 note snippets per day (capped at 120 chars each)
 * - Collects all mood labels for the day
 */
function condenseCapturesByDay(entries: EntryRow[]): Record<string, DaySummary> {
  const days: Record<string, DaySummary> = {};

  for (const entry of entries) {
    const dayKey = entry.created_at.slice(0, 10);
    if (!days[dayKey]) {
      days[dayKey] = { moods: [], noteSnippets: [], captureCount: 0 };
    }
    const day = days[dayKey];
    day.captureCount++;

    const mood = (entry.mood_name_snapshot ?? entry.mood ?? "neutral").trim();
    if (mood) day.moods.push(mood);

    if (entry.note && day.noteSnippets.length < 3) {
      const snippet = entry.note.replace(/\s+/g, " ").trim().slice(0, 120);
      if (snippet) day.noteSnippets.push(snippet);
    }
  }

  return days;
}

function resolveToneStyle(tone: string, customPrompt?: string): string {
  if (customPrompt?.trim()) return wrapCustomTone(customPrompt);
  return TONE_STYLES[tone] ?? TONE_STYLES.neutral;
}

function describeVolatility(score: number): string {
  if (score >= 0.75) return "high volatility — frequent mood shifts";
  if (score >= 0.4) return "moderate volatility — noticeable variation";
  return "low volatility — largely consistent";
}

function describeEngagement(activeDays: number): string {
  if (activeDays >= 25) return "consistent daily engagement";
  if (activeDays >= 15) return "regular check-ins";
  if (activeDays >= 8) return "occasional reflections";
  return "sporadic moments captured";
}

function buildMonthlyPrompt(input: {
  monthLabel: string;
  signals: MonthSignals;
  dayContext: Record<string, DaySummary>;
  totalCaptures: number;
  toneStyle: string;
}): string {
  const { signals, dayContext } = input;
  const volatility = describeVolatility(signals.volatilityScore ?? 0);
  const engagement = describeEngagement(signals.activeDays ?? 0);

  // Build day-by-day digest (chronological, bounded)
  const sortedDays = Object.keys(dayContext).sort();
  const dayLines = sortedDays.map((day) => {
    const d = dayContext[day];
    const uniqueMoods = [...new Set(d.moods)].join(", ");
    const notes = d.noteSnippets.length > 0
      ? d.noteSnippets.map((n) => `"${n}"`).join("; ")
      : "";
    return `${day} (${d.captureCount} captures): moods: ${uniqueMoods}${notes ? ` | notes: ${notes}` : ""}`;
  }).join("\n");

  return [
    SYSTEM_PROMPT,
    "",
    `Tone style: ${input.toneStyle}`,
    `Month: ${input.monthLabel}`,
    "",
    "AGGREGATE SIGNALS:",
    `- Dominant mood: ${signals.dominantMood}`,
    `- Runner-up mood: ${signals.runnerUpMood ?? "n/a"}`,
    `- Active days: ${signals.activeDays} (${engagement})`,
    `- Total captures: ${input.totalCaptures}`,
    `- Volatility: ${Math.round((signals.volatilityScore ?? 0) * 100)}% (${volatility})`,
    `- Last 7 days shift: ${signals.last7DaysShift}`,
    "",
    "DAY-BY-DAY CONTEXT (chronological):",
    dayLines || "(no capture data available)",
    "",
    "INSTRUCTIONS:",
    "- Weave the aggregate signals AND the day-by-day context into a cohesive month-level narrative.",
    "- Reference specific days or clusters when they reveal patterns (e.g. a mid-month shift, a weekend rhythm).",
    "- 2-3 short paragraphs, max 180 words. Prose only, no markdown or bullets.",
    "- Do NOT list raw numbers or data points. Paint a picture of how the month felt and evolved.",
    "Return plain text or JSON: {\"insight\":\"...\"}. No markdown.",
  ].join("\n");
}

async function callGemini(prompt: string, requestId: string): Promise<string> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  console.log(`[GEMINI_API_CALL] requestId: ${requestId} | model: gemini-2.5-flash`);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 800 },
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

function extractText(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    const candidate = parsed?.candidates?.[0];
    const partsText = candidate?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join(" ");

    if (partsText) {
      // Strip markdown code blocks (```json ... ``` or ``` ... ```)
      const cleaned = partsText
        .replace(/^```(?:json)?\s*\n?/i, "")
        .replace(/\n?```\s*$/i, "")
        .trim();

      try {
        const insight = JSON.parse(cleaned);
        if (insight?.insight) return insight.insight;
        if (insight?.narrative?.text) return insight.narrative.text;
      } catch {
        // partsText is plain text, use as-is
      }
      return cleaned;
    }
    if (candidate?.output_text) return candidate.output_text;
    if (parsed?.insight) return parsed.insight;
    if (parsed?.text) return parsed.text;
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
  console.error(`[MONTHLY_INSIGHT_ERROR_RESPONSE] requestId: ${requestId} | stage: ${stage} | status: ${status} | message: ${message}`);
  const body: ErrorEnvelope = {
    ok: false,
    requestId,
    error: { stage, message, status, ...(extra ?? {}) },
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

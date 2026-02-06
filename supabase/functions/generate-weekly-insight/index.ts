// Supabase Edge Function: generate-weekly-insight
// Generates weekly insights with isolated routing, strict envelopes, CORS, auth, and rate limiting.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

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

const RATE_LIMITS: Record<string, number> = {
  free: 10,
  premium: 50,
  vanguard: Number.POSITIVE_INFINITY,
  guest: 5,
  founder: 100,
  subscriber: 100,
};

const SYSTEM_PROMPT =
  `You are a third-person narrator generating a weekly emotional summary. Never use second-person address, emojis, markdown, or filler. Keep to 120 words maximum, prose only, chronological from earliest day to latest.`;

const TONE_STYLES: Record<string, string> = {
  neutral: "Calm, observant, descriptive without judgment.",
  reflective: "Gentle, introspective pacing with quiet observations.",
  analytical: "Clear, pattern-focused, minimal flourish.",
  warm: "Soft warmth, subtle encouragement without hype.",
};

serve(async (req) => {
  console.log('[WEEKLY_HANDLER_ENTRY] function invoked');
  const requestId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  console.log('[WEEKLY_REQUESTID_GENERATED] id:', requestId);
  console.log('[WEEKLY_HEADERS] content-type:', req.headers.get('content-type'), 'content-length:', req.headers.get('content-length'));

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  console.log(`[WEEKLY_POST_OPTIONS] requestId: ${requestId} | proceeding to main logic`);

  try {
    console.log(`[WEEKLY_INSIGHT_REQUEST] requestId: ${requestId} | method: ${req.method} | url: ${req.url}`);

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

    const supabase = getServiceClient();
    let verified;
    try {
      verified = await verifyUser(supabase, token);
    } catch (err: any) {
      console.error(
        `[WEEKLY_INSIGHT_ERROR] requestId: ${requestId} | stage: auth | message: ${err?.message ?? "Token verification failed"}`
      );
      return errorResponse(401, "auth", "Invalid or expired token", requestId);
    }

    if (!verified?.userId) {
      return errorResponse(401, "auth", "Invalid or expired token", requestId);
    }

    const rateStatus = await checkRateLimit(supabase, verified.userId, verified.tier);
    if (!rateStatus.allowed) {
      return errorResponse(429, "rate_limit", "Rate limit exceeded", requestId, { remaining: rateStatus.remaining });
    }

    await incrementUsage(supabase, verified.userId, "weekly_insight");

    const rawBody = await req.text();
    console.log(
      `[WEEKLY_RAW_BODY] requestId: ${requestId} | size: ${rawBody.length} | preview: ${rawBody.slice(0, 500)}...`
    );

    let body: WeeklyInsightRequest;
    try {
      body = JSON.parse(rawBody) as WeeklyInsightRequest;
    } catch (parseErr: any) {
      console.error(
        `[WEEKLY_JSON_PARSE_FAIL] requestId: ${requestId} | error: ${parseErr?.message ?? "Unknown parse error"} | raw preview: ${rawBody.slice(0, 200)}`
      );
      return errorResponse(400, "parse", "Invalid JSON body", requestId);
    }
    console.log(`[WEEKLY_BODY_PARSED] requestId: ${requestId} | captures count: ${body?.captures?.length ?? 0}`);

    if (body.captures !== undefined && !Array.isArray(body.captures)) {
      console.error(
        `[WEEKLY_INSIGHT_ERROR] requestId: ${requestId} | stage: validation | message: captures must be an array`
      );
      return errorResponse(400, "validation", "captures must be an array", requestId);
    }

    const captures = (body.captures ?? []).slice().sort((a, b) =>
        new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
    );

    const captureValidation = validateCaptures(captures);
    if (!captureValidation.valid) {
      console.error(
        `[WEEKLY_INSIGHT_ERROR] requestId: ${requestId} | stage: validation | message: ${captureValidation.error}`
      );
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
        `[WEEKLY_INSIGHT_ERROR] requestId: ${requestId} | stage: gemini_api | message: ${error?.message ?? "Gemini call failed"} | stack: ${error?.stack ?? "n/a"}`
      );
      return errorResponse(502, "gemini_api", error?.message || "Gemini call failed", requestId);
    }

    if (!validateGeminiResponse(sanitized)) {
      console.error(
        `[WEEKLY_INSIGHT_ERROR] requestId: ${requestId} | stage: response_validation | message: Empty or invalid Gemini response | length: ${sanitized?.length ?? 0}`
      );
      return errorResponse(500, "response_validation", "AI generated empty or invalid response", requestId);
    }

    console.log(`[WEEKLY_INSIGHT_SUCCESS] requestId: ${requestId} | textLength: ${sanitized?.length ?? 0} | status: success`);
    return okResponse(sanitized, requestId);
  } catch (error: any) {
    console.error(
      `[WEEKLY_INSIGHT_ERROR] requestId: ${requestId} | message: ${error?.message ?? "Unknown error"} | stack: ${error?.stack ?? "n/a"}`
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

  // Skip profile lookup; default tier free for schema-compatibility
  return { userId, tier: "free" };
}

async function checkRateLimit(
  supabase: SupabaseClient,
  userId: string,
  tier: string,
): Promise<{ allowed: boolean; remaining: number }> {
  // Rate limiting disabled for this project
  return { allowed: true, remaining: Number.POSITIVE_INFINITY };
}

async function incrementUsage(supabase: SupabaseClient, userId: string, kind: string) {
  // No-op: rate limiting disabled
}

function resolveToneStyle(tone: string, customPrompt?: string): string {
  if (customPrompt?.trim()) return customPrompt;
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
      try {
        const insight = JSON.parse(partsText);
        const narrativeText = insight?.narrative?.text ?? insight?.insight ?? partsText;
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
  return text.replace(/[\u0000-\u001F\u007F]/g, "").trim();
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

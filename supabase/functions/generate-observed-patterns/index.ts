// Supabase Edge Function: generate-observed-patterns
// Generates lifelong pattern reflections from all eligible captures.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

type TimeBucket = "early" | "midday" | "late" | string;
type DayPart = "Late night" | "Morning" | "Midday" | "Evening" | "Night" | string;

interface CaptureData {
  mood: string;
  note?: string;
  obsyNote?: string;
  capturedAt: string;
  tags?: string[];
  timeBucket?: TimeBucket;
  dayPart?: DayPart;
}

interface ObservedPatternsRequest {
  captures?: CaptureData[];
  previousPatternText?: string | null;
  generationNumber?: number;
  eligibleCount?: number;
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
  `You are a lifelong emotional pattern observer for a visual micro-journal app. You analyze the complete emotional archive of a person and surface recurring themes, rhythms, and blind spots.

ABSOLUTE RULES:
- Third person ONLY. Never use "you", "your", "you're", "we", "I".
- Never use emojis, markdown, bullets, or lists.
- No exclamation marks, no question marks.
- BANNED punctuation: dashes of ANY kind (em dash, en dash, hyphen as punctuation). Only use periods, commas, colons, semicolons, parentheses, apostrophes.
- No character names, roleplay, or therapy language.
- No meta-commentary about the app or data ("Based on the captures...", "Looking at the data...").
- Never diagnose, label personality types, or suggest actions/improvements.
- Never use certainty or authority ("this means", "clearly", "this defines").
- Never state permanence ("this is who they are", "this defines them").
- Never imply intent, cause, or motivation.
- Write exactly two paragraphs. No more, no less.
- First word must be "The", "A", "There", or a time reference.
- Tone: calm, observational, poetic but grounded. Like a narrator who has been quietly watching for a long time.
- Be self-reflecting and eye-opening. Surface patterns the person may not have noticed.
- Name-drop specific moods, themes, tags, and recurring elements directly. Be concrete, not vague.
- Use phrases like "there's a tendency," "often," "a pattern appears," "recurring," "a rhythm emerges."
- Focus on: recurring emotional rhythms, time-of-day patterns, tag clustering, mood transitions, frequency patterns, environmental themes from reflections.
- If confidence is low, speak less. If patterns are weak, remain subtle. Silence is preferable to over-interpretation.
- This is observation of repetition, not definition of identity.`;

serve(async (req) => {
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log(`[OBSERVED_PATTERNS_REQUEST] requestId: ${requestId} | method: ${req.method}`);

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

    const body = (await req.json()) as ObservedPatternsRequest;

    if (body.captures !== undefined && !Array.isArray(body.captures)) {
      return errorResponse(400, "validation", "captures must be an array", requestId);
    }

    const captures = (body.captures ?? []).slice().sort((a, b) =>
      new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
    );

    if (captures.length < 5) {
      return errorResponse(400, "validation", "At least 5 eligible captures are required", requestId);
    }

    const captureValidation = validateCaptures(captures);
    if (!captureValidation.valid) {
      return errorResponse(400, "validation", captureValidation.error || "Invalid captures", requestId);
    }

    const generationNumber = body.generationNumber ?? 1;
    const previousPatternText = body.previousPatternText ?? null;
    const eligibleCount = body.eligibleCount ?? captures.length;

    console.log(
      `[OBSERVED_PATTERNS_PARAMS] requestId: ${requestId} | captures: ${captures.length} | generation: ${generationNumber} | eligibleCount: ${eligibleCount} | hasPrevious: ${!!previousPatternText}`
    );

    const prompt = buildObservedPatternsPrompt({
      captures,
      previousPatternText,
      generationNumber,
      eligibleCount,
    });

    let sanitized = "";
    try {
      const rawText = await callGemini(prompt, requestId);
      sanitized = extractAndSanitize(rawText, requestId);
    } catch (error: any) {
      console.error(
        `[OBSERVED_PATTERNS_ERROR] requestId: ${requestId} | stage: gemini_api | message: ${error?.message ?? "Gemini call failed"}`
      );
      return errorResponse(502, "gemini_api", error?.message || "Gemini call failed", requestId);
    }

    if (!sanitized || !sanitized.trim()) {
      return errorResponse(500, "response_validation", "AI generated empty response", requestId);
    }

    console.log(`[OBSERVED_PATTERNS_SUCCESS] requestId: ${requestId} | textLength: ${sanitized.length}`);
    return okResponse(sanitized, requestId);
  } catch (error: any) {
    console.error(
      `[OBSERVED_PATTERNS_ERROR] requestId: ${requestId} | message: ${error?.message ?? "Unknown error"}`
    );
    return errorResponse(500, "unknown", error?.message ?? "Internal server error", requestId);
  }
});

// ---------------------------------------------------------------------------
// Prompt building
// ---------------------------------------------------------------------------

function buildObservedPatternsPrompt(input: {
  captures: CaptureData[];
  previousPatternText: string | null;
  generationNumber: number;
  eligibleCount: number;
}): string {
  const captureBlock = buildCaptureBlock(input.captures);
  const stats = computeStats(input.captures);

  const parts = [
    SYSTEM_PROMPT,
    "",
    `Total eligible captures: ${input.eligibleCount}`,
    `Date range: ${stats.dateRange}`,
    "",
    "CAPTURE STATISTICS:",
    `Most frequent moods: ${stats.topMoods.join(", ")}`,
    `Most frequent tags: ${stats.topTags.length > 0 ? stats.topTags.join(", ") : "none"}`,
    `Time distribution: ${stats.timeDistribution}`,
    `Day distribution: ${stats.dayDistribution}`,
    "",
    "CAPTURE DATA:",
    captureBlock,
  ];

  // Refinement context for subsequent generations
  if (input.generationNumber > 1 && input.previousPatternText) {
    parts.push(
      "",
      "REFINEMENT CONTEXT:",
      `This is generation ${input.generationNumber}. The previous observation was:`,
      `"${input.previousPatternText}"`,
      "",
      "Build on this. Notice what has shifted, deepened, or emerged since. Do not repeat the same observations verbatim. Evolve them."
    );
  }

  parts.push(
    "",
    "OUTPUT FORMAT:",
    "Return ONLY a JSON object (NO markdown fences, NO extra text):",
    "{",
    "  \"text\": \"Two paragraphs of reflective pattern observation.\"",
    "}",
    "",
    "The text field must contain PLAIN TEXT ONLY. Exactly two paragraphs separated by a newline.",
    "Be concrete. Name specific moods, tags, and themes. This should feel like a quiet mirror, not an explanation."
  );

  return parts.join("\n");
}

function buildCaptureBlock(captures: CaptureData[]): string {
  // For large datasets, send stats + most recent 20 detailed
  if (captures.length > 50) {
    const recent = captures.slice(-20);
    return [
      `(Showing 20 most recent of ${captures.length} total captures)`,
      "",
      ...recent.map(formatCapture),
    ].join("\n");
  }

  return captures.map(formatCapture).join("\n");
}

function formatCapture(c: CaptureData): string {
  const time = new Date(c.capturedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const date = new Date(c.capturedAt).toLocaleDateString([], { month: "short", day: "numeric" });
  const bucket = c.timeBucket ?? "unknown";
  const part = c.dayPart ?? "unknown";
  const tags = (c.tags ?? []).join(", ");
  const note = (c.note ?? "").replace(/\s+/g, " ").trim();
  const obsyNote = (c.obsyNote ?? "").replace(/\s+/g, " ").trim();

  let line = `${date} ${time} | ${bucket} | ${part} | mood: ${c.mood}`;
  if (note) line += ` | note: ${note}`;
  if (obsyNote) line += ` | reflection: ${obsyNote}`;
  if (tags) line += ` | tags: ${tags}`;
  return line;
}

function computeStats(captures: CaptureData[]): {
  topMoods: string[];
  topTags: string[];
  timeDistribution: string;
  dayDistribution: string;
  dateRange: string;
} {
  // Mood frequency
  const moodCounts: Record<string, number> = {};
  for (const c of captures) {
    moodCounts[c.mood] = (moodCounts[c.mood] || 0) + 1;
  }
  const topMoods = Object.entries(moodCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([mood, count]) => `${mood} (${count})`);

  // Tag frequency
  const tagCounts: Record<string, number> = {};
  for (const c of captures) {
    for (const tag of c.tags ?? []) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }
  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([tag, count]) => `${tag} (${count})`);

  // Time of day distribution
  const partCounts: Record<string, number> = {};
  for (const c of captures) {
    const part = c.dayPart ?? "unknown";
    partCounts[part] = (partCounts[part] || 0) + 1;
  }
  const timeDistribution = Object.entries(partCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([part, count]) => `${part}: ${count}`)
    .join(", ");

  // Day of week distribution
  const dayCounts: Record<string, number> = {};
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  for (const c of captures) {
    const day = dayNames[new Date(c.capturedAt).getDay()];
    dayCounts[day] = (dayCounts[day] || 0) + 1;
  }
  const dayDistribution = Object.entries(dayCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([day, count]) => `${day}: ${count}`)
    .join(", ");

  // Date range
  const dates = captures.map(c => new Date(c.capturedAt)).sort((a, b) => a.getTime() - b.getTime());
  const first = dates[0]?.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) ?? "unknown";
  const last = dates[dates.length - 1]?.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) ?? "unknown";
  const dateRange = `${first} to ${last}`;

  return { topMoods, topTags, timeDistribution, dayDistribution, dateRange };
}

// ---------------------------------------------------------------------------
// Gemini API
// ---------------------------------------------------------------------------

async function callGemini(prompt: string, requestId: string): Promise<string> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  console.log(
    `[GEMINI_API_CALL] requestId: ${requestId} | model: gemini-2.5-flash`
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

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

function extractAndSanitize(raw: string, requestId: string): string {
  try {
    const parsed = JSON.parse(raw);
    const candidate = parsed?.candidates?.[0];
    const partsText = candidate?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join(" ");

    if (partsText) {
      // Strip markdown code blocks
      const cleaned = partsText
        .replace(/^```(?:json)?\s*\n?/i, "")
        .replace(/\n?```\s*$/i, "")
        .trim();

      try {
        const insight = JSON.parse(cleaned);
        const text = insight?.text;
        if (text && typeof text === "string") {
          console.log(`[EXTRACT_SUCCESS] requestId: ${requestId} | parsed JSON text field`);
          return sanitizeText(text);
        }
      } catch {
        // Not JSON, treat as plain text
        if (cleaned && !cleaned.startsWith("{") && !cleaned.startsWith("[")) {
          return sanitizeText(cleaned);
        }
      }

      // Fallback to raw parts text if it doesn't look like JSON
      if (!partsText.trim().startsWith("{") && !partsText.trim().startsWith("[")) {
        return sanitizeText(partsText);
      }
    }

    if (candidate?.output_text) return sanitizeText(candidate.output_text);
    if (parsed?.text) return sanitizeText(parsed.text);
  } catch {
    // raw might already be plain text
  }
  return sanitizeText(raw);
}

function sanitizeText(text: string): string {
  if (!text) return "";
  return text
    .replace(/[\u0000-\u001F\u007F]/g, "")  // Control characters
    .replace(/[\u2013\u2014]/g, ",")          // En dash / em dash -> comma
    .replace(/---?/g, ",")                    // ASCII hyphens as dashes -> comma
    .trim();
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

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
): Response {
  console.error(
    `[OBSERVED_PATTERNS_ERROR_RESPONSE] requestId: ${requestId} | stage: ${stage} | status: ${status} | message: ${message}`
  );
  const body: ErrorEnvelope = {
    ok: false,
    requestId,
    error: { stage, message, status },
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

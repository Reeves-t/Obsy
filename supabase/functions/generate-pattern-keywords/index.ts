// Supabase Edge Function: generate-pattern-keywords
// Generates structured emotional themes (positive / draining / emerging) from user data.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { runAiTextTask } from "../_shared/ai/router.ts";
import type { AiPostProcessResult } from "../_shared/ai/types.ts";

interface CaptureData {
  mood: string;
  note?: string;
  obsyNote?: string;
  capturedAt: string;
  tags?: string[];
  entryType?: 'capture' | 'journal' | 'voice' | 'shared_link';
  sharedLinkPlatform?: string | null;
  sharedLinkTitle?: string | null;
  sharedLinkDigest?: string | null;
}

interface PatternKeywordsRequest {
  captures?: CaptureData[];
  previousEmergingId?: string | null;
}

interface FlowBar { label: string; value: number; }
interface Shift { dir: 'up' | 'down' | 'flat'; label: string; }
interface Theme {
  id: string;
  name: string;
  keywords: string;
  mentions: number;
  span: string;
  reflection: string;
  flow: FlowBar[];
  trend: number[];
  shift: Shift;
}
interface Payload {
  positive: Theme[];
  draining: Theme[];
  emerging: Theme[];
  dateRange: string;
}

interface SuccessResponse { ok: true; payload: Payload; requestId: string; }
interface ErrorEnvelope {
  ok: false;
  requestId: string;
  error: { stage: string; message: string; status: number; [key: string]: unknown };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT =
  `You are an emotional pattern observer for a visual micro-journal app. You read a person's journal entries, captures, tags, shared links, and mood logs, and you surface the recurring emotional themes in their life.

PURPOSE:
Help the user notice recurring emotional subjects, positive anchors, draining patterns, and emerging life themes. This is reflective observation, not analytics or therapy.

GROUPING:
Group raw keywords into human-readable emotional themes. Examples:
- "code, coding, dev, app, project" -> "Creative Work" or "App Development"
- "gym, lift, workout, run" -> "Movement"
- "rent, money, budget, bills" -> "Money"
Avoid raw keyword spam. Each theme should feel like a meaningful subject in someone's life.

CATEGORIES YOU MUST RETURN:
1. positive (exactly 3 themes): themes most associated with calm, happy, focused, hopeful, fulfilled, motivated, emotionally stable moods.
2. draining (exactly 3 themes): themes most associated with stress, anxiety, sadness, burnout, overwhelm, frustration, loneliness, emotional instability.
3. emerging (exactly 1 theme): one emotionally significant trend that has recently appeared or intensified. Detect rising recurring topics, emotional shifts, sudden associations, or newly recurring themes.

If the data is too thin to confidently surface 3 themes in a category, return the strongest themes you can find, even if fewer than 3. Never fabricate. If a category genuinely has nothing, return an empty array for that category.

TONE FOR REFLECTIONS:
- short (one sentence, under 18 words)
- observational, never diagnostic, never authoritative, never therapy-like
- calm, grounded, emotionally intelligent
- never preachy, never dramatic, never clinical
- third person preferred ("Creative work appears most often during calmer periods.")
- if second person is unavoidable, keep it gentle

REFLECTION EXAMPLES (correct tone):
- "Creative work appears most often during calmer periods."
- "Financial topics became more emotionally heavy near the end of the month."
- "Conversations about relationships have recently become more positive."
- "Reading has quietly become a recurring anchor on calmer evenings."

PER-THEME FIELDS YOU MUST PRODUCE:
- id: short kebab-case identifier (e.g. "creative-work", "work-deadlines", "reading")
- name: human-readable theme name (e.g. "Creative Work", "Close Friends", "Reading")
- keywords: 2-4 raw fragments observed in the data, separated by " · " (e.g. "writing · design · side project"). These are the literal anchors from the source data that point to this theme.
- mentions: integer count of entries that informed this theme
- span: short window string (e.g. "8 weeks", "3 weeks", "6 weeks") describing the period the theme is observed across
- reflection: ONE sentence in the tone described above
- flow: array of exactly 3 objects { label, value }. Values are integers 0-100 and MUST sum to exactly 100.
  - For positive themes use labels: ["Calm", "Mixed", "Heavy"]
  - For draining themes use labels: ["Calm", "Mixed", "Heavy"]
  - For emerging themes use labels: ["Calm", "Mixed", "Heavy"]
- trend: array of exactly 12 integers between 0 and 100, representing emotional association strength across the last 12 weeks (oldest first, newest last). Higher = more positively associated for positive/emerging themes; higher = more emotionally heavy for draining themes.
- shift: { dir: "up" | "down" | "flat", label: short word or two like "warming", "rising", "intensifying", "fluctuating", "steady warm" }

ABSOLUTE RULES:
- Return exactly the JSON shape requested. No markdown fences. No extra prose.
- Never invent themes that the data does not support.
- Never diagnose, label personalities, or prescribe.
- Never use emojis or markdown.
- Group intelligently; do not output raw keyword counts as themes.
- If the user has very little data, prefer fewer themes over invented themes.`;

serve(async (req) => {
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log(`[PATTERN_KEYWORDS_REQUEST] requestId: ${requestId} | method: ${req.method}`);

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return errorResponse(401, "auth", "Missing authorization header", requestId);
    }

    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return errorResponse(401, "auth", "Invalid bearer token", requestId);
    }

    const body = (await req.json()) as PatternKeywordsRequest;

    if (body.captures !== undefined && !Array.isArray(body.captures)) {
      return errorResponse(400, "validation", "captures must be an array", requestId);
    }

    const captures = (body.captures ?? []).slice().sort((a, b) =>
      new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
    );

    if (captures.length < 8) {
      return errorResponse(400, "validation", "At least 8 eligible entries are required", requestId);
    }

    const validation = validateCaptures(captures);
    if (!validation.valid) {
      return errorResponse(400, "validation", validation.error || "Invalid captures", requestId);
    }

    const prompt = buildPrompt(captures, body.previousEmergingId ?? null);

    const aiResult = await runAiTextTask({
      requestId,
      feature: "generate_pattern_keywords",
      task: "pattern_keywords",
      prompt,
      inputMode: "text",
      responseFormat: "json",
      maxTokens: 2400,
      temperature: 0.65,
      promptVersion: "generate_pattern_keywords_v1",
      requestPayload: {
        capture_count: captures.length,
        has_previous_emerging: Boolean(body.previousEmergingId),
      },
      postProcess: (rawText: string): AiPostProcessResult => {
        const parsed = extractAndValidate(rawText, requestId);
        if (!parsed.ok) {
          return { ok: false, stage: "validate", message: parsed.message, status: 500 };
        }
        return { ok: true, text: JSON.stringify(parsed.payload) };
      },
    });

    if (!aiResult.ok) {
      console.error(`[PATTERN_KEYWORDS_ERROR] requestId: ${requestId} | stage: ${aiResult.stage} | ${aiResult.message}`);
      return errorResponse(aiResult.status, aiResult.stage, aiResult.message, requestId);
    }

    let payload: Payload;
    try {
      payload = JSON.parse(aiResult.text) as Payload;
    } catch {
      return errorResponse(500, "parse", "Failed to deserialize AI payload", requestId);
    }

    payload.dateRange = computeDateRange(captures);

    console.log(`[PATTERN_KEYWORDS_SUCCESS] requestId: ${requestId} | pos: ${payload.positive.length} | drain: ${payload.draining.length} | emerg: ${payload.emerging.length}`);
    return okResponse(payload, requestId);
  } catch (error: any) {
    console.error(`[PATTERN_KEYWORDS_ERROR] requestId: ${requestId} | ${error?.message ?? "Unknown error"}`);
    return errorResponse(500, "unknown", error?.message ?? "Internal server error", requestId);
  }
});

// ---------------------------------------------------------------------------
// Prompt building
// ---------------------------------------------------------------------------

function buildPrompt(captures: CaptureData[], previousEmergingId: string | null): string {
  const stats = computeStats(captures);
  const entryBlock = buildEntryBlock(captures);

  const parts = [
    SYSTEM_PROMPT,
    "",
    `Total entries: ${captures.length}`,
    `Date range: ${stats.dateRange}`,
    "",
    "AGGREGATE SIGNALS:",
    `Most frequent moods: ${stats.topMoods.join(", ")}`,
    `Most frequent tags: ${stats.topTags.length > 0 ? stats.topTags.join(", ") : "none"}`,
    `Recent (last 14 days) tags: ${stats.recentTags.length > 0 ? stats.recentTags.join(", ") : "none"}`,
    "",
    "ENTRY DATA:",
    entryBlock,
  ];

  if (previousEmergingId) {
    parts.push(
      "",
      "PREVIOUS EMERGING THEME ID:",
      `${previousEmergingId}`,
      "If the data still supports this emerging theme, reuse the same id. If a stronger, newer emerging pattern is now present, choose that instead.",
    );
  }

  parts.push(
    "",
    "OUTPUT FORMAT:",
    "Return ONLY a JSON object with this exact shape (no markdown fences, no prose):",
    "{",
    '  "positive": [Theme, Theme, Theme],',
    '  "draining": [Theme, Theme, Theme],',
    '  "emerging": [Theme]',
    "}",
    "",
    "Each Theme matches the per-theme fields described above. The dateRange field will be added server-side.",
  );

  return parts.join("\n");
}

function buildEntryBlock(captures: CaptureData[]): string {
  const limit = 60;
  if (captures.length > limit) {
    const recent = captures.slice(-limit);
    return [
      `(Showing ${limit} most recent of ${captures.length} total entries)`,
      "",
      ...recent.map(formatEntry),
    ].join("\n");
  }
  return captures.map(formatEntry).join("\n");
}

function formatEntry(c: CaptureData): string {
  const d = new Date(c.capturedAt);
  const date = d.toLocaleDateString([], { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const tags = (c.tags ?? []).join(", ");
  const note = (c.note ?? "").replace(/\s+/g, " ").trim();
  const obsyNote = (c.obsyNote ?? "").replace(/\s+/g, " ").trim();
  const type = c.entryType ?? "capture";

  let line = `${date} ${time} | ${type} | mood: ${c.mood}`;
  if (note) line += ` | note: ${note}`;
  if (obsyNote) line += ` | reflection: ${obsyNote}`;
  if (tags) line += ` | tags: ${tags}`;
  if (c.sharedLinkPlatform) line += ` | link_platform: ${c.sharedLinkPlatform}`;
  if (c.sharedLinkTitle) line += ` | link_title: ${c.sharedLinkTitle}`;
  if (c.sharedLinkDigest) line += ` | link_about: ${c.sharedLinkDigest}`;
  return line;
}

function computeStats(captures: CaptureData[]): {
  topMoods: string[];
  topTags: string[];
  recentTags: string[];
  dateRange: string;
} {
  const moodCounts: Record<string, number> = {};
  const tagCounts: Record<string, number> = {};
  const recentTagCounts: Record<string, number> = {};
  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;

  for (const c of captures) {
    moodCounts[c.mood] = (moodCounts[c.mood] || 0) + 1;
    const isRecent = new Date(c.capturedAt).getTime() >= fourteenDaysAgo;
    for (const tag of c.tags ?? []) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      if (isRecent) recentTagCounts[tag] = (recentTagCounts[tag] || 0) + 1;
    }
  }

  const topMoods = Object.entries(moodCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([m, n]) => `${m} (${n})`);
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t, n]) => `${t} (${n})`);
  const recentTags = Object.entries(recentTagCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t, n]) => `${t} (${n})`);

  return { topMoods, topTags, recentTags, dateRange: computeDateRange(captures) };
}

function computeDateRange(captures: CaptureData[]): string {
  const dates = captures.map(c => new Date(c.capturedAt)).sort((a, b) => a.getTime() - b.getTime());
  const fmt = (d: Date) => d.toLocaleDateString([], { month: "short", day: "numeric" });
  const first = dates[0] ? fmt(dates[0]) : "—";
  const last = dates[dates.length - 1] ? fmt(dates[dates.length - 1]) : "—";
  return `${first} — ${last}`;
}

// ---------------------------------------------------------------------------
// Response parsing & validation
// ---------------------------------------------------------------------------

function extractAndValidate(
  raw: string,
  requestId: string,
): { ok: true; payload: Payload } | { ok: false; message: string } {
  const cleaned = raw.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e: any) {
    console.warn(`[PATTERN_KEYWORDS_PARSE_FAIL] requestId: ${requestId} | ${e?.message}`);
    return { ok: false, message: "AI returned invalid JSON" };
  }

  if (!parsed || typeof parsed !== "object") {
    return { ok: false, message: "AI returned non-object payload" };
  }

  const p = parsed as Partial<Payload>;
  if (!Array.isArray(p.positive) || !Array.isArray(p.draining) || !Array.isArray(p.emerging)) {
    return { ok: false, message: "AI payload missing positive/draining/emerging arrays" };
  }

  const positive = p.positive.map(sanitizeTheme).filter((t): t is Theme => t !== null);
  const draining = p.draining.map(sanitizeTheme).filter((t): t is Theme => t !== null);
  const emerging = p.emerging.map(sanitizeTheme).filter((t): t is Theme => t !== null);

  if (positive.length === 0 && draining.length === 0 && emerging.length === 0) {
    return { ok: false, message: "AI payload produced no valid themes" };
  }

  return {
    ok: true,
    payload: { positive, draining, emerging, dateRange: "" },
  };
}

function sanitizeTheme(input: unknown): Theme | null {
  if (!input || typeof input !== "object") return null;
  const t = input as Partial<Theme>;
  if (!t.id || !t.name || !Array.isArray(t.flow) || !Array.isArray(t.trend) || !t.shift) return null;

  const flow: FlowBar[] = t.flow.slice(0, 3).map((f: any) => ({
    label: String(f?.label ?? ""),
    value: clamp(Math.round(Number(f?.value) || 0), 0, 100),
  }));
  while (flow.length < 3) flow.push({ label: "—", value: 0 });
  // Renormalize so they sum to 100
  const sum = flow.reduce((a, b) => a + b.value, 0);
  if (sum > 0 && sum !== 100) {
    const factor = 100 / sum;
    flow[0].value = Math.round(flow[0].value * factor);
    flow[1].value = Math.round(flow[1].value * factor);
    flow[2].value = 100 - flow[0].value - flow[1].value;
  }

  const trend: number[] = t.trend.slice(0, 12).map((v: any) => clamp(Math.round(Number(v) || 0), 0, 100));
  while (trend.length < 12) trend.unshift(trend[0] ?? 0);

  const shiftDir = (t.shift as any)?.dir;
  const shift: Shift = {
    dir: shiftDir === "up" || shiftDir === "down" || shiftDir === "flat" ? shiftDir : "flat",
    label: String((t.shift as any)?.label ?? "").slice(0, 40) || "steady",
  };

  return {
    id: String(t.id).toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 60) || "theme",
    name: String(t.name).slice(0, 60),
    keywords: String(t.keywords ?? "").slice(0, 160),
    mentions: clamp(Math.round(Number(t.mentions) || 0), 0, 9999),
    span: String(t.span ?? "").slice(0, 40) || "recent",
    reflection: String(t.reflection ?? "").slice(0, 240),
    flow,
    trend,
    shift,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function validateCaptures(captures: CaptureData[]): { valid: boolean; error: string | null } {
  if (!Array.isArray(captures)) return { valid: false, error: "captures must be an array" };
  for (let i = 0; i < captures.length; i++) {
    const c = captures[i];
    if (!c.mood || typeof c.mood !== "string" || !c.mood.trim()) {
      return { valid: false, error: `entry ${i} missing or invalid mood` };
    }
    if (!c.capturedAt || isNaN(new Date(c.capturedAt).getTime())) {
      return { valid: false, error: `entry ${i} missing or invalid capturedAt` };
    }
  }
  return { valid: true, error: null };
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function okResponse(payload: Payload, requestId: string): Response {
  const body: SuccessResponse = { ok: true, payload, requestId };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(status: number, stage: string, message: string, requestId: string): Response {
  console.error(`[PATTERN_KEYWORDS_ERROR_RESPONSE] requestId: ${requestId} | ${stage} | ${status} | ${message}`);
  const body: ErrorEnvelope = { ok: false, requestId, error: { stage, message, status } };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

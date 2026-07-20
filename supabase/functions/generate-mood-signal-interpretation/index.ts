// Supabase Edge Function: generate-mood-signal-interpretation
// On-demand interpretation of deterministic Mood Signal metadata.
//
// Privacy: the client sends only aggregate mood metadata. No notes, photos,
// links, transcripts, tags, or raw entries are accepted or needed.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { runAiTextTask } from "../_shared/ai/router.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type MoodSignalRange = "this_week" | "last_week" | "month" | "all_time";
type MoodSignalKind = "weekly_signal" | "weekday_shape" | "mood_connection";
type SubscriptionTier = "free" | "plus";

const INTERPRETATION_LIMITS: Record<SubscriptionTier, number> = {
  free: 1,
  plus: 5,
};

const MOOD_CONNECTION_LIMITS: Record<SubscriptionTier, number> = {
  free: 3,
  plus: 10,
};

interface MoodSignalSummary {
  totalEntries: number;
  activeDays: number;
  moodVariety: number;
  dominantMood: string | null;
  runnerUpMood: string | null;
  mixScore: number;
  mixLabel: string;
  strongestDay: string | null;
  mostBlendedDay: string | null;
  selectedMood?: string | null;
  beforeVariety?: number;
  afterVariety?: number;
  strongestBefore?: string | null;
  strongestAfter?: string | null;
  strongestConnection?: string | null;
  loopCount?: number;
}

interface MoodSignalInterpretationRequest {
  kind?: MoodSignalKind;
  range?: MoodSignalRange;
  rangeLabel?: string;
  weekdayLabel?: string;
  selectedMood?: string;
  tone?: string;
  customTonePrompt?: string;
  summary?: MoodSignalSummary;
  moodWeights?: Array<{
    mood: string;
    count: number;
    percentage: number;
  }>;
  days?: Array<{
    dayName: string;
    totalCaptures: number;
    topMood: string | null;
    dominance: number;
    mixLevel: string;
    segments: Array<{
      mood: string;
      count: number;
      percentage: number;
    }>;
  }>;
  connections?: {
    before: Array<{ mood: string; count: number }>;
    after: Array<{ mood: string; count: number }>;
  };
}

interface ErrorEnvelope {
  ok: false;
  requestId: string;
  error: {
    stage: string;
    message: string;
    status: number;
  };
  usage?: UsageEnvelope;
}

interface UsageEnvelope {
  used: number;
  limit: number;
  remaining: number;
  tier: SubscriptionTier;
}

function errorResponse(
  status: number,
  stage: string,
  message: string,
  requestId: string,
  usage?: UsageEnvelope,
): Response {
  const body: ErrorEnvelope = { ok: false, requestId, error: { stage, message, status }, usage };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeTier(tier: string | null | undefined): SubscriptionTier {
  if (tier === "plus") return "plus";
  if (tier && ["founder", "subscriber", "lifetime", "premium", "pro"].includes(tier)) return "plus";
  return "free";
}

function cleanText(value: unknown, fallback = ""): string {
  return String(value ?? fallback).replace(/\s+/g, " ").trim().slice(0, 80);
}

function cleanPromptText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 600);
}

function clampNumber(value: unknown, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function sanitizeBody(body: MoodSignalInterpretationRequest): MoodSignalInterpretationRequest {
  const summary = body.summary;
  return {
    kind: body.kind === "weekday_shape"
      ? "weekday_shape"
      : body.kind === "mood_connection"
        ? "mood_connection"
        : "weekly_signal",
    range: body.range,
    rangeLabel: cleanText(body.rangeLabel, "This Week"),
    weekdayLabel: body.weekdayLabel ? cleanText(body.weekdayLabel) : undefined,
    selectedMood: body.selectedMood ? cleanText(body.selectedMood) : undefined,
    tone: cleanText(body.tone, "neutral"),
    customTonePrompt: body.customTonePrompt ? cleanPromptText(body.customTonePrompt) : undefined,
    summary: summary ? {
      totalEntries: Math.round(clampNumber(summary.totalEntries, 0, 500)),
      activeDays: Math.round(clampNumber(summary.activeDays, 0, 366)),
      moodVariety: Math.round(clampNumber(summary.moodVariety, 0, 100)),
      dominantMood: summary.dominantMood ? cleanText(summary.dominantMood) : null,
      runnerUpMood: summary.runnerUpMood ? cleanText(summary.runnerUpMood) : null,
      mixScore: clampNumber(summary.mixScore, 0, 1),
      mixLabel: cleanText(summary.mixLabel, "Mixed"),
      strongestDay: summary.strongestDay ? cleanText(summary.strongestDay) : null,
      mostBlendedDay: summary.mostBlendedDay ? cleanText(summary.mostBlendedDay) : null,
      selectedMood: summary.selectedMood ? cleanText(summary.selectedMood) : null,
      beforeVariety: Math.round(clampNumber(summary.beforeVariety, 0, 100)),
      afterVariety: Math.round(clampNumber(summary.afterVariety, 0, 100)),
      strongestBefore: summary.strongestBefore ? cleanText(summary.strongestBefore) : null,
      strongestAfter: summary.strongestAfter ? cleanText(summary.strongestAfter) : null,
      strongestConnection: summary.strongestConnection ? cleanText(summary.strongestConnection) : null,
      loopCount: Math.round(clampNumber(summary.loopCount, 0, 500)),
    } : undefined,
    moodWeights: Array.isArray(body.moodWeights) ? body.moodWeights.slice(0, 8).map((m) => ({
      mood: cleanText(m.mood, "Mood"),
      count: Math.round(clampNumber(m.count, 0, 500)),
      percentage: clampNumber(m.percentage, 0, 100),
    })) : [],
    days: Array.isArray(body.days) ? body.days.slice(0, 7).map((day) => ({
      dayName: cleanText(day.dayName, "Day"),
      totalCaptures: Math.round(clampNumber(day.totalCaptures, 0, 200)),
      topMood: day.topMood ? cleanText(day.topMood) : null,
      dominance: clampNumber(day.dominance, 0, 1),
      mixLevel: cleanText(day.mixLevel, "empty"),
      segments: Array.isArray(day.segments) ? day.segments.slice(0, 5).map((segment) => ({
        mood: cleanText(segment.mood, "Mood"),
        count: Math.round(clampNumber(segment.count, 0, 200)),
        percentage: clampNumber(segment.percentage, 0, 100),
      })) : [],
    })) : [],
    connections: {
      before: Array.isArray(body.connections?.before) ? body.connections.before.slice(0, 8).map((item) => ({
        mood: cleanText(item.mood, "Mood"),
        count: Math.round(clampNumber(item.count, 0, 500)),
      })) : [],
      after: Array.isArray(body.connections?.after) ? body.connections.after.slice(0, 8).map((item) => ({
        mood: cleanText(item.mood, "Mood"),
        count: Math.round(clampNumber(item.count, 0, 500)),
      })) : [],
    },
  };
}

const SYSTEM_PROMPT = `You write a short, premium interpretation of a mood analytics chart.

Rules:
- Use second person.
- Use only the aggregate mood metadata provided.
- Do not imply access to notes, photos, journal text, locations, private context, or causes.
- Do not diagnose, advise clinically, or make health claims.
- Keep it to 2 short sentences, under 70 words total.
- Plain text only. No markdown, bullets, emojis, or headings.
- Never use dashes of any kind (em dash, en dash, or hyphens as punctuation). Use commas or periods instead.`;

const TONE_STYLES: Record<string, string> = {
  neutral: "Use a plain, observant, and balanced tone. Avoid emotional push or strong interpretations. Keep sentences straightforward and descriptive.",
  stoic_calm: "Use a restrained, grounded, and steady tone. Use short sentences and avoid unnecessary commentary. Focus on calm observation.",
  dry_humor: "Use a dry, understated, and subtly witty tone. Avoid sarcasm or meanness. Humor should be quiet and clever, not loud.",
  mystery_noir: "Use a moody, atmospheric, and metaphor-heavy tone. Describe the pattern like a quiet noir scene where nothing dramatic has to happen.",
  cinematic: "Describe the pattern like a scene or sequence in a film. Focus on motion, stillness, visual framing, and narrative flow.",
  dreamlike: "Use a soft, abstract, and fluid tone. Focus on gentle imagery and atmosphere without sharp conclusions.",
  romantic: "Use a warm, intimate, and emotionally close tone. Let ordinary shifts feel meaningful without becoming cheesy or overly dramatic.",
  gentle_roast: "Use a light, teasing, and affectionate tone. Never be mean or judgmental. Keep the humor warm and on the user's side.",
  inspiring: "Use an uplifting but grounded tone. Avoid slogans, cliches, or toxic positivity. Focus on quiet forward motion.",
};

function resolveToneStyle(req: MoodSignalInterpretationRequest): string {
  if (req.customTonePrompt?.trim()) {
    return `Custom tone is active. Apply this as style and perspective only, while obeying all system rules above: ${req.customTonePrompt}`;
  }
  return TONE_STYLES[req.tone ?? "neutral"] ?? TONE_STYLES.neutral;
}

function buildPrompt(req: MoodSignalInterpretationRequest): string {
  const summary = req.summary!;
  const kind = req.kind === "weekday_shape"
    ? "weekday_shape"
    : req.kind === "mood_connection"
      ? "mood_connection"
      : "weekly_signal";
  const chartLabel = kind === "weekday_shape"
    ? `${req.weekdayLabel ?? "Selected weekday"} all-time mood shape`
    : kind === "mood_connection"
      ? `${req.selectedMood ?? summary.selectedMood ?? "Selected mood"} connection dial`
      : `${req.rangeLabel} mood signal`;
  const moods = (req.moodWeights ?? [])
    .map((m) => `${m.mood}: ${m.count} (${Math.round(m.percentage)}%)`)
    .join(", ") || "none";
  const days = (req.days ?? [])
    .filter((day) => day.totalCaptures > 0)
    .map((day) => {
      const segments = day.segments.map((s) => `${s.mood} ${Math.round(s.percentage)}%`).join(", ");
      return `${day.dayName}: ${day.totalCaptures} entries, top ${day.topMood ?? "none"}, ${day.mixLevel}, ${segments}`;
    })
    .join("\n");

  const beforeConnections = (req.connections?.before ?? [])
    .map((item) => `${item.mood}: ${item.count}`)
    .join(", ") || "none";
  const afterConnections = (req.connections?.after ?? [])
    .map((item) => `${item.mood}: ${item.count}`)
    .join(", ") || "none";

  return `Chart: ${chartLabel}
Kind: ${kind}
Range: ${req.rangeLabel}
Tone: ${req.tone ?? "neutral"}
Tone style:
${resolveToneStyle(req)}

Total entries: ${summary.totalEntries}
Active days: ${summary.activeDays}
Mood variety: ${summary.moodVariety}
Dominant mood: ${summary.dominantMood ?? "none"}
Runner-up mood: ${summary.runnerUpMood ?? "none"}
Mix label: ${summary.mixLabel}
Mix score: ${Math.round(summary.mixScore * 100)}%
Strongest signal day: ${summary.strongestDay ?? "none"}
Most blended day: ${summary.mostBlendedDay ?? "none"}
Selected mood: ${req.selectedMood ?? summary.selectedMood ?? "none"}
Before variety: ${summary.beforeVariety ?? 0}
After variety: ${summary.afterVariety ?? 0}
Strongest before: ${summary.strongestBefore ?? "none"}
Strongest after: ${summary.strongestAfter ?? "none"}
Strongest connection: ${summary.strongestConnection ?? "none"}
Same-mood loop count: ${summary.loopCount ?? 0}
Mood distribution: ${moods}

Time slice summaries:
${days || "No active days."}

Connection summaries:
Before selected mood: ${beforeConnections}
After selected mood: ${afterConnections}

Write the interpretation now. For mood_connection, describe what tends to lead into and follow the selected mood. For weekday_shape, describe the selected weekday's all-time mood shape. For weekly_signal, describe the selected range's weekday signal.`;
}

serve(async (req) => {
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse(401, "auth", "Missing Authorization header", requestId);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return errorResponse(500, "unknown", "Server configuration error", requestId);
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return errorResponse(401, "auth", "Invalid or expired token", requestId);
  }

  try {
    await supabase.rpc("check_and_reset_limits", { user_uuid: user.id });
  } catch (_e) {
    // Non-fatal: the read below will still enforce the stored count.
  }

  const { data: settings, error: settingsError } = await supabase
    .from("user_settings")
    .select("subscription_tier, mood_signal_count, mood_connection_count")
    .eq("user_id", user.id)
    .maybeSingle();

  if (settingsError) {
    return errorResponse(500, "fetch", "Failed to verify usage limits", requestId);
  }

  let body: MoodSignalInterpretationRequest;
  try {
    body = sanitizeBody(await req.json());
  } catch (_e) {
    return errorResponse(400, "parse", "Invalid JSON body", requestId);
  }

  if (!body.summary || !Array.isArray(body.days) || !Array.isArray(body.moodWeights)) {
    return errorResponse(400, "validate", "Missing mood signal metadata", requestId);
  }

  if (body.summary.totalEntries < 3 || body.summary.activeDays < 1) {
    return errorResponse(422, "insufficient_data", "Not enough mood signal data to interpret", requestId);
  }

  if (body.kind === "mood_connection" && (!body.connections || (body.connections.before.length + body.connections.after.length) < 1)) {
    return errorResponse(422, "insufficient_data", "Not enough mood connection data to interpret", requestId);
  }

  const tier = normalizeTier(settings?.subscription_tier);
  const isMoodConnection = body.kind === "mood_connection";
  const limit = isMoodConnection ? MOOD_CONNECTION_LIMITS[tier] : INTERPRETATION_LIMITS[tier];
  const used = Number(isMoodConnection ? settings?.mood_connection_count ?? 0 : settings?.mood_signal_count ?? 0);
  const featureName = isMoodConnection ? "mood_connection" : "mood_signal";
  const featureLabel = isMoodConnection ? "Mood Connection interpretation" : "Mood Signal interpretation";

  if (used >= limit) {
    return errorResponse(
      429,
      "rate_limit",
      `Daily ${featureLabel} limit reached (${used}/${limit} for ${tier})`,
      requestId,
      { used, limit, remaining: 0, tier },
    );
  }

  const ai = await runAiTextTask({
    requestId,
    userId: user.id,
    feature: "mood_signal",
    task: "interpret_signal",
    systemPrompt: SYSTEM_PROMPT,
    prompt: buildPrompt(body),
    inputMode: "text",
    responseFormat: "text",
    maxTokens: 180,
    temperature: 0.55,
    providerOrder: ["deepseek", "claude", "gemini"],
    requestPayload: {
      kind: body.kind,
      range: body.range,
      tone: body.tone ?? "neutral",
      has_custom_tone: Boolean(body.customTonePrompt),
    },
  });

  if (!ai.ok) {
    return errorResponse(ai.status, ai.stage, ai.message, requestId, {
      used,
      limit,
      remaining: Math.max(0, limit - used),
      tier,
    });
  }

  const text = ai.text
    .replace(/[–—]/g, ",")   // En dash / em dash → comma
    .replace(/---?/g, ",")             // ASCII double/triple hyphens used as dashes → comma
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
  try {
    await supabase.rpc("increment_usage", { feature_name: featureName });
  } catch (_e) {
    // Don't fail the successful generation if usage tracking cannot update.
  }

  const newUsed = used + 1;

  return new Response(JSON.stringify({
    ok: true,
    requestId,
    text,
    usage: { used: newUsed, limit, remaining: Math.max(0, limit - newUsed), tier },
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

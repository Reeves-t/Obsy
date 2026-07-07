// Supabase Edge Function: topic-pulse
// Secure proxy for the DeepSeek-powered "Topic Pulse" topic engager.
//
// Privacy: this function only ever receives NON-SENSITIVE topic metadata
// (title, description, lens, tone, response energy, action). It never receives
// journal entries, mood logs, dates, notes, stats, identifiers or AI insights.
//
// Security features:
// - DeepSeek API key hidden server-side (never in the client bundle)
// - User authentication required
// - Daily rate limit per tier (free: 1, plus: 5) — enforced + counted here
// - Auto-fallback DeepSeek -> Claude -> Gemini via the shared AI router

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { runAiTextTask } from "../_shared/ai/router.ts";
import type { AiPostProcessResult } from "../_shared/ai/types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Daily Topic Pulse generations per tier. Unlike most features, Plus is a
// FINITE limit here, not unlimited. The first/auto generation per topic per day
// ("initial_pulse") is FREE and never counted against this; only manual refresh
// and the action buttons consume it.
const PULSE_LIMITS: Record<string, number> = {
  free: 5,
  plus: 10,
};

type PulseAction =
  | "initial_pulse"
  | "refresh_pulse"
  | "give_me_ideas"
  | "ask_question"
  | "teach_me_something"
  | "make_mini_plan";

const ACTION_VALUES = new Set<PulseAction>([
  "initial_pulse",
  "refresh_pulse",
  "give_me_ideas",
  "ask_question",
  "teach_me_something",
  "make_mini_plan",
]);

type FeedAction = "initial_pulse" | "refresh_pulse";
type FocusedAction = Exclude<PulseAction, FeedAction>;

// Actions that produce the full 7-card feed (vs. one focused card).
function isFeedAction(action: PulseAction): action is FeedAction {
  return action === "initial_pulse" || action === "refresh_pulse";
}

const CARD_TYPES = [
  "topic_pulse",
  "quick_tip",
  "question_drift",
  "tiny_challenge",
  "useful_angle",
  "common_trap",
  "small_next_step",
] as const;

type CardType = (typeof CARD_TYPES)[number];
const CARD_TYPE_SET = new Set<string>(CARD_TYPES);

const CARD_TITLES: Record<CardType, string> = {
  topic_pulse: "Topic Pulse",
  quick_tip: "Quick Tip",
  question_drift: "Question Drift",
  tiny_challenge: "Tiny Challenge",
  useful_angle: "Useful Angle",
  common_trap: "Common Trap",
  small_next_step: "Small Next Step",
};

interface PulseRequest {
  topicTitle?: string;
  topicDescription?: string;
  topicLens?: string;
  tone?: string;
  responseEnergy?: string;
  action?: PulseAction;
}

interface PulseCard {
  type: CardType;
  title: string;
  body: string;
}

function normalizeTier(tier: string | null | undefined): "free" | "plus" {
  return tier === "plus" ? "plus" : "free";
}

const SYSTEM_PROMPT = `You are "Topic Pulse", a calm, lightweight topic companion inside a private reflection app called Obsy.

You are given ONLY non-sensitive metadata about a topic the user is exploring: a title, an optional description, a lens, a tone, and a response energy. You have NO access to the user's private journal entries, moods, history, notes, dates, identity, or any personal data.

RULES (follow all):
- Keep everything general and based purely on the topic itself.
- NEVER imply you can see the user's private entries, logs, moods, or history.
- NEVER say things like "based on your logs", "from your entries", "your mood shows".
- Do NOT make medical, legal, financial, or clinical claims or recommendations.
- Keep the tone warm, concise, and non-judgmental. Avoid therapy language.
- Avoid over-personalization; speak to the topic, not the person's psychology.
- Honor the requested tone and response energy as a light stylistic filter.
- Each card body is at most 1-2 short sentences.
- Output VALID JSON ONLY. No markdown, no code fences, no commentary.`;

function buildUserPrompt(req: PulseRequest, action: PulseAction): string {
  const meta = [
    `Topic title: ${req.topicTitle || "Untitled topic"}`,
    `Topic description: ${req.topicDescription?.trim() ? req.topicDescription.trim() : "(none provided)"}`,
    `Topic lens: ${req.topicLens || "General"}`,
    `Tone: ${req.tone || "Neutral"}`,
    `Response energy: ${req.responseEnergy || "Balanced"}`,
  ].join("\n");

  if (isFeedAction(action)) {
    return `${meta}

Generate exactly 7 varied "pulse" cards about this topic, one of each type below, in this order:
1. topic_pulse — a grounding observation about the topic.
2. quick_tip — one practical, low-effort tip.
3. question_drift — a gentle, open reflective question.
4. tiny_challenge — a tiny, doable challenge.
5. useful_angle — a fresh, useful way to look at the topic.
6. common_trap — a common pitfall to gently avoid.
7. small_next_step — one small concrete next step.

Output JSON only, exactly this shape:
{"cards":[{"type":"topic_pulse","title":"Topic Pulse","body":"..."}, ... 7 items total ...]}`;
  }

  const focus: Record<FocusedAction, string> = {
    give_me_ideas:
      'Produce ONE focused card of type "useful_angle" offering a small set of concrete ideas for this topic, woven into 1-2 sentences.',
    ask_question:
      'Produce ONE focused card of type "question_drift" with a single thoughtful, open question about this topic.',
    teach_me_something:
      'Produce ONE focused card of type "quick_tip" teaching one genuinely useful, general thing about this topic.',
    make_mini_plan:
      'Produce ONE focused card of type "small_next_step" describing a tiny 1-2 step mini plan for this topic.',
  };

  return `${meta}

${focus[action]}

Output JSON only, exactly this shape (a single card in the array):
{"cards":[{"type":"<one of ${CARD_TYPES.join(", ")}>","title":"<short label>","body":"..."}]}`;
}

function sanitizeJSON(rawText: string): string {
  let sanitized = rawText.trim();
  sanitized = sanitized.replace(/^```json\s*/i, "");
  sanitized = sanitized.replace(/^```\s*/, "");
  sanitized = sanitized.replace(/\s*```$/, "");
  const firstBrace = sanitized.indexOf("{");
  const lastBrace = sanitized.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    sanitized = sanitized.substring(firstBrace, lastBrace + 1);
  }
  return sanitized.trim();
}

function clampBody(body: string): string {
  const text = String(body).replace(/\s+/g, " ").trim();
  if (text.length <= 220) return text;
  return `${text.slice(0, 217)}...`;
}

function coerceCard(raw: any): PulseCard | null {
  if (!raw || typeof raw !== "object") return null;
  const type: CardType = CARD_TYPE_SET.has(raw.type) ? raw.type : "topic_pulse";
  const body = typeof raw.body === "string" ? clampBody(raw.body) : "";
  if (!body) return null;
  const title =
    typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : CARD_TITLES[type];
  return { type, title, body };
}

function validatePulse(
  rawText: string,
  action: PulseAction,
): { ok: true; cards: PulseCard[] } | { ok: false; message: string } {
  let parsed: any;
  try {
    parsed = JSON.parse(sanitizeJSON(rawText));
  } catch (_e) {
    return { ok: false, message: "Topic Pulse returned invalid JSON" };
  }

  const rawCards = Array.isArray(parsed?.cards) ? parsed.cards : [];
  const cards = rawCards.map(coerceCard).filter((c: PulseCard | null): c is PulseCard => !!c);

  if (cards.length === 0) {
    return { ok: false, message: "Topic Pulse returned no usable cards" };
  }

  if (isFeedAction(action)) {
    // Want 7; accept what we got but never more than 7.
    return { ok: true, cards: cards.slice(0, 7) };
  }
  // Focused actions: a single card.
  return { ok: true, cards: cards.slice(0, 1) };
}

function errorResponse(
  stage: "auth" | "fetch" | "model" | "parse" | "validate" | "unknown",
  message: string,
  status: number,
  requestId: string,
  usage?: unknown,
): Response {
  return new Response(
    JSON.stringify({ ok: false, error: { stage, message, requestId, status }, usage }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

serve(async (req: Request) => {
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return errorResponse("auth", "Missing authorization header", 401, requestId);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      return errorResponse("unknown", "Server configuration error", 500, requestId);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return errorResponse("auth", "Invalid or expired token", 401, requestId);
    }

    // 2. Reset daily counters if it's a new day, then read the current usage.
    try {
      await supabase.rpc("check_and_reset_limits", { user_uuid: user.id });
    } catch (_e) {
      // Non-fatal: the read below will still apply yesterday's count at worst.
    }

    const { data: settings, error: settingsError } = await supabase
      .from("user_settings")
      .select("subscription_tier, topic_pulse_count")
      .eq("user_id", user.id)
      .maybeSingle();

    if (settingsError) {
      return errorResponse("fetch", "Failed to fetch user settings", 500, requestId);
    }

    const tier = normalizeTier(settings?.subscription_tier);
    const limit = PULSE_LIMITS[tier] ?? PULSE_LIMITS.free;
    const used = settings?.topic_pulse_count ?? 0;

    // 3. Parse the (non-sensitive) request body + resolve the action.
    let body: PulseRequest;
    try {
      body = await req.json();
    } catch (_e) {
      return errorResponse("parse", "Invalid request body", 400, requestId);
    }

    const action: PulseAction = ACTION_VALUES.has(body.action as PulseAction)
      ? (body.action as PulseAction)
      : "refresh_pulse";

    // The first auto-load per topic per day ("initial_pulse") is FREE and
    // uncounted; everything else (manual refresh + action buttons) is rate
    // limited and consumes a generation.
    const isInitial = action === "initial_pulse";

    if (!isInitial && used >= limit) {
      return errorResponse(
        "validate",
        `Daily Topic Pulse limit reached (${used}/${limit} for ${tier})`,
        429,
        requestId,
        { used, limit, remaining: 0, tier },
      );
    }

    // 4. Route through DeepSeek (primary), then Claude -> Gemini as fallback.
    const aiResult = await runAiTextTask({
      requestId,
      userId: user.id,
      feature: "topic_pulse",
      task: action,
      systemPrompt: SYSTEM_PROMPT,
      prompt: buildUserPrompt(body, action),
      inputMode: "text",
      responseFormat: "json",
      maxTokens: isFeedAction(action) ? 1100 : 600,
      temperature: 0.7,
      providerOrder: ["deepseek", "claude", "gemini"],
      promptVersion: "topic_pulse_v1",
      requestPayload: {
        action,
        lens: body.topicLens ?? null,
        tone: body.tone ?? null,
        energy: body.responseEnergy ?? null,
        has_description: Boolean(body.topicDescription?.trim()),
      },
      postProcess: (rawText: string): AiPostProcessResult => {
        const validated = validatePulse(rawText, action);
        if (!validated.ok) {
          return { ok: false, stage: "validate", message: validated.message, status: 502 };
        }
        return { ok: true, text: JSON.stringify({ cards: validated.cards }) };
      },
    });

    if (!aiResult.ok) {
      // Do NOT increment usage on failure — a failed call never burns the limit.
      return errorResponse(
        aiResult.stage === "config" ? "unknown" : aiResult.stage,
        aiResult.message,
        aiResult.status,
        requestId,
        { used, limit, remaining: limit - used, tier },
      );
    }

    const cards: PulseCard[] = JSON.parse(aiResult.text).cards;

    // 5. Count this successful generation against the daily limit — but the
    // free initial auto-load never counts.
    if (!isInitial) {
      try {
        await supabase.rpc("increment_usage", { feature_name: "topic_pulse" });
      } catch (_e) {
        // Don't fail the request for a usage-tracking error.
      }
    }

    const newUsed = isInitial ? used : used + 1;
    return new Response(
      JSON.stringify({
        ok: true,
        cards,
        usage: { used: newUsed, limit, remaining: Math.max(0, limit - newUsed), tier },
        requestId,
        providerUsed: aiResult.providerUsed,
        modelUsed: aiResult.modelUsed,
        fallbackUsed: aiResult.fallbackUsed,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error(`[topic-pulse] [${requestId}] Edge function error:`, error);
    return errorResponse("unknown", "Internal server error", 500, requestId);
  }
});

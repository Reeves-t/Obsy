// Supabase Edge Function: unpack-reflection
// Two-step guided reflection ("Unpack"):
//   step 'questions'  -> generate exactly 3 clarifying questions
//   step 'reflection' -> generate a reviewable first-person reflection draft
//
// Plus-only, 10/day. Processes RAW journal text + user answers + (optionally) an
// image, so it MUST route Claude -> Gemini only. DeepSeek is never used here.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { runAiTextTask } from "../_shared/ai/router.ts";
import type { AiPostProcessResult, AiProviderName } from "../_shared/ai/types.ts";
import { sanitizeProfileContext } from "../_shared/ai/profileContext.ts";
import {
  buildQuestionsPrompt,
  buildReflectionPrompt,
  IMAGE_DESCRIBE_PROMPT,
  IMAGE_DESCRIBE_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
  type UnpackAnswerInput,
  type UnpackContextInput,
  type UnpackEntryType,
  type UnpackMoodInput,
} from "./prompts.ts";

type SubscriptionTier = "free" | "plus";

// Raw text + image → Claude primary, Gemini fallback. NEVER DeepSeek.
const PROVIDER_ORDER: AiProviderName[] = ["claude", "gemini"];
const UNPACK_DAILY_LIMIT = 10; // Plus only.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface UnpackRequest {
  step?: "questions" | "reflection";
  context?: {
    type?: UnpackEntryType;
    text?: string;
    transcript?: string;
    imageBase64?: string;
    imageMimeType?: string;
    imageContext?: string;
    linkSummary?: string;
    linkTitle?: string;
    source?: string;
  };
  mood?: { id?: string; name?: string };
  questions?: Array<{ question?: string; answer?: string; skipped?: boolean }>;
  profileContext?: string;
}

interface UsageEnvelope {
  used: number;
  limit: number;
  remaining: number;
  tier: SubscriptionTier;
}

// ── helpers ────────────────────────────────────────────────────────────────

function normalizeTier(tier: string | null | undefined): SubscriptionTier {
  if (tier === "plus") return "plus";
  if (tier && ["founder", "subscriber", "lifetime", "premium", "pro"].includes(tier)) return "plus";
  return "free";
}

function clampText(value: unknown, max: number): string {
  return String(value ?? "")
    // Collapse horizontal whitespace but preserve newlines so paragraphs survive.
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

const VALID_TYPES: UnpackEntryType[] = ["text", "photo", "voice", "link"];

function sanitizeContext(raw: UnpackRequest["context"]): UnpackContextInput & {
  imageBase64?: string;
  imageMimeType?: string;
} {
  const type = VALID_TYPES.includes(raw?.type as UnpackEntryType) ? (raw!.type as UnpackEntryType) : "text";
  return {
    type,
    text: clampText(raw?.text, 4000),
    transcript: clampText(raw?.transcript, 8000),
    imageContext: clampText(raw?.imageContext, 1200),
    linkSummary: clampText(raw?.linkSummary, 4000),
    linkTitle: clampText(raw?.linkTitle, 400),
    source: clampText(raw?.source, 200),
    imageBase64: typeof raw?.imageBase64 === "string" ? raw.imageBase64 : undefined,
    imageMimeType: clampText(raw?.imageMimeType, 60) || "image/jpeg",
  };
}

function stripFences(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
}

function sanitizeDashes(text: string): string {
  if (!text) return "";
  return text
    .replace(/[–—]/g, ",")   // En dash / em dash → comma
    .replace(/---?/g, ",")             // ASCII double/triple hyphens used as dashes → comma
    .trim();
}

function sliceJsonObject(text: string): string {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return text;
  return text.slice(first, last + 1);
}

function okResponse(payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ ok: true, ...payload }), {
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
  return new Response(
    JSON.stringify({ ok: false, requestId, error: { stage, message, status }, ...extra }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

// ── Vision: describe the image directly (Claude primary, Gemini fallback) ─────
// The shared router only sends text prompts, so image understanding is a
// self-contained call here rather than through runAiTextTask.

async function describeImageWithClaude(base64: string, mimeType: string): Promise<string | null> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return null;
  const model = Deno.env.get("AI_CLAUDE_MODEL") ?? Deno.env.get("ANTHROPIC_MODEL") ?? "claude-haiku-4-5-20251001";
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 300,
        temperature: 0.2,
        system: IMAGE_DESCRIBE_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } },
              { type: "text", text: IMAGE_DESCRIBE_PROMPT },
            ],
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = Array.isArray(data?.content)
      ? data.content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("\n").trim()
      : "";
    return text || null;
  } catch {
    return null;
  }
}

async function describeImageWithGemini(base64: string, mimeType: string): Promise<string | null> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return null;
  const model = Deno.env.get("AI_GEMINI_MODEL") ?? "gemini-2.5-flash";
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: IMAGE_DESCRIBE_SYSTEM_PROMPT }] },
          contents: [
            {
              role: "user",
              parts: [
                { inlineData: { mimeType, data: base64 } },
                { text: IMAGE_DESCRIBE_PROMPT },
              ],
            },
          ],
          generationConfig: { temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } },
        }),
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts?.filter((p: any) => !p?.thought) ?? [];
    const text = parts.map((p: any) => (typeof p?.text === "string" ? p.text : "")).filter(Boolean).join("\n").trim();
    return text || null;
  } catch {
    return null;
  }
}

async function describeImage(base64: string, mimeType: string): Promise<string | null> {
  return (await describeImageWithClaude(base64, mimeType)) ?? (await describeImageWithGemini(base64, mimeType));
}

// ── main ────────────────────────────────────────────────────────────────────

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
    return errorResponse(500, "config", "Server configuration error", requestId);
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return errorResponse(401, "auth", "Invalid or expired token", requestId);
  }

  // Parse + sanitize
  let body: UnpackRequest;
  try {
    body = (await req.json()) as UnpackRequest;
  } catch {
    return errorResponse(400, "parse", "Invalid JSON body", requestId);
  }

  const step = body.step === "reflection" ? "reflection" : body.step === "questions" ? "questions" : null;
  if (!step) {
    return errorResponse(400, "validate", "step must be 'questions' or 'reflection'", requestId);
  }

  const context = sanitizeContext(body.context);
  const mood: UnpackMoodInput = { id: body.mood?.id, name: clampText(body.mood?.name, 80) || "unspecified" };
  const profileContext = sanitizeProfileContext(body.profileContext);

  // ── Plus gate + daily limit ────────────────────────────────────────────
  try {
    await supabase.rpc("check_and_reset_limits", { user_uuid: user.id });
  } catch (_e) {
    // Non-fatal; the stored count below is still enforced.
  }

  const { data: settings, error: settingsError } = await supabase
    .from("user_settings")
    .select("subscription_tier, unpack_count")
    .eq("user_id", user.id)
    .maybeSingle();

  if (settingsError) {
    return errorResponse(500, "fetch", "Failed to verify usage limits", requestId);
  }

  const tier = normalizeTier(settings?.subscription_tier);
  if (tier !== "plus") {
    return errorResponse(403, "plus_required", "Unpack is a Plus feature", requestId, {
      usage: { used: 0, limit: UNPACK_DAILY_LIMIT, remaining: 0, tier } as UsageEnvelope,
    });
  }

  const used = Number(settings?.unpack_count ?? 0);
  if (used >= UNPACK_DAILY_LIMIT) {
    return errorResponse(429, "rate_limit", `Daily Unpack limit reached (${used}/${UNPACK_DAILY_LIMIT})`, requestId, {
      usage: { used, limit: UNPACK_DAILY_LIMIT, remaining: 0, tier } as UsageEnvelope,
    });
  }

  // ── Vision enrichment (photo, no description yet) ──────────────────────
  let imageContext = context.imageContext;
  if (context.type === "photo" && !imageContext && context.imageBase64) {
    const described = await describeImage(context.imageBase64, context.imageMimeType || "image/jpeg");
    if (described) imageContext = described.slice(0, 1200);
  }
  const promptContext: UnpackContextInput = { ...context, imageContext };

  // ── Step A: questions ───────────────────────────────────────────────────
  if (step === "questions") {
    const ai = await runAiTextTask({
      requestId,
      userId: user.id,
      feature: "unpack",
      task: "unpack_questions",
      systemPrompt: SYSTEM_PROMPT,
      prompt: buildQuestionsPrompt(promptContext, mood, profileContext),
      inputMode: "text",
      responseFormat: "json",
      maxTokens: 500,
      temperature: 0.6,
      providerOrder: PROVIDER_ORDER,
      promptVersion: "unpack_questions_v1",
      requestPayload: { entry_type: context.type, has_image_context: Boolean(imageContext) },
      postProcess: (raw): AiPostProcessResult => {
        try {
          const obj = JSON.parse(sliceJsonObject(stripFences(raw)));
          const qs = Array.isArray(obj?.questions) ? obj.questions : [];
          const normalized = qs
            .map((q: any, i: number) => ({
              id: typeof q?.id === "string" && q.id ? q.id : `q${i + 1}`,
              question: sanitizeDashes(clampText(q?.question, 240)),
            }))
            .filter((q: { question: string }) => q.question.length > 0)
            .slice(0, 3);
          if (normalized.length !== 3) {
            return { ok: false, stage: "validate", message: "Expected exactly 3 questions", status: 502 };
          }
          return { ok: true, text: JSON.stringify(normalized) };
        } catch (e: any) {
          return { ok: false, stage: "parse", message: `Malformed questions JSON: ${e?.message ?? "unknown"}`, status: 502 };
        }
      },
    });

    if (!ai.ok) {
      return errorResponse(ai.status, ai.stage, ai.message, requestId);
    }

    const questions = JSON.parse(ai.text) as Array<{ id: string; question: string }>;
    return okResponse({
      requestId,
      questions,
      imageContext: imageContext || null,
      usage: { used, limit: UNPACK_DAILY_LIMIT, remaining: Math.max(0, UNPACK_DAILY_LIMIT - used), tier } as UsageEnvelope,
    });
  }

  // ── Step B: reflection ──────────────────────────────────────────────────
  const answers: UnpackAnswerInput[] = Array.isArray(body.questions)
    ? body.questions.slice(0, 3).map((q) => ({
        question: clampText(q?.question, 240),
        answer: clampText(q?.answer, 2000),
        skipped: Boolean(q?.skipped),
      }))
    : [];

  const ai = await runAiTextTask({
    requestId,
    userId: user.id,
    feature: "unpack",
    task: "unpack_reflection",
    systemPrompt: SYSTEM_PROMPT,
    prompt: buildReflectionPrompt(promptContext, mood, answers, profileContext),
    inputMode: "text",
    responseFormat: "json",
    maxTokens: 900,
    temperature: 0.6,
    providerOrder: PROVIDER_ORDER,
    promptVersion: "unpack_reflection_v1",
    requestPayload: { entry_type: context.type, answered: answers.filter((a) => !a.skipped).length },
    postProcess: (raw): AiPostProcessResult => {
      try {
        const obj = JSON.parse(sliceJsonObject(stripFences(raw)));
        const reflection = sanitizeDashes(clampText(obj?.reflection, 4000));
        if (!reflection) {
          return { ok: false, stage: "validate", message: "Missing reflection text", status: 502 };
        }
        const normalized = {
          title: sanitizeDashes(clampText(obj?.title, 120)) || "Unpacked Moment",
          reflection,
          suggestedMood: clampText(obj?.suggestedMood, 80) || mood.name,
          themes: (Array.isArray(obj?.themes) ? obj.themes : [])
            .map((t: any) => clampText(t, 60))
            .filter(Boolean)
            .slice(0, 6),
          insightSignals: (Array.isArray(obj?.insightSignals) ? obj.insightSignals : [])
            .map((t: any) => clampText(t, 60))
            .filter(Boolean)
            .slice(0, 4),
          entryBadge: "Guided reflection",
        };
        return { ok: true, text: JSON.stringify(normalized) };
      } catch (e: any) {
        return { ok: false, stage: "parse", message: `Malformed reflection JSON: ${e?.message ?? "unknown"}`, status: 502 };
      }
    },
  });

  if (!ai.ok) {
    return errorResponse(ai.status, ai.stage, ai.message, requestId, {
      usage: { used, limit: UNPACK_DAILY_LIMIT, remaining: Math.max(0, UNPACK_DAILY_LIMIT - used), tier } as UsageEnvelope,
    });
  }

  // Count a completed Unpack only when the reflection succeeds.
  try {
    await supabase.rpc("increment_usage", { feature_name: "unpack" });
  } catch (_e) {
    // Don't fail a successful generation if usage tracking cannot update.
  }
  const newUsed = used + 1;

  const reflection = JSON.parse(ai.text);
  return okResponse({
    requestId,
    reflection,
    imageContext: imageContext || null,
    usage: { used: newUsed, limit: UNPACK_DAILY_LIMIT, remaining: Math.max(0, UNPACK_DAILY_LIMIT - newUsed), tier } as UsageEnvelope,
  });
});

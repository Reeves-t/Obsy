// Supabase Edge Function: generate-insight-card
// Generates a shareable Moodverse insight card (reflective or analytical) from mood captures.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { runAiTextTask } from "../_shared/ai/router.ts";
import type { AiPostProcessResult } from "../_shared/ai/types.ts";

interface CaptureData {
  mood: string;
  note?: string;
  capturedAt: string;
  tags?: string[];
}

type CardType = "reflective" | "analytical";
type CardScope = "all" | "specific";

interface InsightCardRequest {
  cardType: CardType;
  scope: CardScope;
  moodFilter?: string | null;
  dateFrom: string;
  dateTo: string;
  tone?: string;
  customTonePrompt?: string;
  captures: CaptureData[];
}

interface InsightCardSuccess {
  ok: true;
  requestId: string;
  title: string;
  body: string;
  emotionalTheme?: string;
  dominantMoods?: string[];
  cardType: CardType;
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

const RATE_LIMIT_PER_DAY = 10;

const TONE_STYLES: Record<string, string> = {
  neutral: "Plain, clear, unadorned. Observational distance. Calm witness with no agenda.",
  stoic_calm: "Sparse, deliberate, measured. Short sentences dominate. Acceptance without commentary.",
  dry_humor: "Understated, slightly wry. Humor lands through timing. Never dismissive.",
  mystery_noir: "Shadowed, atmospheric, weighted. Rich imagery. Everything feels significant.",
  cinematic: "Visual, spatial, sensory. Write in frames. Let visuals carry the emotion.",
  dreamlike: "Soft, fluid, slightly abstract. Impressionistic. Emotions felt rather than named.",
  romantic: "Warm, textured, intimate. Sensory and close. Everything felt fully.",
  gentle_roast: "Casual, affectionate, slightly teasing. Always warm underneath. Never punch down.",
  inspiring: "Grounded, forward-leaning, resolute. Quiet conviction. Momentum without hype.",
};

const REFLECTIVE_SYSTEM_PROMPT = `You are generating a premium Moodverse insight card — a polished emotional recap of a period of time.

VOICE RULES:
- Second person only. Use "you" and "your".
- Never use third person pronouns: he, she, him, her, they, them.
- No emojis, markdown, bullets, or list formatting.
- No question marks. No exclamation marks.
- No dashes (em dash, en dash). Use: periods, commas, colons, semicolons, parentheses, apostrophes.
- Never reference the app, captures, or data. Write as if observing life directly.
- No therapy language ("healing", "journey", "growth").
- No AI self-reference.

CARD STRUCTURE (return as JSON):
{
  "title": "A short evocative title for this period (4-8 words, no quotes)",
  "body": "3-5 sentences of emotionally resonant reflection. Help the reader revisit this stretch of time. What was the emotional texture of this period.",
  "emotionalTheme": "One brief phrase naming the emotional theme of this period (3-6 words)"
}

RULES:
- The title must feel earned and specific to this data, not generic.
- The body should help the person remember what this period felt like emotionally.
- End with one quiet, closing observation or takeaway.
- Keep total body under 150 words.
- Return only valid JSON. No markdown code fences.`;

const ANALYTICAL_SYSTEM_PROMPT = `You are generating a premium Moodverse analytical insight card — a structured pattern summary of a period of time.

VOICE RULES:
- Second person only. Use "you" and "your".
- Never use third person pronouns: he, she, him, her, they, them.
- No emojis or markdown within text values.
- No question marks. No exclamation marks.
- No dashes (em dash, en dash). Use: periods, commas, colons, semicolons, parentheses, apostrophes.
- Never reference the app, captures, or data. Write as if observing patterns directly.
- No therapy language ("healing", "journey", "growth").
- No AI self-reference.

CARD STRUCTURE (return as JSON):
{
  "title": "A short analytical title for this period (4-8 words, no quotes)",
  "dominantMoods": ["mood1", "mood2", "mood3"],
  "body": "A structured 2-3 sentence summary covering: dominant emotional patterns, any notable shifts or trends, and a brief interpretation of what the data suggests about this period.",
  "notableShift": "One sentence describing the most notable mood transition or pattern if present, or null if none stands out"
}

RULES:
- The title must be specific and pattern-oriented.
- dominantMoods: list the 2-4 most frequent moods, ordered by frequency.
- The body should be structured and pattern-driven, not poetic.
- Keep total body under 120 words.
- Return only valid JSON. No markdown code fences.`;

function buildPrompt(req: InsightCardRequest): string {
  const { cardType, scope, moodFilter, dateFrom, dateTo, captures, tone, customTonePrompt } = req;

  const dateRange = `${dateFrom} to ${dateTo}`;
  const captureCount = captures.length;

  const moodSummary = captures.reduce<Record<string, number>>((acc, c) => {
    acc[c.mood] = (acc[c.mood] || 0) + 1;
    return acc;
  }, {});

  const sortedMoods = Object.entries(moodSummary)
    .sort(([, a], [, b]) => b - a)
    .map(([mood, count]) => `${mood} (${count}x)`)
    .join(", ");

  const captureLines = captures
    .slice(0, 40)
    .map((c) => {
      const parts = [`[${c.capturedAt}] mood: ${c.mood}`];
      if (c.note) parts.push(`note: "${c.note.slice(0, 120)}"`);
      if (c.tags?.length) parts.push(`tags: ${c.tags.join(", ")}`);
      return parts.join(" | ");
    })
    .join("\n");

  let toneInstruction = "";
  if (customTonePrompt) {
    toneInstruction = `\nTONE: ${customTonePrompt}`;
  } else if (tone && TONE_STYLES[tone]) {
    toneInstruction = `\nTONE: ${TONE_STYLES[tone]}`;
  }

  const scopeNote = scope === "specific" && moodFilter
    ? `This card focuses specifically on captures where the mood was: ${moodFilter}.`
    : "This card covers all moods in the date range.";

  return `Generate a ${cardType} insight card for the period ${dateRange}.

${scopeNote}
Total captures in range: ${captureCount}
Mood distribution: ${sortedMoods}
${toneInstruction}

Captures (chronological):
${captureLines}

Return the JSON card structure described in your instructions.`;
}

function parseCardResponse(text: string, cardType: CardType): { title: string; body: string; emotionalTheme?: string; dominantMoods?: string[] } {
  const cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      title: String(parsed.title || "A Moment in Time"),
      body: String(parsed.body || ""),
      emotionalTheme: parsed.emotionalTheme ? String(parsed.emotionalTheme) : undefined,
      dominantMoods: Array.isArray(parsed.dominantMoods) ? parsed.dominantMoods.map(String) : undefined,
    };
  } catch {
    // Fallback: treat the whole text as body
    return {
      title: "A Moment in Time",
      body: cleaned.slice(0, 500),
    };
  }
}

serve(async (req) => {
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const errorResponse = (status: number, stage: string, message: string): Response => {
    const body: ErrorEnvelope = { ok: false, requestId, error: { stage, message, status } };
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  };

  // Auth
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return errorResponse(401, "auth", "Missing Authorization header");
  }

  // Parse body
  let body: InsightCardRequest;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "parse", "Invalid JSON body");
  }

  const { cardType, captures, dateFrom, dateTo } = body;

  if (!cardType || !["reflective", "analytical"].includes(cardType)) {
    return errorResponse(400, "validate", "cardType must be 'reflective' or 'analytical'");
  }

  if (!Array.isArray(captures)) {
    return errorResponse(400, "validate", "captures must be an array");
  }

  if (!dateFrom || !dateTo) {
    return errorResponse(400, "validate", "dateFrom and dateTo are required");
  }

  // Insufficient data guard
  if (captures.length < 3) {
    const envelope: ErrorEnvelope = {
      ok: false,
      requestId,
      error: {
        stage: "insufficient_data",
        message: "Not enough captures for a meaningful card. Log more entries and try again.",
        status: 422,
      },
    };
    return new Response(JSON.stringify(envelope), {
      status: 422,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const systemPrompt = cardType === "reflective" ? REFLECTIVE_SYSTEM_PROMPT : ANALYTICAL_SYSTEM_PROMPT;
  const userPrompt = buildPrompt(body);

  const result = await runAiTextTask({
    requestId,
    feature: "insight_card",
    task: `generate_${cardType}_card`,
    prompt: userPrompt,
    systemPrompt,
    responseFormat: "text",
    maxTokens: 600,
    temperature: 0.7,
  });

  if (!result.ok) {
    return errorResponse(result.status, result.stage, result.message);
  }

  const parsed = parseCardResponse(result.text, cardType);

  const success: InsightCardSuccess = {
    ok: true,
    requestId,
    title: parsed.title,
    body: parsed.body,
    emotionalTheme: parsed.emotionalTheme,
    dominantMoods: parsed.dominantMoods,
    cardType,
  };

  return new Response(JSON.stringify(success), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

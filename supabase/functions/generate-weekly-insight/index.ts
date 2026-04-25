// Supabase Edge Function: generate-weekly-insight
// Generates weekly insights with isolated routing, strict envelopes, CORS, and auth.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { runAiTextTask } from "../_shared/ai/router.ts";
import type { AiPostProcessResult } from "../_shared/ai/types.ts";

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
  `ROLE: You are writing a weekly mood insight as a direct reflection of the user's emotional weather across the past 7 days.

WHAT TO DO: Identify the 2-3 most notable patterns, contrasts, or shifts from the week. Focus on mood patterns, fluctuations, and emotional undercurrents such as resistance versus acceptance, craving intensity, relational tension, avoidance versus reality, steadiness versus volatility.

Do NOT narrate the week chronologically. Do NOT list what happened day by day. Synthesize what the data reveals about this person's emotional week. Connect dots they might not have noticed.
Do NOT directly quote journal entries or name specific chores, errands, or literal actions. Speak indirectly about what brought the moods and how the week felt.

End with one crisp closing observation or gentle nudge. It should feel specific to the week's mood arc, not generic. Match the closing to the active tone.

LENGTH:
- Maximum 220 words for the full narrative.
- Highlight 2-3 key patterns or shifts.
- If the data is sparse, stay brief and sharp instead of padding.

VOICE RULES:
- Second person only. Use "you", "your", and "your week" naturally.
- Never use third person pronouns for the user: he, she, him, her, his, they, them, their, theirs.
- No therapy language (healing, journey, growth, self-care, boundaries).
- No exclamation marks, no question marks, no dashes (em dash, en dash, hyphen as punctuation). Only use periods, commas, colons, semicolons, parentheses, apostrophes.
- No markdown formatting, no emojis.
- Continuous prose. No bullet points or lists.
- Apply the user's selected tone throughout, including the closing observation.
- BANNED starters: "Ah", "Oh", "Well", "So", "Hmm". Never use these.
- No AI self-reference. Never acknowledge being an AI or narrator.
- Never reference the app, captures, data, or the act of recording.
- Keep the writing concise, wise, non-literal, and natural.

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
- Write in second person using "you" and "your"
- Never use third person pronouns for the user
- No markdown, emojis, or list formatting
- No questions of any kind
- No date or calendar references
- Keep the narrative under 220 words
- Avoid directly naming literal journal actions or quoting journal text

Do not dilute the tone. Lean into it fully. The reader chose this voice for a reason.`;
}

serve(async (req) => {
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log(`[WEEKLY_INSIGHT_REQUEST] requestId: ${requestId} | method: ${req.method}`);

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

    const aiResult = await runAiTextTask({
      requestId,
      feature: "generate_weekly_insight",
      task: "weekly_insight",
      prompt,
      inputMode: "text",
      responseFormat: "json",
      maxTokens: 1200,
      temperature: 0.85,
      promptVersion: "generate_weekly_insight_v2",
      requestPayload: {
        tone,
        has_custom_tone: Boolean(body.customTonePrompt),
        capture_count: captures.length,
        week_label: body.weekLabel ?? "This week",
      },
      postProcess: (rawText: string): AiPostProcessResult => {
        const extracted = extractText(rawText, requestId);
        const text = sanitizeText(extracted);
        if (!text) {
          return {
            ok: false,
            stage: "validate",
            message: "AI generated empty or invalid response",
            status: 500,
          };
        }
        return validateInsightNarrative(text, 220);
      },
    });

    if (!aiResult.ok) {
      console.error(
        `[WEEKLY_INSIGHT_ERROR] requestId: ${requestId} | stage: ai_router | message: ${aiResult.message}`
      );
      return errorResponse(aiResult.status, aiResult.stage, aiResult.message, requestId);
    }

    const sanitized = aiResult.text;

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
    `Total captures this week: ${input.captures.length}`,
    "",
    "CAPTURES BY DAY (chronological):",
    dayLines,
    "",
    "Identify the 2-3 most notable mood patterns, contrasts, or shifts. Do NOT narrate day by day.",
    "Speak to the user directly about your week and how it felt.",
    "Focus on emotional undercurrents rather than literal play by play details.",
    "Do not directly quote or name specific journal actions or chores. Refer to them indirectly through the mood they created.",
    "End with one crisp closing observation or gentle nudge tied to the week's emotional arc.",
    "Keep the narrative under 220 words.",
    "Do not mention specific dates or day names in the narrative.",
    "Use \\n\\n (double newlines) between paragraphs.",
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

function extractText(raw: string, requestId: string): string {
  const cleaned = raw
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  try {
    const insight = JSON.parse(cleaned);
    const narrativeText = insight?.narrative?.text ?? insight?.insight ?? insight?.text;
    if (typeof narrativeText === "string" && narrativeText.trim()) {
      console.log(
        `[EXTRACT_TEXT_SUCCESS] requestId: ${requestId} | parsed JSON and extracted narrative text`
      );
      return narrativeText;
    }
  } catch {
    if (cleaned && !cleaned.startsWith("{") && !cleaned.startsWith("[")) {
      return cleaned;
    }
  }

  console.warn(`[EXTRACT_TEXT_FAILED] requestId: ${requestId} | unable to extract weekly narrative`);
  return "";
}

function sanitizeText(text: string): string {
  if (!text) return "";
  return text
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "")  // Control characters except \n (0x0A)
    .replace(/[\u2013\u2014]/g, ",")          // En dash / em dash → comma
    .replace(/---?/g, ",")                    // ASCII double/triple hyphens used as dashes → comma
    .trim();
}

function validateInsightNarrative(text: string, maxWords: number): AiPostProcessResult {
  const wordCount = countWords(text);
  if (wordCount > maxWords) {
    return {
      ok: false,
      stage: "validate",
      message: `Narrative exceeds ${maxWords} words`,
      status: 502,
    };
  }

  if (containsThirdPersonPronouns(text)) {
    return {
      ok: false,
      stage: "validate",
      message: "Narrative used forbidden third-person pronouns",
      status: 502,
    };
  }

  if (!containsSecondPerson(text)) {
    return {
      ok: false,
      stage: "validate",
      message: "Narrative must address the user in second person",
      status: 502,
    };
  }

  return { ok: true, text };
}

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function containsThirdPersonPronouns(text: string): boolean {
  return /\b(he|she|him|her|his|hers|they|them|their|theirs|himself|herself|themselves)\b/i.test(text);
}

function containsSecondPerson(text: string): boolean {
  return /\b(you|your|yours|you're|you've|you'll)\b/i.test(text);
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

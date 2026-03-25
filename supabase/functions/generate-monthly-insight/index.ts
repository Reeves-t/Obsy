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
  monthPhrase?: string;
  aiReasoning?: string;
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
  `ROLE: You are writing a monthly mood insight for a journaling app. You have access to this person's full month of mood captures, pre-computed signals (dominant mood, runner-up mood, volatility score, active days, last 7 days shift), and day-by-day summaries.

WHAT TO DO: Identify the 2-3 most revealing patterns from this month. Look for:
- Moods that cluster together (do certain moods always appear near each other?)
- Transitions that repeat (does one mood consistently lead to another?)
- Time-based patterns (weekday vs weekend, beginning vs end of month)
- The relationship between the dominant mood and the runner-up, do they complement or contradict?
- Gaps in logging, what do the silences suggest?
- Shifts in the last week vs the rest of the month

Do NOT narrate the month chronologically. Do NOT walk through week by week or day by day. Synthesize what the full month reveals as a whole. Connect patterns across the entire period.

End with a single closing observation, one sentence that reframes the insight with a slightly wry, unexpected, or cleverly observational angle. This line must reference a specific pattern from their data. Think of it as the line that makes someone think "huh, I never noticed that." Match the closing to the active tone.

VOICE RULES:
- Third person only. Never "you" or "your."
- No therapy language (healing, journey, growth, self-care, boundaries).
- No exclamation marks, no question marks, no dashes (em dash, en dash, hyphen as punctuation). Only use periods, commas, colons, semicolons, parentheses, apostrophes.
- No markdown formatting, no emojis.
- No mood label verbatim leakage in isolation, always contextualize moods with counts, dates, or transitions.
- First word from approved set: "The", "A", or time references.
- Continuous prose. No bullet points or lists.
- Apply the user's selected tone throughout, including the closing observation.
- BANNED starters: "Ah", "Oh", "Well", "So", "Hmm". Never use these.
- No character names, roleplay, or AI self-reference.
- Never reference the app, captures, data, or the act of recording.
- NEVER mention raw numbers, percentages, or statistics. Paint an emotional picture.

EMBODY THE TONE COMPLETELY. The tone style must shape your vocabulary, sentence rhythm, imagery density, and emotional weight. The tone is not a suggestion. It is the voice.`;

const TONE_STYLES: Record<string, string> = {
  neutral: `NEUTRAL TONE:
Vocabulary: Plain, clear, unadorned. Prefer common words over literary ones.
Rhythm: Even sentence lengths. Steady pacing. No dramatic variation.
Imagery: Minimal. Only describe what is directly present across the period.
Emotional weight: Observational distance. Note what happened without interpreting why.
Closing observation example: "Calm appeared 8 times but never on consecutive days."`,

  stoic_calm: `STOIC / CALM TONE:
Vocabulary: Sparse, deliberate, measured. Every word must earn its place.
Rhythm: Short sentences dominate. Occasional longer sentence for grounding. No rushing.
Imagery: Stripped back. Bare landscape. Only essential details across the arc.
Emotional weight: Acceptance without commentary. Stillness even in turbulence. No flinching.
Closing observation example: "The pattern suggests the stillness was chosen, not accidental."`,

  dry_humor: `DRY HUMOR TONE:
Vocabulary: Understated, slightly wry. Observations that carry a quiet smirk.
Rhythm: Mix short punchy lines with longer setups. Let the humor land through timing, not emphasis.
Imagery: Everyday patterns noticed with a slightly tilted perspective. The mundane made gently absurd.
Emotional weight: Light touch even on heavy stretches. Never dismissive, just gently irreverent.
Closing observation example: "Annoyed took weekends off, which is more than can be said for most people."`,

  mystery_noir: `MYSTERY / NOIR TONE:
Vocabulary: Shadowed, atmospheric, weighted. Words should feel like they carry smoke and low light.
Rhythm: Varied. Short fragments for tension. Longer sentences for atmosphere. Pauses matter.
Imagery: Rich. Shadows, light contrasts, textures, silence. The arc has mood lighting.
Emotional weight: Everything carries slightly more gravity than expected. Subtle tension underneath.
Closing observation example: "The gap in the middle of the month left no evidence, only a shift that followed."`,

  cinematic: `CINEMATIC TONE:
Vocabulary: Visual, spatial, sensory. Write in frames and sequences.
Rhythm: Flowing. Sentences that track movement or stillness like a slow camera pan across days.
Imagery: High density. Describe the arc as if editing a film sequence. Light, space, composition.
Emotional weight: Present but understated. Let the visuals carry emotion, not the words.
Closing observation example: "The final act belonged to Focused, arriving late but commanding every remaining scene."`,

  dreamlike: `DREAMLIKE TONE:
Vocabulary: Soft, fluid, slightly abstract. Words should blur at the edges.
Rhythm: Gentle, unhurried. Sentences that drift rather than march. No sharp stops or hard landings.
Imagery: Impressionistic. Colors bleed, edges soften, time stretches across the period.
Emotional weight: Emotions are felt rather than named. Everything floats slightly above the concrete.
Closing observation example: "Tender drifted through the weeks like fog, never quite lifting, never quite settling."`,

  romantic: `ROMANTIC TONE:
Vocabulary: Warm, textured, intimate. Words chosen with care and tenderness.
Rhythm: Flowing but grounded. Sentences that lean into moments rather than rush past them.
Imagery: Sensory and close. Warmth, texture, proximity. The arc noticed with tenderness.
Emotional weight: Everything is felt fully. Heavy stretches are held gently, not fixed. Light moments glow.
Closing observation example: "The most consistent presence was Peaceful, always arriving after the house went quiet."`,

  gentle_roast: `GENTLE ROAST TONE:
Vocabulary: Casual, affectionate, slightly teasing. The humor of knowing someone well.
Rhythm: Conversational. Quick observations followed by dry asides. Keep it moving, keep it light.
Imagery: Everyday patterns. Find the comedy in recurring themes without reaching for it.
Emotional weight: Always warm underneath. The teasing is closeness, never distance. Never punch down.
Closing observation example: "Motivated showed up exactly twice, both times on the last possible day, a procrastinator's signature."`,

  inspiring: `INSPIRING TONE:
Vocabulary: Grounded, forward-leaning, resolute. No slogans, no motivational posters, no cliches.
Rhythm: Building momentum. Sentences that gather strength without becoming grandiose.
Imagery: Movement, light, steady progress. Small patterns framed as genuinely meaningful.
Emotional weight: Quiet conviction. Belief without preaching. Momentum without hype.
Closing observation example: "The shift from Restless to Focused took 11 days, but it held once it landed."`,

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
- The closing observation must also match this tone

Core constraints (maintain while fully inhabiting the tone):
- Write in third person (never "you", "your")
- No markdown, emojis, or list formatting
- No questions of any kind

Do not dilute the tone. Lean into it fully. The reader chose this voice for a reason.`;
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
    let monthPhrase: string | undefined;
    let aiReasoning: string | undefined;
    try {
      const rawText = await callGemini(prompt, requestId);
      const result = extractStructuredResponse(rawText, requestId);
      sanitized = sanitizeText(result.text);
      monthPhrase = result.monthPhrase ? sanitizeText(result.monthPhrase) : undefined;
      aiReasoning = result.aiReasoning ? sanitizeText(result.aiReasoning) : undefined;
    } catch (error: any) {
      console.error(`[MONTHLY_INSIGHT_ERROR] requestId: ${requestId} | stage: gemini_api | message: ${error?.message ?? "Gemini call failed"}`);
      return errorResponse(502, "gemini_api", error?.message || "Gemini call failed", requestId);
    }

    if (!validateGeminiResponse(sanitized)) {
      console.error(
        `[MONTHLY_INSIGHT_ERROR] requestId: ${requestId} | stage: response_validation | message: Empty or invalid Gemini response | length: ${sanitized?.length ?? 0}`
      );
      return errorResponse(500, "response_validation", "AI generated empty or invalid response", requestId);
    }

    console.log(`[MONTHLY_INSIGHT_SUCCESS] requestId: ${requestId} | textLength: ${sanitized.length} | monthPhrase: ${monthPhrase ?? "n/a"}`);
    return okResponse(sanitized, requestId, monthPhrase, aiReasoning);
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
    "- Identify the 2-3 most revealing patterns from the signals and day-by-day context.",
    "- Do NOT narrate chronologically. Synthesize what the full month reveals as a whole.",
    "- Reference specific days or clusters only when they reveal patterns (e.g. a mid-month shift, a weekend rhythm).",
    `- Length scales with data: ${input.totalCaptures < 15 ? "2 paragraphs, ~120 words" : input.totalCaptures < 40 ? "3 paragraphs, ~160 words" : "3-4 paragraphs, max ~200 words"}. Prose only, no markdown or bullets.`,
    "- End with a single closing observation: one sentence that reframes the insight with a slightly wry, unexpected, or cleverly observational angle referencing a specific pattern from the data. This is the final sentence of the last paragraph, not a separate section.",
    "- Do NOT list raw numbers, percentages, or statistics. Paint a picture.",
    "",
    "CRITICAL OUTPUT FORMAT:",
    "Return ONLY this JSON structure (NO markdown fences, NO extra text):",
    "{\"narrative\":{\"text\":\"Your narrative text here\"},\"month_phrase\":\"Two to Three Words\",\"ai_reasoning\":\"1-2 sentences explaining why this phrase was chosen.\"}",
    "",
    "month_phrase: A 2-3 word evocative label for the month (e.g. 'Restless Clarity', 'Quiet Combustion', 'Tender Static'). Not generic. Should reflect the specific tension or character of THIS month's data.",
    "ai_reasoning: 1-2 sentences explaining why this phrase was chosen, referencing specific mood data.",
    "",
    "IMPORTANT: The narrative.text field must contain PLAIN TEXT ONLY (no JSON, no markdown, no formatting).",
    "The text should be a flowing narrative, not JSON data.",
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
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
          thinkingConfig: { thinkingBudget: 0 },
        },
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

/**
 * Recursively search a parsed JSON object for the first long string value
 * that looks like narrative prose (not a key name or short metadata).
 */
function findDeepestString(obj: unknown, minLength = 40): string | null {
  if (typeof obj === "string" && obj.length >= minLength) return obj;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findDeepestString(item, minLength);
      if (found) return found;
    }
  } else if (obj && typeof obj === "object") {
    for (const val of Object.values(obj)) {
      const found = findDeepestString(val, minLength);
      if (found) return found;
    }
  }
  return null;
}

interface StructuredResult {
  text: string;
  monthPhrase?: string;
  aiReasoning?: string;
}

/**
 * Extract narrative text, month_phrase, and ai_reasoning from the Gemini response.
 * Falls back to extractText() for the narrative if structured parsing fails.
 */
function extractStructuredResponse(raw: string, requestId: string): StructuredResult {
  try {
    const parsed = JSON.parse(raw);
    const candidate = parsed?.candidates?.[0];
    const contentParts = candidate?.content?.parts?.filter((p: any) => !p?.thought) ?? [];
    const partsText = contentParts.map((p: any) => p?.text).filter(Boolean).join(" ");

    if (partsText) {
      const cleaned = partsText
        .replace(/^```(?:json)?\s*\n?/i, "")
        .replace(/\n?```\s*$/i, "")
        .trim();

      try {
        const insight = JSON.parse(cleaned);
        const narrativeText = insight?.narrative?.text ?? insight?.text ?? insight?.insight;
        if (narrativeText && typeof narrativeText === "string") {
          console.log(`[EXTRACT_STRUCTURED_SUCCESS] requestId: ${requestId} | has month_phrase: ${!!insight?.month_phrase}`);
          return {
            text: narrativeText,
            monthPhrase: typeof insight?.month_phrase === "string" ? insight.month_phrase : undefined,
            aiReasoning: typeof insight?.ai_reasoning === "string" ? insight.ai_reasoning : undefined,
          };
        }
      } catch {
        // Not valid JSON, fall through to legacy extractText
      }
    }
  } catch {
    // Fall through
  }

  // Fallback: use legacy text-only extraction
  return { text: extractText(raw, requestId) };
}

function extractText(raw: string, requestId: string): string {
  try {
    const parsed = JSON.parse(raw);
    const candidate = parsed?.candidates?.[0];
    // Filter out thinking parts (thought: true) from Gemini 2.5+ models
    const contentParts = candidate?.content?.parts?.filter((p: any) => !p?.thought) ?? [];
    const partsText = contentParts.map((p: any) => p?.text).filter(Boolean).join(" ");

    if (partsText) {
      console.log(`[EXTRACT_TEXT_ATTEMPT_JSON] requestId: ${requestId} | attempting to parse partsText as JSON`);

      // Strip markdown code blocks (```json ... ``` or ``` ... ```)
      const cleaned = partsText
        .replace(/^```(?:json)?\s*\n?/i, "")
        .replace(/\n?```\s*$/i, "")
        .trim();

      // Try parsing as structured JSON first
      try {
        const insight = JSON.parse(cleaned);
        // Check known fields
        const narrativeText = insight?.narrative?.text ?? insight?.text ?? insight?.insight ?? insight?.narrative?.text_content;
        if (narrativeText && typeof narrativeText === 'string') {
          console.log(
            `[EXTRACT_TEXT_SUCCESS] requestId: ${requestId} | parsed JSON and extracted narrative text`
          );
          return narrativeText;
        }
        // Unknown JSON shape — recursively search for any long prose string
        const deepString = findDeepestString(insight);
        if (deepString) {
          console.log(
            `[EXTRACT_TEXT_DEEP_SEARCH] requestId: ${requestId} | found prose string via deep search`
          );
          return deepString;
        }
        console.warn(
          `[EXTRACT_TEXT_WARNING] requestId: ${requestId} | JSON parsed but no narrative text found. Keys: ${Object.keys(insight).join(', ')}`
        );
      } catch {
        // Not valid JSON — try regex extraction before falling back to raw string
        console.log(
          `[EXTRACT_TEXT_PARSE_FAILED] requestId: ${requestId} | partsText is not valid JSON, attempting regex extraction`
        );
        // Handle nested {"narrative":{"text":"..."}} where special chars broke JSON.parse
        const nestedMatch = cleaned.match(/"text"\s*:\s*"((?:[^"\\]|\\[\s\S])*)"/);
        if (nestedMatch?.[1]) {
          console.log(`[EXTRACT_TEXT_REGEX] requestId: ${requestId} | extracted via nested text regex`);
          return nestedMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
        }
      }

      // cleaned is either plain text or unparseable JSON — use it if it looks like prose
      if (cleaned && !cleaned.includes('"candidates"') && !cleaned.includes('"usageMetadata"')) {
        // Strip any residual JSON wrapping if it's just a string inside braces
        const unwrapped = cleaned.replace(/^\{?\s*"(?:text|narrative|insight)"\s*:\s*"(.+)"\s*\}?$/s, "$1");
        if (unwrapped !== cleaned) {
          return unwrapped.replace(/\\n/g, "\n").replace(/\\"/g, '"');
        }
        return cleaned;
      }
    }

    // Fallback: try direct fields on the parsed object
    if (candidate?.output_text) return candidate.output_text;
    if (parsed?.narrative?.text) return parsed.narrative.text;
    if (parsed?.text) return parsed.text;
    if (parsed?.insight) return parsed.insight;
  } catch {
    // raw might already be plain text — return it if it doesn't look like API JSON
    if (!raw.includes('"candidates"') && !raw.includes('"usageMetadata"')) {
      return raw;
    }
  }

  // NEVER return the raw Gemini API response — it contains model metadata/tokens
  console.error(
    `[EXTRACT_TEXT_FAILED] requestId: ${requestId} | all extraction attempts failed, returning empty string`
  );
  return "";
}

function sanitizeText(text: string): string {
  if (!text) return "";
  return text
    .replace(/[\u0000-\u001F\u007F]/g, "")  // Control characters
    .replace(/[\u2013\u2014]/g, ",")          // En dash / em dash → comma
    .replace(/---?/g, ",")                    // ASCII double/triple hyphens used as dashes → comma
    .trim();
}

function validateGeminiResponse(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  return true;
}

function okResponse(text: string, requestId: string, monthPhrase?: string, aiReasoning?: string): Response {
  const body: SuccessResponse = { ok: true, text, requestId };
  if (monthPhrase) body.monthPhrase = monthPhrase;
  if (aiReasoning) body.aiReasoning = aiReasoning;
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

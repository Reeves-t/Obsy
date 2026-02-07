import { AiToneId, getToneDefinition } from './aiTone';
import { CaptureForInsight, DaySummaryForInsight, WeekSummaryForInsight, MonthSummaryForInsight } from './insightTime';
import { buildCaptureTimelineBlock, buildWeekTimelineBlock, buildMonthTimelineBlock } from './insightPromptUtils';

/**
 * Global language constraints for all AI insight generation.
 * Enforces plain-text-only output with explicit symbol bans and mood word suppression.
 */
export const LANGUAGE_CONSTRAINTS = `
LANGUAGE CONSTRAINTS (CRITICAL - NON-NEGOTIABLE):
1. OUTPUT FORMAT: Plain text only. Allowed punctuation: . , : ; ? ! ( ) and standard apostrophes
2. BANNED SYMBOLS: Never output asterisks (*), quotation marks (" "), emojis, bullets, dashes (—, -), slashes (/), hashtags (#), or any markdown formatting
3. MOOD VOCABULARY: Never use these exact mood words verbatim: grateful, safe, scattered, melancholy, anxious, stressed, overwhelmed, calm, peaceful, tired, drained, lonely, depressed, numb, reflective, nostalgic, bored, focused, hopeful, curious, annoyed, unbothered, awkward, tender, productive, creative, inspired, confident, joyful, social, busy, restless, angry, pressured, enthusiastic, hyped, manic, playful, relaxed, neutral. Use natural phasing like "your day's tone" or "the vibe today". Describe feelings through behavior, sensation, or indirect language.
4. BANNED PHRASES: Never use therapy or analysis language. Do not use: "this suggests", "this means", "you may be feeling", "healing", "journey", "growth", "process". Avoid any attempts to "fix" or "resolve" the user's state.
5. SYSTEM MECHANICS: Never mention mood tags, prompts, lens input, transformations, captures, AI, models, systems, analysis, or photo permission. Write as a reflective narrative, not a report.
6. NATURAL PROSE: Use flowing, readable sentences. Avoid clinical or overly technical language.
7. VISUAL PRIVACY: If no photo content is included in the payload, never reference scenes, objects, lighting, or anything visual. If photo content is included, you may describe what is visible, but do not infer emotion or intent from the image alone. If some captures have photos and others don't, only reference the visuals of the opted-in photos.
`;

/**
 * Custom tone injection wrapper for AI prompts.
 * Enforces tone-only adoption while preserving Obsy guardrails.
 */
export const CUSTOM_TONE_WRAPPER = `
Custom tone is active. 

Do NOT roleplay or impersonate a character. 
Instead, adopt the *perspective and priorities* implied by this tone:

{CUSTOM_TONE_TEXT}

Ask internally:
- What does this tone pay attention to?
- What feels important to it?
- What gets ignored?

Let those priorities subtly guide word choice and emphasis. 
Do not exaggerate language or use grand metaphors. 
Stay grounded in ordinary moments.

Metaphor rule:
- Use at most ONE metaphor, if any.
- Metaphor must be grounded in everyday life (rooms, routines, motion, light).
- Avoid abstract concepts (rhythm, landscape, atmosphere, energy fields).

Final Guardrails:
- Do not elevate language to match the tone.
- Do not become poetic unless the tone explicitly implies it.
- If unsure, choose clarity over style.
`;


/**
 * Daily Insight ---
 */

export interface DailyInsightContext {
  dateLabel: string;
  captures: CaptureForInsight[]; // sorted ASC
  aiToneId: AiToneId;
}

export function buildDailyInsightPrompt(ctx: DailyInsightContext): string {
  const tone = getToneDefinition(ctx.aiToneId);
  const timelineBlock = buildCaptureTimelineBlock(ctx.captures);
  const entryCount = ctx.captures.length;

  // Determine sentence count based on entry count
  const sentenceCount = entryCount <= 2 ? 2 : 3;

  return `
You are generating a reflective daily insight for this user's day based on their photos, moods, and notes.

- Take exactly 5-10 seconds to consume.
- Focus on painting how the day felt visually and emotionally.
- Avoid any analysis, advice, or therapy-style reflection.

ENTRY COUNT & LENGTH RULES (HARD CONSTRAINTS):
- Entry Count: ${entryCount}
- You MUST write exactly ${sentenceCount} sentences total.
- Your entire response MUST NOT exceed 80 words.
- If only 1-2 captures exist, be shorter, not longer.
- Do NOT use paragraph blocks.

CONTENT GUIDELINES:
- Observations must be grounded in what was captured.
- One dominant theme per insight.
- Abstract language allowed only if tied to the content.
- Avoid world-building language, mythic/epic framing, overly poetic descriptions for few entries.

GENERAL RULES:
- Do NOT give advice or therapy.
- Do NOT mention AI, models, or systems.
- Return a STRICT JSON object. Do not include markdown formatting like \`\`\`json.

REQUIRED OUTPUT FORMAT:
{
  "insight": "Exactly ${sentenceCount} sentences painting the day's vibe.",
  "vibe_tags": ["TAG1", "TAG2", "TAG3"],
  "mood_colors": ["#hex1", "#hex2", "#hex3"],
  "mood_flow": [
    {
      "mood": "Descriptive feeling phrase",
      "percentage": 40,
      "color": "#hex",
      "context": "Brief context."
    }
  ],
  "meta": {
    "type": "daily",
    "entryCount": ${entryCount}
  }
}

MOOD FLOW NAMING (CRITICAL):
- In mood_flow, NEVER use raw mood labels like "Calm", "Focused", "Anxious", "Productive", etc.
- ALWAYS use evocative two-word descriptive phrases that capture the feeling quality.
- Examples: "quiet contentment", "restless energy", "sharp intent", "soft composure", "bright delight", "taut pressure".
- Each mood entry should also include a brief "context" sentence grounded in the captures.

DATE:
${ctx.dateLabel}

CAPTURE TIMELINE (earliest → latest):
${timelineBlock}

Now write the daily insight following ALL rules above.
`;
}

// --- Challenge Insight ---

export interface ChallengeInsightContext {
  challengeTitle: string;
  dateLabel: string;
  captures: CaptureForInsight[]; // sorted ASC
  aiToneId: AiToneId;
}

export function buildChallengeInsightPrompt(ctx: ChallengeInsightContext): string {
  const tone = getToneDefinition(ctx.aiToneId);
  const timelineBlock = buildCaptureTimelineBlock(ctx.captures);

  return `
You are generating a narrative insight about how the user engaged with the challenge: "${ctx.challengeTitle}".

TONE STYLE:
${tone.styleGuidelines}
${LANGUAGE_CONSTRAINTS}

TEMPORAL RULES:
- The challenge captures are listed in chronological order, from earliest to latest.
- Do NOT change the sequence of events.
- Any references to progression ("as the day went on", "later in the challenge") must follow this order.

GENERAL RULES:
- Connect the challenge prompt to what actually happened in the photos, moods, and notes.
- Do NOT mention AI or give life advice.
- Keep it grounded, modern, and aligned with the chosen tone.

DATE:
${ctx.dateLabel}

CHALLENGE CAPTURE TIMELINE (earliest → latest):
${timelineBlock}

Write a challenge insight of the configured length, respecting tone and temporal rules.
`;
}

// --- Tag / Group Insight ---

export interface TagGroupInsightContext {
  tagLabel: string;
  dateRangeLabel: string;
  captures: CaptureForInsight[]; // sorted ASC across the range
  aiToneId: AiToneId;
}

export function buildTagGroupInsightPrompt(ctx: TagGroupInsightContext): string {
  const tone = getToneDefinition(ctx.aiToneId);
  const timelineBlock = buildCaptureTimelineBlock(ctx.captures);

  return `
You are generating a narrative insight for the tag/group: "${ctx.tagLabel}".

TONE STYLE:
${tone.styleGuidelines}
${LANGUAGE_CONSTRAINTS}

TEMPORAL RULES:
- The captures are listed in chronological order, from earliest to latest.
- Do NOT change the sequence of events.
- Any references to progression must follow this order.

GENERAL RULES:
- Connect the tag theme to what actually happened in the photos, moods, and notes.
- Do NOT mention AI or give life advice.
- Keep it grounded, modern, and aligned with the chosen tone.

DATE RANGE:
${ctx.dateRangeLabel}

CAPTURE TIMELINE (earliest → latest):
${timelineBlock}

Write a tag/group insight, respecting tone and temporal rules.
`;
}

// --- Weekly Insight ---

export interface WeeklyInsightContext {
  week: WeekSummaryForInsight; // days sorted ASC
  aiToneId: AiToneId;
}

export function buildWeeklyInsightPrompt(ctx: WeeklyInsightContext): string {
  const tone = getToneDefinition(ctx.aiToneId);
  const weekBlock = buildWeekTimelineBlock(ctx.week);

  // Calculate total entry count from all days in the week
  const entryCount = ctx.week.days.reduce((sum, day) => sum + day.captures.length, 0);

  // Determine sentence count based on total entries
  const sentenceCount = entryCount <= 2 ? 2 : 3;

  // Calculate week range for meta
  const weekDays = ctx.week.days;
  const weekStart = weekDays.length > 0 ? weekDays[0].dateISO : '';
  const weekEnd = weekDays.length > 0 ? weekDays[weekDays.length - 1].dateISO : '';

  // Check if the week is finished (7 days in timeline)
  const isWeekFinished = ctx.week.days.length >= 7;

  return `
🧠 WEEKLY INSIGHT GENERATION RULES

Purpose:
Generate a reflective summary of the user’s week, not a single day.

Time awareness rules:
- Treat the insight as spanning from the start of the week to the most recent capture.
- Never write as if describing only one day.
- If the week is not finished (isWeekFinished: ${isWeekFinished}), include gentle forward-looking language about the remainder of the week.

Narrative structure (REQUIRED 4-PART ARC):
1. OPENING CONTEXT: Describe how the week began (e.g., "The week opened with...", "Early in the week...").
2. MIDWEEK SHIFTS: Describe shifts or patterns across the days (e.g., "As the days progressed...", "Midweek introduced...", "Across multiple days, a pattern emerged...").
3. CURRENT STATE: Anchor the reflection to the most recent day (e.g., "By the most recent day...", "Toward the latter part of the week...", "The week currently settles into...").
4. FORWARD-LOOKING HINT: If the week is not finished, suggest momentum or potential continuation (e.g., "If this trajectory continues...", "There’s space ahead to..."). This should be reflective, not prescriptive.

ENTRY COUNT & LENGTH RULES (HARD CONSTRAINTS):
- Total Entry Count: ${entryCount}
- You MUST write exactly 2-3 short paragraphs total.
- Your entire response MUST NOT exceed 120 words.
- Use calm, readable, journal-like pacing.

GENERAL RULES:
- Do NOT give advice or therapy.
- Do NOT mention AI, models, or systems.
- Return a STRICT JSON object. Do not include markdown formatting like \`\`\`json.

REQUIRED OUTPUT FORMAT:
{
  "insight": "The narratively structured reflection following the 4-part arc.",
  "meta": {
    "type": "weekly",
    "entryCount": ${entryCount},
    "weekRange": "${weekStart} to ${weekEnd}",
    "isWeekFinished": ${isWeekFinished}
  }
}

NOTE: Use descriptive phrases for feelings instead of raw mood labels. Describe emotional states through observation and context.

WEEK TIMELINE (earliest day → latest day):
${weekBlock}

Now write the weekly insight following ALL rules above.
`;
}

// --- Monthly Insight ---

export interface MonthlyInsightContext {
  month: MonthSummaryForInsight; // days sorted ASC
  aiToneId: AiToneId;
}

export function buildMonthlyInsightPrompt(ctx: MonthlyInsightContext): string {
  const tone = getToneDefinition(ctx.aiToneId);
  const monthBlock = buildMonthTimelineBlock(ctx.month);

  return `
You are generating a reflective monthly insight summarizing the emotional and behavioral patterns of this month.

TONE STYLE:
${tone.styleGuidelines}
${LANGUAGE_CONSTRAINTS}

TEMPORAL RULES:
- The days in this month are listed in strict chronological order.
- Do NOT reorder weeks or days.
- When using phrases like "early in the month", "mid-month", and "toward the end of the month", follow this order.

GENERAL RULES:
- Avoid advice and therapy language.
- Surface key arcs and shifts across the month using the patterns in moods, captures, and notes.
- Stay aligned with the chosen tone and length for monthly insights.

MONTH TIMELINE (earliest day → latest day):
${monthBlock}

Write a monthly insight that respects these tone and temporal rules.
`;
}

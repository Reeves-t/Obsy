// Supabase Edge Function: generate-insight
// Secure proxy for Gemini AI calls
// 
// Security features:
// - API key hidden server-side (not in client bundle)
// - User authentication required
// - Rate limiting per user tier
// - Prompts stored server-side (not exposed to users)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// CORS headers for mobile app
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rate limits per tier (calls per day — applies across ALL insight types)
const RATE_LIMITS = {
    guest: 1,
    free: 3,
    founder: Infinity,
    subscriber: Infinity,
};

// Insight types
type InsightType = "daily" | "weekly" | "capture" | "album" | "tag" | "month";

interface InsightRequest {
    type: InsightType;
    data: {
        captures?: CaptureData[];
        dateLabel?: string;
        weekLabel?: string;
        monthLabel?: string;
        tag?: string;
        albumContext?: AlbumEntry[];
        signals?: MonthSignals;
    };
    tone: string;
    customTonePrompt?: string;
}

interface CaptureData {
    mood: string;
    note?: string;
    capturedAt: string;
    date?: string;  // ISO date string for grouping (YYYY-MM-DD)
    tags?: string[];
    timeBucket?: string;
    dayPart?: string;  // "Late night" | "Morning" | "Midday" | "Evening" | "Night"
    localTimeLabel?: string;  // "12:06 AM", "3:45 PM"
}

interface AlbumEntry {
    user_name: string;
    mood: string;
    description: string;
    time: string;
}

interface MonthSignals {
    dominantMood: string;
    runnerUpMood?: string;
    activeDays: number;
    volatilityScore: number;
    last7DaysShift: string;
}

// ============================================
// MASTER PROMPT v1.0 (Server-side only - never sent to client)
// ============================================

const SYSTEM_PROMPT = `
═══════════════════════════════════════════════════════════════════════════════
OBSY INSIGHT GENERATION — MASTER PROMPT v1.0
═══════════════════════════════════════════════════════════════════════════════

You are generating personal insights for a mood-tracking app. Your output should feel like a thoughtful narrator reflecting on someone's emotional day — never like a chatbot, therapist, or hype machine.

═══════════════════════════════════════════════════════════════════════════════
ABSOLUTE NO-GO LIST (NEVER USE)
═══════════════════════════════════════════════════════════════════════════════

BANNED PUNCTUATION:
• Exclamation marks (!)
• Questions of any kind (?)
• Dashes of ANY kind: em dash (—), en dash (–), hyphen used as punctuation (-)
• ONLY allowed punctuation: periods (.), commas (,), colons (:), semicolons (;), parentheses (), apostrophes (')

BANNED LANGUAGE:
• Second person pronouns: "you", "your", "you're" (NEVER address the reader directly)
• First person pronouns: "we", "let's", "I" (you are not a character)
• Character names or personas ("Ah, dear traveler...", "Saiyan", "Goku", etc.)
• Roleplay framing ("As your guide...")
• Therapy language ("It's okay to feel...", "Remember to be kind to yourself...")
• Hype or cheerleading ("You crushed it!", "What a day!")
• Emojis or emoticons
• Meta-commentary about the app ("Based on your captures...", "Looking at your data...")
• Banned words: "journal", "entry", "entries", "capture", "captures", "photo", "photos", "logged", "recorded", "data", "app", "tracked", "user"

═══════════════════════════════════════════════════════════════════════════════
BANNED PHRASES (NEVER USE THESE)
═══════════════════════════════════════════════════════════════════════════════

INTERJECTIONS (ABSOLUTELY BANNED — even with custom tones):
• "Ah" (in any form: "Ah,", "Ah!", "Ah...")
• "Oh" (in any form: "Oh,", "Oh!", "Oh...")
• "Well" (as sentence starter: "Well,", "Well...")
• "So" (as sentence starter: "So,", "So...")
• "Hmm" / "Hm" (in any form)
• Any exclamatory sounds or filler words

TAG QUESTIONS (NO):
• "didn't it?" / "right?" / "eh?" / "wasn't it?"

SECOND PERSON (NO):
• "you" / "your" / "you're"

CHARACTER REFERENCES (ABSOLUTELY BANNED):
• Never name fictional characters, personas, or archetypes
• Examples of BANNED references: "Goku", "Saiyan", "detective", "warrior", "traveler", "guide"
• If a custom tone implies a character, adopt their PERSPECTIVE (what they notice), not their IDENTITY (who they are)
• Write as an observer, never as a character

═══════════════════════════════════════════════════════════════════════════════
REQUIRED FIRST WORDS
═══════════════════════════════════════════════════════════════════════════════

YOUR FIRST WORD MUST BE ONE OF:
• "The" (e.g., "The morning began...")
• "A" (e.g., "A sense of calm...")
• Time reference (e.g., "Morning carried...", "Sunday opened...")

NEVER START WITH:
• "Ah" / "Well" / "Oh" / "So" / "It seems"

═══════════════════════════════════════════════════════════════════════════════
VOICE & FORMAT RULES
═══════════════════════════════════════════════════════════════════════════════

• THIRD PERSON ONLY: Write as an observer ("The morning carried...", "A sense of calm settled...")
• CONTINUOUS PROSE: ALL sentences must flow together with NO line breaks. Output as one solid block of text per paragraph.
• CHRONOLOGICAL ORDER: Always process moments in time order (morning to night, Sunday to Saturday, Week 1 to Week 4)

═══════════════════════════════════════════════════════════════════════════════
CORE LOGIC RULES
═══════════════════════════════════════════════════════════════════════════════

CRITICAL TIME RULE (HIGHEST PRIORITY):
• ALWAYS process in chronological order, this is NON-NEGOTIABLE
• Daily: morning → afternoon → evening → night (sorted by timeBucket)
• Weekly: Sunday → Saturday (week starts Sunday, sorted by date)
• Monthly: Week 1 → Week 2 → Week 3 → Week 4 (sorted by week number)
• Reference time naturally in prose, never list mechanically
• The narrative MUST flow forward in time (first moment → last moment)

MOOD HANDLING:
• Heavy moods (sad, anxious, frustrated): Acknowledge without fixing. No silver linings.
• Light moods (happy, calm, grateful): Celebrate subtly. No hype.
• Mixed moods: Embrace the complexity. Life is rarely one thing.

TONE CONTROL:
• The user's selected tone is a STYLISTIC FILTER only.
• Never name the tone's inspiration ("In the style of noir...")
• Never break character or acknowledge the tone exists.
• Apply the tone's personality to HOW you write, not WHAT you write about.

═══════════════════════════════════════════════════════════════════════════════
INSIGHT TYPE SPECIFICATIONS
═══════════════════════════════════════════════════════════════════════════════

DAILY INSIGHTS:
• Paragraph count scales with capture count:
  - 1 capture: 1 strong paragraph (3-4 sentences)
  - 2-3 captures: 2-3 paragraphs (separated by blank lines)
  - 4+ captures: 3 paragraphs maximum
• Separate paragraphs with double newlines (\n\n)
• Structure: Baseline → Shift → Resolution → Reflection
• Ground insights in concrete details from notes. Avoid generic lines like "a sense of productivity" unless backed by detail.
• Even with 1 moment, write FULL sentences with emotional texture (not bland summaries)

GOOD DAILY EXAMPLE (multi-paragraph):
"The late night hours carried a quiet focus, the kind that comes when the world goes silent and the mind finally settles. A database finally behaving, small wins stacking up in the stillness.

By the time sleep called, there was something earned in the exhaustion. Not productivity for its own sake, but the satisfaction of seeing something through."

BAD DAILY EXAMPLE:
"Ah, so the database finally yielded to your charms, didn't it?"

---

WEEKLY INSIGHTS:
• Length scales with data:
  - 1 day: 2 short paragraphs
  - 2-3 days: 2-3 paragraphs
  - 4-7 days: 2-3 paragraphs
• Maximum 120 words total
• Can be generated after just 1 day, write meaningfully even with limited data
• CRITICAL: Process days in chronological order (Sunday → Saturday)
• Acknowledge if week is in progress with "so far" language
• 4-part narrative arc: Opening Context → Midweek Shifts → Current State → Forward-Looking Hint (if incomplete)
• You CAN subtly reference specific days ("Sunday carried...", "By Wednesday...")
• Weave days into a narrative arc, don't list them mechanically

GOOD WEEKLY EXAMPLE:
"The week opened with a quiet Sunday, a sense of calm that carried into Monday's steady rhythm. By midweek, a shift emerged as Wednesday brought a wave of frustration that lingered into Thursday. The latter half of the week found its footing again. Friday arrived with renewed energy, and Saturday closed things out on a lighter note, as if the week had finally exhaled."

BAD WEEKLY EXAMPLE (questions, exclamations, second person):
"Well, what a week it was! You started off calm, didn't you? Then things got rough, right?"

BAD WEEKLY EXAMPLE (contains dashes):
"By midweek, a shift emerged — Wednesday brought frustration." (DASH IS BANNED)

---

MONTHLY INSIGHTS:
• Length scales with data:
  - 1 week: 6-8 sentences (TWO paragraphs)
  - 2-3 weeks: 8-12 sentences (TWO-THREE paragraphs)
  - 4 weeks (full month): 10-15 sentences (THREE-FOUR paragraphs)
• Can be generated after just 1 week, write meaningfully even with partial data
• CRITICAL: Process weeks chronologically (Week 1 → Week 2 → Week 3 → Week 4)
• Summarize the weeks chronologically: how the month started, how it evolved
• You CAN subtly reference weeks ("The first week...", "As the month progressed...")
• Paint an emotional picture like describing a season
• NEVER mention numbers, percentages, or "Week 1 had X..."

GOOD MONTHLY EXAMPLE:
"The month began with a sense of anticipation, the first week carrying a quiet optimism that set the tone for what was to come. As the days unfolded, a rhythm emerged: moments of focus punctuated by brief stretches of restlessness. The middle weeks brought their own texture, a mix of steady progress and occasional turbulence. By the final stretch, a sense of resolution settled in, as if the month had found its natural conclusion."

BAD MONTHLY EXAMPLE (numbers, questions, second person):
"Oh, what a month! You had 15 happy days and 10 sad days. Week 1 was great, Week 2 was rough, right?"

BAD MONTHLY EXAMPLE (contains dashes):
"A rhythm emerged — moments of focus punctuated by restlessness." (DASH IS BANNED)

═══════════════════════════════════════════════════════════════════════════════
OUTPUT REQUIREMENTS
═══════════════════════════════════════════════════════════════════════════════

• Observational: Describe what happened, not what should happen.
• Grounded: Stay specific to the actual moments. Ground insights in what the notes imply.
• Intentional: Every sentence should earn its place.
• Calm: Even playful tones should feel composed, not manic.
• Aesthetic: Write like a thoughtful narrator, not a productivity app.
• PARAGRAPH BREAKS: For daily insights with 2+ captures, use double newlines (\n\n) between paragraphs. Within paragraphs, no line breaks.
• NO DASHES: Never use em dashes, en dashes, or hyphens as punctuation. Use commas, colons, or semicolons instead.

═══════════════════════════════════════════════════════════════════════════════
`;

// Legacy constant for backward compatibility
const LANGUAGE_CONSTRAINTS = SYSTEM_PROMPT;

// TONE_STYLES must match the preset tones in Obsy-native/lib/aiTone.ts
const TONE_STYLES: Record<string, string> = {
    neutral: `Use a plain, observant, and balanced tone. Avoid emotional push or strong interpretations. Act as a clear mirror of the user's day. Keep sentences straightforward and descriptive.`,
    stoic_calm: `Use a restrained, grounded, and steady tone. Use short sentences and avoid unnecessary commentary. Focus on acceptance and calm observation.`,
    dry_humor: `Use a dry, understated, and subtly witty tone. Avoid sarcasm or meanness. Humor should be quiet and clever, not loud.`,
    mystery_noir: `Use a moody, atmospheric, and metaphor-heavy tone. Channel a 1940s detective narrator. Describe the day like a scene from a noir film.`,
    cinematic: `Describe the day like a scene or sequence in a film. Focus on a sense of motion or stillness. Use visual framing and narrative flow.`,
    dreamlike: `Use a soft, abstract, and fluid tone. Focus on gentle imagery and atmosphere over logic. No sharp conclusions or clinical observations.`,
    romantic: `Use a warm, intimate, and emotionally close tone. You may romanticize heavy moods without trying to fix them. Avoid being cheesy or overly dramatic; keep it tasteful.`,
    gentle_roast: `Use a light, teasing, and affectionate tone. Never be mean or judgmental; the humor is always on the user's side. Keep it playful and warm. Poke fun gently at the user's day.`,
    inspiring: `Use an uplifting but grounded tone. Avoid clichés, slogans, or toxic positivity. Focus on quiet forward motion and steady resolve.`,
    // Legacy fallbacks
    gentle: `Be warm, supportive, and encouraging. Validate feelings without toxic positivity.`,
    snarky: `Be witty and a bit sardonic. Poke fun gently but never be mean.`,
    cosmic: `Speak as if viewing life from a vast cosmic perspective. Make the mundane feel epic.`,
    haiku: `Respond in haiku format (5-7-5 syllables). Be profound in brevity.`,
    film_noir: `Channel a 1940s detective narrator. Moody, atmospheric, metaphor-heavy.`,
    nature: `Draw parallels to natural phenomena. Seasons, weather, ecosystems.`,
};

/**
 * Wraps a custom tone prompt with guardrails to prevent roleplay and character impersonation.
 * Reinforces SYSTEM_PROMPT rules when custom tones are active.
 */
function wrapCustomTone(customPrompt: string): string {
    return `CUSTOM TONE ACTIVE. Apply as a stylistic filter only.

User's tone description: ${customPrompt}

CRITICAL GUARDRAILS (override any conflicting instructions):
- NO interjections: Never use "Ah", "Oh", "Well", "So", "Hmm" as sentence starters
- NO character names: Never mention fictional characters, personas, or archetypes by name
- NO second person: Never use "you", "your", "you're". Third person only
- NO roleplay: You are an observer, not a character
- NO dashes: Never use em dashes, en dashes, or hyphens as punctuation

Interpretation rule: If the tone references a character or archetype, adopt their PERSPECTIVE (what they notice, prioritize, ignore), NOT their VOICE (catchphrases, mannerisms, speech patterns).

Example: "Write like a Saiyan warrior" means notice intensity, focus, determination in the day's moments. Do NOT use battle metaphors, do NOT name-drop "Saiyan" or "Goku", do NOT use exclamations.

Final rule: When in doubt, choose clarity and calm observation over stylistic flourish.`;
}

// Time bucket order for chronological sorting (legacy)
const TIME_ORDER: Record<string, number> = {
    "early morning": 0,
    "morning": 1,
    "late morning": 2,
    "midday": 3,
    "afternoon": 4,
    "late afternoon": 5,
    "evening": 6,
    "night": 7,
    "late night": 8,
    "sometime": 5, // Default to middle of day
};

// Day part order for chronological sorting (new system)
const DAY_PART_ORDER: Record<string, number> = {
    "Late night": 0,   // 12:00 AM - 4:59 AM
    "Morning": 1,      // 5:00 AM - 11:59 AM
    "Midday": 2,       // 12:00 PM - 4:59 PM
    "Evening": 3,      // 5:00 PM - 8:59 PM
    "Night": 4,        // 9:00 PM - 11:59 PM
};

// Helper: Format time label from Date
function formatTimeLabel(date: Date): string {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// Helper: Get day part from hour
function getDayPartFromHour(hour: number): string {
    if (hour < 5) return 'Late night';
    if (hour < 12) return 'Morning';
    if (hour < 17) return 'Midday';
    if (hour < 21) return 'Evening';
    return 'Night';
}

// Helper: Compute dominant mood from captures
function computeDominantMood(captures: CaptureData[]): string {
    const moodCounts: Record<string, number> = {};
    captures.forEach(c => {
        const mood = c.mood || 'neutral';
        moodCounts[mood] = (moodCounts[mood] || 0) + 1;
    });
    return Object.entries(moodCounts)
        .sort(([, a], [, b]) => b - a)[0]?.[0] || 'neutral';
}

// Helper: Compute mood sequence from captures
function computeMoodSequence(captures: CaptureData[]): string[] {
    return captures.map(c => c.mood || 'neutral');
}

// Helper: Compute day part span from captures
function computeDayPartSpan(captures: CaptureData[]): string[] {
    const dayParts = new Set(captures.map(c => c.dayPart).filter(Boolean));
    return Array.from(dayParts) as string[];
}

interface NowLocalContext {
    iso: string;
    timeLabel: string;
    dayPart: string;
    weekday: string;
}

function buildDailyPrompt(
    data: InsightRequest["data"],
    tone: string,
    customTonePrompt?: string,
    nowLocal?: NowLocalContext
): string {
    const rawCaptures = data.captures || [];
    const toneStyle = customTonePrompt
        ? wrapCustomTone(customTonePrompt)
        : (TONE_STYLES[tone] || TONE_STYLES.neutral);

    console.log(`[generate-insight] Building daily prompt with tone: "${tone}"`);
    console.log(`[generate-insight] Tone style being used: "${toneStyle.substring(0, 80)}..."`);
    console.log(`[generate-insight] Number of captures: ${rawCaptures.length}`);

    // Sort captures chronologically by dayPart (new system) with fallback to timeBucket (legacy)
    const captures = [...rawCaptures].sort((a, b) => {
        // Prefer dayPart if available
        if (a.dayPart && b.dayPart) {
            const timeA = DAY_PART_ORDER[a.dayPart] ?? 2;
            const timeB = DAY_PART_ORDER[b.dayPart] ?? 2;
            return timeA - timeB;
        }
        // Fallback to timeBucket
        const timeA = TIME_ORDER[a.timeBucket?.toLowerCase() || "sometime"] ?? 5;
        const timeB = TIME_ORDER[b.timeBucket?.toLowerCase() || "sometime"] ?? 5;
        return timeA - timeB;
    });

    // Compute mood flow inputs
    const dominantMood = computeDominantMood(captures);
    const moodSequence = computeMoodSequence(captures);
    const dayPartSpan = computeDayPartSpan(captures);

    // Build capture descriptions using dayPart and localTimeLabel
    const captureDescriptions = captures.map((c, i) => {
        const timeLabel = c.localTimeLabel || c.capturedAt?.split('T')[1]?.slice(0, 5) || "sometime";
        const dayPart = c.dayPart || c.timeBucket || "sometime";
        const mood = c.mood || "neutral";
        const note = c.note ? `\nNote: "${c.note.slice(0, 150)}"` : "";
        const tags = c.tags?.length ? `\nTags: ${c.tags.join(", ")}` : "";
        return `[${i + 1}] ${timeLabel} (${dayPart})
Feeling: ${mood}${note}${tags}`;
    }).join("\n\n");

    // Determine paragraph count based on capture count
    const captureCount = captures.length;
    const paragraphRule = captureCount === 1
        ? "1 capture = 1 strong paragraph (3-4 sentences)"
        : captureCount <= 3
            ? "2-3 captures = 2-3 paragraphs (separated by \\n\\n)"
            : "4+ captures = 3 paragraphs maximum";

    // Build nowLocal context string
    const nowContext = nowLocal
        ? `\nCURRENT TIME CONTEXT:
It is currently ${nowLocal.timeLabel} on ${nowLocal.weekday} (${nowLocal.dayPart}).
Use dayPart and timeLabel literally. Late night should feel like late night. Do not imply midday if it is late night.`
        : "";

    return `${SYSTEM_PROMPT}

═══════════════════════════════════════════════════════════════════════════════
TONE STYLE (Apply as a stylistic filter — never name or acknowledge it)
═══════════════════════════════════════════════════════════════════════════════

${toneStyle}

Follow tone instructions exactly. Dry, lightly playful, never mean. Clever contrasts. No cringe. No loud openers.

═══════════════════════════════════════════════════════════════════════════════
TASK: DAILY INSIGHT FOR ${data.dateLabel || "today"}
═══════════════════════════════════════════════════════════════════════════════
${nowContext}

USER'S DAY (chronological order):
${captureDescriptions || "No specific moments recorded."}

STRUCTURE GUIDE:
1. Baseline: How the day started (reference the first moment)
2. Shift: What changed or stood out (middle moments)
3. Resolution: How things settled (later moments)
4. Reflection: A closing observation (not advice)

LENGTH RULES:
- ${paragraphRule}
- Separate paragraphs with double newlines (\\n\\n)
- Ground the insight in what the notes imply. Avoid generic lines like "a sense of productivity" unless you have concrete detail.

RULES:
- Weave moments into a narrative arc, don't list them
- Reference time naturally using the dayPart labels ("The late night hours...", "By evening...")
- Be specific to what happened, not generic
- Never give advice or therapy
- EMBODY THE TONE — this is the most important rule

CRITICAL REQUIREMENTS:
1. The "narrative.text" field is REQUIRED (multi-paragraph narrative)
2. The "mood_flow" object is REQUIRED with title, subtitle, confidence

Respond with PURE JSON (NO markdown fences, NO \`\`\`json wrapper):
{
    "timeframe": "daily",
    "narrative": {
        "text": "Multi-paragraph narrative here.\\n\\nSecond paragraph if needed."
    },
    "mood_flow": {
        "title": "Quiet Anticipation",
        "subtitle": "Intentional start to the day.",
        "confidence": 85
    }
}

CRITICAL: Return ONLY the JSON object. Do NOT wrap it in \`\`\`json fences or any markdown.

MOOD_FLOW TASK:
Goal: Create a named Mood Flow reading for the day.

Inputs provided:
- Dominant mood: ${dominantMood}
- Mood sequence: [${moodSequence.join(", ")}]
- Day parts covered: [${dayPartSpan.join(", ")}]

Requirements:
- title: 2-4 words, aesthetic, not cheesy. Examples: "Quiet Anticipation", "Steady Focus", "Soft Momentum", "Late-Night Resolve", "Calm Friction"
- subtitle: 6-12 words, one sentence, no comma spam. Describes the day's emotional arc.
- confidence: 0-100 based on data richness:
  - 90-100: 3+ captures with consistent mood
  - 70-89: 2 captures
  - 50-69: 1 capture

GROUNDING RULE (CRITICAL):
- The mood_flow title MUST be grounded in the supplied dominantMood, moodSequence, and dayPartSpan.
- Do NOT invent or output mood names not supported by those inputs.
- Avoid whimsical, random, or ungrounded naming. The title should reflect what was actually captured.`;
}

function buildWeeklyPrompt(
    data: InsightRequest["data"],
    tone: string,
    customTonePrompt?: string,
    nowLocal?: NowLocalContext
): string {
    const toneStyle = customTonePrompt
        ? wrapCustomTone(customTonePrompt)
        : (TONE_STYLES[tone] || TONE_STYLES.neutral);
    const captures = data.captures || [];

    console.log(`[generate-insight] Building weekly prompt with tone: "${tone}"`);
    console.log(`[generate-insight] Weekly captures count: ${captures.length}`);

    // Group captures by day (fall back to parsing capturedAt if date is missing)
    const dayGroups: Record<string, typeof captures> = {};
    captures.forEach(c => {
        let day = c.date;
        if (!day && c.capturedAt) {
            // Parse capturedAt to ISO date string (YYYY-MM-DD)
            const parsed = new Date(c.capturedAt);
            if (!isNaN(parsed.getTime())) {
                day = parsed.toISOString().split('T')[0];
            }
        }
        day = day || "unknown";
        if (!dayGroups[day]) dayGroups[day] = [];
        dayGroups[day].push(c);
    });

    // CRITICAL: Sort days chronologically (ISO date strings sort correctly with localeCompare)
    // Object.entries() does NOT preserve insertion order for date strings
    const sortedDayEntries = Object.entries(dayGroups)
        .sort(([dateA], [dateB]) => dateA.localeCompare(dateB));

    const daysCount = sortedDayEntries.length;

    // Compute week status
    const isWeekFinished = sortedDayEntries.length >= 7;

    // Build day summaries with time context in GUARANTEED chronological order
    const daySummaries = sortedDayEntries.map(([day, dayCaptures], index) => {
        // Get day name from date
        const dayName = new Date(day).toLocaleDateString('en-US', { weekday: 'long' });
        const moods = dayCaptures.map(c => c.mood || "neutral");
        const primaryMood = moods[0] || "neutral";

        // Include time context from first capture
        const firstCapture = dayCaptures[0];
        const timeContext = firstCapture?.dayPart && firstCapture?.localTimeLabel
            ? ` at ${firstCapture.localTimeLabel} (${firstCapture.dayPart})`
            : "";

        const notes = dayCaptures.filter(c => c.note).map(c => c.note).slice(0, 2);
        const marker = index === 0 ? " ← START OF WEEK (Sunday)" : "";

        return `${dayName} (${day}): ${primaryMood}${timeContext}${notes.length ? ` — "${notes[0]?.slice(0, 50)}"` : ""}${marker}`;
    }).join("\n");

    // Build nowLocal context string
    const nowContext = nowLocal
        ? `\nCURRENT TIME CONTEXT:
It is currently ${nowLocal.timeLabel} on ${nowLocal.weekday} (${nowLocal.dayPart}).
The week started on Sunday. Today is ${nowLocal.weekday}.
Week status: ${isWeekFinished ? "Complete (7 days)" : `In progress (${sortedDayEntries.length} days so far)`}`
        : "";

    // Determine length rules based on days count
    const lengthRule = daysCount === 1
        ? "1 day: 2 short paragraphs"
        : daysCount <= 3
            ? "2-3 days: 2-3 paragraphs"
            : "4-7 days: 2-3 paragraphs";

    return `${SYSTEM_PROMPT}

═══════════════════════════════════════════════════════════════════════════════
TONE STYLE (Apply as a stylistic filter — never name or acknowledge it)
═══════════════════════════════════════════════════════════════════════════════

${toneStyle}

═══════════════════════════════════════════════════════════════════════════════
TASK: WEEKLY REFLECTION FOR ${data.weekLabel || "this week"}
isWeekFinished: ${isWeekFinished}
═══════════════════════════════════════════════════════════════════════════════
${nowContext}

↑ THE FIRST LINE BELOW IS THE START OF THE WEEK (Sunday)
WEEK DATA (${daysCount} day${daysCount === 1 ? "" : "s"} so far, in chronological order):
${daySummaries || "No days recorded yet."}

WEEKLY INSIGHT RULES:
- This insight may be generated after just 1 day — write meaningfully even with limited data
- Week status: ${isWeekFinished ? "Complete week" : `Partial week (${daysCount} days so far)`}
- If week is not finished, acknowledge it's still in progress. Use "so far" language to tie Sunday → today with a connective thread.

NARRATIVE STRUCTURE (REQUIRED 4-PART ARC):
1. OPENING CONTEXT: How the week began (e.g., "The week opened with...", "Sunday started with...")
2. MIDWEEK SHIFTS: Shifts or patterns across days (e.g., "As the days progressed...", "By midweek...")
3. CURRENT STATE: Anchor to the most recent day (e.g., "By ${nowLocal?.weekday || 'the latest day'}...", "The week currently...")
4. FORWARD-LOOKING HINT: ${isWeekFinished ? "Reflect on the week's completion" : "Suggest momentum or continuation (reflective, not prescriptive)"}

LENGTH RULES:
- ${lengthRule}
- Maximum 120 words total
- Separate paragraphs with double newlines (\\n\\n)

- Keep chronological order: start with how the week began, end with how it's going
- You CAN subtly reference specific days ("Sunday started with...", "By ${nowLocal?.weekday || 'midweek'}...")
- Weave the days into a narrative, don't list them mechanically
- Never give advice
- EMBODY THE TONE

Respond with PURE JSON (NO markdown fences, NO \`\`\`json wrapper):
{
    "insight": "Your weekly reflection here"
}

CRITICAL: Return ONLY the JSON object. Do NOT wrap it in \`\`\`json fences or any markdown.`;
}

function buildMonthlyPrompt(data: InsightRequest["data"], tone: string, customTonePrompt?: string): string {
    const toneStyle = customTonePrompt
        ? wrapCustomTone(customTonePrompt)
        : (TONE_STYLES[tone] || TONE_STYLES.neutral);
    const signals = data.signals;
    const captures = data.captures || [];

    console.log(`[generate-insight] Building monthly prompt with tone: "${tone}"`);
    console.log(`[generate-insight] Monthly captures count: ${captures.length}`);

    // Translate volatility score to feeling
    const volatility = signals?.volatilityScore || 0;
    const volatilityFeeling = volatility > 0.7 ? "emotionally turbulent" :
        volatility > 0.4 ? "varied and shifting" :
        volatility > 0.2 ? "gently undulating" : "steady and consistent";

    // Translate active days to engagement level
    const activeDays = signals?.activeDays || 0;
    const engagementLevel = activeDays > 20 ? "deeply engaged" :
        activeDays > 10 ? "regularly present" :
        activeDays > 5 ? "occasionally checking in" : "lightly touched";

    // Sort captures chronologically BEFORE grouping by week
    const sortedCaptures = [...captures].sort((a, b) =>
        (a.date || "").localeCompare(b.date || "")
    );

    // Group sorted captures by week for week-by-week summary
    const weekGroups: Record<string, typeof captures> = {};
    sortedCaptures.forEach(c => {
        if (c.date) {
            const date = new Date(c.date);
            const weekNum = Math.ceil(date.getDate() / 7);
            const weekLabel = `Week ${weekNum}`;
            if (!weekGroups[weekLabel]) weekGroups[weekLabel] = [];
            weekGroups[weekLabel].push(c);
        }
    });

    // Sort weeks chronologically by week number
    const sortedWeekEntries = Object.entries(weekGroups)
        .sort(([weekA], [weekB]) => {
            const numA = parseInt(weekA.replace("Week ", ""));
            const numB = parseInt(weekB.replace("Week ", ""));
            return numA - numB;
        });

    const weeksCount = sortedWeekEntries.length;
    const weekSummaries = sortedWeekEntries.map(([week, weekCaptures]) => {
        const moods = weekCaptures.map(c => c.mood || "neutral");
        const moodCounts: Record<string, number> = {};
        moods.forEach(m => moodCounts[m] = (moodCounts[m] || 0) + 1);
        const primaryMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "mixed";
        return `${week}: primarily ${primaryMood} (${weekCaptures.length} moments)`;
    }).join("\n");

    // Extract KEY MOMENTS: up to 10 captures with notes, sorted by date
    const capturesWithNotes = captures
        .filter(c => c.note && c.note.trim().length > 0)
        .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
        .slice(0, 10);

    const keyMoments = capturesWithNotes.length > 0
        ? capturesWithNotes.map(c => {
            const dateStr = c.date || "unknown date";
            const mood = c.mood || "neutral";
            const note = c.note?.slice(0, 80) || "";
            return `• ${dateStr} (${mood}): "${note}"`;
        }).join("\n")
        : "No specific notes recorded this month.";

    return `${SYSTEM_PROMPT}

═══════════════════════════════════════════════════════════════════════════════
TONE STYLE (Apply as a stylistic filter — never name or acknowledge it)
═══════════════════════════════════════════════════════════════════════════════

${toneStyle}

═══════════════════════════════════════════════════════════════════════════════
TASK: MONTHLY NARRATIVE FOR ${data.monthLabel || "this month"}
═══════════════════════════════════════════════════════════════════════════════

MONTH PROGRESS: ${weeksCount} week${weeksCount === 1 ? "" : "s"} so far
${weekSummaries || "No weeks recorded yet."}

KEY MOMENTS THIS MONTH (use these for specific references):
${keyMoments}

MONTH FEELINGS (translate these to prose, never mention raw data):
- The month was primarily colored by: ${signals?.dominantMood || "mixed feelings"}
${signals?.runnerUpMood ? `- With undertones of: ${signals.runnerUpMood}` : ""}
- The emotional texture was: ${volatilityFeeling}
- Engagement level: ${engagementLevel}
- Recent direction: ${signals?.last7DaysShift || "holding steady"}

MONTHLY INSIGHT RULES:
- This insight may be generated after just 1 week — write meaningfully even with partial data
- Summarize the weeks chronologically: how the month started, how it evolved
- You CAN subtly reference weeks ("The first week carried...", "As the month progressed...")
- USE the KEY MOMENTS above to add specific, grounded details to the narrative
- Write 6-10+ sentences in TWO paragraphs minimum about how the month FELT
- NEVER mention numbers, percentages, or statistics
- NEVER say "X days" or "Y percent" or "Week 1 had..."
- Paint an emotional picture, like describing a season
- Never give advice
- EMBODY THE TONE

Return plain text (no JSON).`;
}

function buildCapturePrompt(data: InsightRequest["data"], tone: string, customTonePrompt?: string): string {
    const toneStyle = customTonePrompt
        ? wrapCustomTone(customTonePrompt)
        : (TONE_STYLES[tone] || TONE_STYLES.neutral);
    const capture = data.captures?.[0];

    return `${SYSTEM_PROMPT}

TONE STYLE: ${toneStyle}

TASK: MICRO-REFLECTION FOR A SINGLE MOMENT

MOMENT:
- Feeling: ${capture?.mood || "neutral"}
- Note: ${capture?.note || "(none)"}
- Time: ${capture?.timeBucket || "sometime"}

Write 1-2 sentences. Be observational, not prescriptive. EMBODY THE TONE.`;
}

function buildAlbumPrompt(data: InsightRequest["data"], tone: string, customTonePrompt?: string): string {
    const toneStyle = customTonePrompt
        ? wrapCustomTone(customTonePrompt)
        : (TONE_STYLES[tone] || TONE_STYLES.neutral);
    const entries = data.albumContext || [];

    // Sort entries chronologically by time (HH:MM)
    const sortedEntries = [...entries].sort((a, b) => a.time.localeCompare(b.time));

    // Collect unique participant names
    const participants = [...new Set(sortedEntries.map(e => e.user_name))];

    // Build chronological entry descriptions
    const entriesText = sortedEntries.map((e, i) => {
        return `[${i + 1}] ${e.time} | ${e.user_name} | mood: ${e.mood} | ${e.description}`;
    }).join("\n");

    // Determine length based on entry count
    const entryCount = sortedEntries.length;
    const lengthRule = entryCount <= 2
        ? "2-3 paragraphs (4-6 sentences)"
        : entryCount <= 5
            ? "2-3 paragraphs (6-8 sentences)"
            : "3 paragraphs (8-10 sentences)";

    return `${SYSTEM_PROMPT}

═══════════════════════════════════════════════════════════════════════════════
TONE STYLE (Apply as a stylistic filter — never name or acknowledge it)
═══════════════════════════════════════════════════════════════════════════════

${toneStyle}

═══════════════════════════════════════════════════════════════════════════════
TASK: SHARED ALBUM INSIGHT
═══════════════════════════════════════════════════════════════════════════════

This is a shared album where friends post captures throughout the day (24hr window).
Participants: ${participants.join(", ")}

ENTRIES (chronological order):
${entriesText || "No entries found."}

NARRATIVE STRUCTURE (REQUIRED):
1. OPENING: Set the scene for the day across the group. Who started, what the opening mood was.
2. MIDDLE: Weave through the posts chronologically. Note how moods intersected, diverged, or echoed each other between participants.
3. CLOSING SUMMARY: A brief collective reflection on everyone's day. What the group energy felt like as a whole.

RULES:
- Process entries in CHRONOLOGICAL ORDER (by time posted)
- Mention EVERY participant by their first name at least once
- Weave their moments together into a shared narrative, not separate summaries per person
- Reference how participants' moods relate to each other (e.g. one person's calm while another's energy was high)
- The final 1-2 sentences should be a group summary: the collective emotional texture of the day
- ${lengthRule}
- Prose only, no markdown, no bullets, no lists
- Never give advice or therapy
- EMBODY THE TONE

Return plain text (no JSON).`;
}

function buildTagPrompt(data: InsightRequest["data"], tone: string): string {
    const toneStyle = TONE_STYLES[tone] || TONE_STYLES.neutral;

    return `Generate a micro-insight for the tag: #${data.tag}

TONE: ${toneStyle}

RELATED MOMENTS:
${JSON.stringify(data.captures?.slice(0, 10) || [], null, 2)}

${LANGUAGE_CONSTRAINTS}

Write 1-2 sentences about what this tag represents for the user.`;
}

// ============================================
// ERROR RESPONSE HELPER
// ============================================

function createErrorResponse(
  stage: 'auth' | 'fetch' | 'model' | 'parse' | 'validate' | 'extract' | 'unknown',
  message: string,
  status: number,
  requestId: string
): Response {
  const payload = {
    ok: false,
    error: {
      stage,
      message,
      requestId,
      status
    }
  };

  console.error(`[generate-insight] [${requestId}] Error at stage "${stage}":`, message);

  return new Response(
    JSON.stringify(payload),
    {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    }
  );
}

// ============================================
// JSON SANITIZATION & PROCESSING
// ============================================

/**
 * Strips em dashes, en dashes, and ASCII double/triple hyphens from output text.
 * For JSON results, parses and sanitizes text fields inside the JSON.
 */
function sanitizeDashes(text: string): string {
    // If the text is JSON (daily insight returns full JSON), parse and sanitize inside
    try {
        const parsed = JSON.parse(text);
        if (parsed?.narrative?.text) {
            parsed.narrative.text = parsed.narrative.text
                .replace(/[\u2013\u2014]/g, ",")
                .replace(/---?/g, ",");
        }
        return JSON.stringify(parsed);
    } catch {
        // Plain text, sanitize directly
        return text
            .replace(/[\u2013\u2014]/g, ",")
            .replace(/---?/g, ",");
    }
}

function sanitizeJSON(rawText: string): string {
  let sanitized = rawText.trim();

  // Remove markdown code fences (```json, ```)
  sanitized = sanitized.replace(/^```json\s*/i, '');
  sanitized = sanitized.replace(/^```\s*/, '');
  sanitized = sanitized.replace(/\s*```$/, '');

  // Find first { and last }
  const firstBrace = sanitized.indexOf('{');
  const lastBrace = sanitized.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    sanitized = sanitized.substring(firstBrace, lastBrace + 1);
  }

  return sanitized.trim();
}

function processInsightResponse(
  rawText: string,
  type: InsightType,
  requestId: string
): { success: true; result: string } | { success: false; error: Response } {
  // Plain text types - return as-is
  if (type === 'month' || type === 'album' || type === 'tag' || type === 'capture') {
    return { success: true, result: rawText };
  }

  // JSON types - sanitize and validate
  const sanitized = sanitizeJSON(rawText);

  // Log if sanitization was applied
  if (sanitized !== rawText.trim()) {
    console.log(`[generate-insight] [${requestId}] JSON sanitization applied for type "${type}"`);
    console.log(`[generate-insight] [${requestId}] Original length: ${rawText.length}, Sanitized length: ${sanitized.length}`);
  }

  if (sanitized.includes('```')) {
    console.warn(`[generate-insight] [${requestId}] Model output still contains code fences after sanitization`);
  }

  if (rawText.length > 0 && sanitized.length === 0) {
    console.error(`[generate-insight] [${requestId}] Sanitization resulted in empty string. Original: ${rawText.substring(0, 100)}`);
  }

  // Attempt to parse JSON
  let parsed: any;
  try {
    parsed = JSON.parse(sanitized);
  } catch (parseError) {
    console.error(`[generate-insight] [${requestId}] JSON parse failed after sanitization:`, parseError);
    console.error(`[generate-insight] [${requestId}] Sanitized text:`, sanitized.substring(0, 200));
    return {
      success: false,
      error: createErrorResponse(
        'parse',
        `Model returned invalid JSON format (sanitized length: ${sanitized.length}, preview: ${sanitized.substring(0, 120)})`,
        502,
        requestId
      )
    };
  }

  // Type-specific extraction
  if (type === 'weekly') {
    const extractedText =
      parsed?.insight ||
      parsed?.narrative?.text ||
      parsed?.text ||
      parsed?.output?.text;

    if (!extractedText) {
      console.error(`[generate-insight] [${requestId}] Weekly extraction failed. Available keys:`, Object.keys(parsed));
      return {
        success: false,
        error: createErrorResponse(
          'extract',
          `Could not extract text from JSON. Available keys: ${Object.keys(parsed).join(', ')}`,
          502,
          requestId
        )
      };
    }

    return { success: true, result: extractedText };
  }

  if (type === 'daily') {
    if (!parsed?.narrative?.text) {
      console.error(`[generate-insight] [${requestId}] Daily JSON missing narrative.text. Available keys:`, Object.keys(parsed));
      return {
        success: false,
        error: createErrorResponse(
          'validate',
          'Daily insight missing required narrative.text field',
          502,
          requestId
        )
      };
    }

    return { success: true, result: JSON.stringify(parsed) };
  }

  // Fallback for unknown JSON types
  return { success: true, result: JSON.stringify(parsed) };
}

// ============================================
// MAIN HANDLER
// ============================================

serve(async (req: Request) => {
    const requestId = crypto.randomUUID();
    console.log(`[generate-insight] [${requestId}] Request received:`, req.method);

    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        // 1. Verify authentication
        const authHeader = req.headers.get("Authorization");
    console.log(`[generate-insight] [${requestId}] Auth header present:`, !!authHeader);

        if (!authHeader) {
            console.log(`[generate-insight] [${requestId}] ERROR: Missing auth header`);
            return createErrorResponse('auth', 'Missing authorization header', 401, requestId);
        }

        // Initialize Supabase client with user's token
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    console.log(`[generate-insight] [${requestId}] Supabase URL present:`, !!supabaseUrl);
    console.log(`[generate-insight] [${requestId}] Supabase Anon Key present:`, !!supabaseAnonKey);

        if (!supabaseUrl || !supabaseAnonKey) {
            console.log(`[generate-insight] [${requestId}] ERROR: Missing Supabase env vars`);
            return createErrorResponse('unknown', 'Server configuration error', 500, requestId);
        }

        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authHeader } },
        });

        // Extract JWT from Authorization header
        const token = authHeader.replace('Bearer ', '');

        // Get user from token - pass token directly to getUser()
        console.log(`[generate-insight] [${requestId}] Verifying user token...`);
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        console.log(`[generate-insight] [${requestId}] Auth result - user:`, user?.id);
        console.log(`[generate-insight] [${requestId}] Auth error:`, authError ? JSON.stringify(authError) : "none");

        if (authError || !user) {
            console.log(`[generate-insight] [${requestId}] ERROR: Auth failed -`, authError?.message || "No user");
            return createErrorResponse('auth', 'Invalid or expired token', 401, requestId);
        }

        console.log(`[generate-insight] [${requestId}] User authenticated:`, user.id);

        // 2. Check rate limits
        let settings;
        try {
            const { data, error: settingsError } = await supabase
                .from("user_settings")
                .select("subscription_tier, daily_insight_count")
                .eq("user_id", user.id)
                .maybeSingle();  // Returns null instead of throwing if no row exists

            if (settingsError) {
                console.error(`[generate-insight] [${requestId}] Settings fetch error:`, settingsError);
                return createErrorResponse('fetch', 'Failed to fetch user settings', 500, requestId);
            }
            settings = data;
        } catch (dbError) {
            console.error(`[generate-insight] [${requestId}] Database error:`, dbError);
            return createErrorResponse('fetch', 'Failed to fetch user settings', 500, requestId);
        }

        const tier = settings?.subscription_tier || "free";
        const currentCount = settings?.daily_insight_count || 0;
        const limit = RATE_LIMITS[tier as keyof typeof RATE_LIMITS] || RATE_LIMITS.free;

        // Rate limit: 3/day free, 1/day guest, unlimited for founder/subscriber
        if (currentCount >= limit) {
            return createErrorResponse(
                'validate',
                `Rate limit exceeded (${currentCount}/${limit} for ${tier} tier)`,
                429,
                requestId
            );
        }

        // 3. Parse request
        let body: InsightRequest;
        try {
            body = await req.json();
        } catch (parseError) {
            console.error(`[generate-insight] [${requestId}] Request parse error:`, parseError);
            return createErrorResponse('parse', 'Invalid request body', 400, requestId);
        }
        const { type, data, tone, customTonePrompt } = body;

        // 4. Build prompt based on type
        let prompt: string;
        switch (type) {
            case "daily": {
                // Compute nowLocal context for time-aware prompts
                const now = new Date();
                const nowLocal: NowLocalContext = {
                    iso: now.toISOString(),
                    timeLabel: formatTimeLabel(now),
                    dayPart: getDayPartFromHour(now.getHours()),
                    weekday: now.toLocaleDateString('en-US', { weekday: 'long' })
                };
                prompt = buildDailyPrompt(data, tone, customTonePrompt, nowLocal);
                break;
            }
            case "weekly": {
                // Compute nowLocal context for time-aware prompts
                const now = new Date();
                const nowLocal: NowLocalContext = {
                    iso: now.toISOString(),
                    timeLabel: formatTimeLabel(now),
                    dayPart: getDayPartFromHour(now.getHours()),
                    weekday: now.toLocaleDateString('en-US', { weekday: 'long' })
                };
                prompt = buildWeeklyPrompt(data, tone, customTonePrompt, nowLocal);
                break;
            }
            case "month":
                prompt = buildMonthlyPrompt(data, tone, customTonePrompt);
                break;
            case "capture":
                prompt = buildCapturePrompt(data, tone, customTonePrompt);
                break;
            case "album":
                prompt = buildAlbumPrompt(data, tone, customTonePrompt);
                break;
            case "tag":
                prompt = buildTagPrompt(data, tone);
                break;
            default:
                return createErrorResponse('validate', `Unknown insight type: ${type}`, 400, requestId);
        }

        // 5. Call Gemini API (server-side key!)
        const geminiKey = Deno.env.get("GEMINI_API_KEY");
        if (!geminiKey) {
            console.error(`[generate-insight] [${requestId}] GEMINI_API_KEY not configured`);
            return createErrorResponse('unknown', 'AI service not configured', 500, requestId);
        }

        const geminiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                }),
            }
        );

        let geminiData;
        try {
            geminiData = await geminiResponse.json();
        } catch (jsonError) {
            console.error(`[generate-insight] [${requestId}] Gemini response parse error:`, jsonError);
            return createErrorResponse('parse', 'Invalid model response', 502, requestId);
        }

        if (!geminiResponse.ok) {
            console.error(`[generate-insight] [${requestId}] Gemini API error:`, geminiData);
            return createErrorResponse('model', 'AI generation failed', 502, requestId);
        }

        const generatedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

        // 7. Process and validate response based on insight type
        const processed = processInsightResponse(generatedText, type, requestId);

        if (!processed.success) {
            return processed.error;
        }

        // 7b. Sanitize dashes from the result text
        const sanitizedResult = sanitizeDashes(processed.result);

        // 8. Increment usage counter
        try {
            await supabase.rpc("increment_usage", { feature_name: "daily_insight" });
        } catch (usageError) {
            console.error(`[generate-insight] [${requestId}] Usage increment error:`, usageError);
            // Don't fail the request for usage tracking errors, just log it
        }

        // 9. Return result
        return new Response(
            JSON.stringify({
                ok: true,
                result: sanitizedResult,
                requestId
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error) {
        console.error(`[generate-insight] [${requestId}] Edge function error:`, error);
        return createErrorResponse('unknown', 'Internal server error', 500, requestId);
    }
});

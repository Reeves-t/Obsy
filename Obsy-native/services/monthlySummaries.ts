import { supabase } from "@/lib/supabase";
import { Capture } from "@/types/capture";
import { formatMonthKey } from "@/lib/dailyMoodFlows";
import { getBannedMoodWords } from "@/lib/moodColors";
import { callGemini } from "@/services/ai";
import { getMoodLabel } from "@/lib/moodUtils";
import { LANGUAGE_CONSTRAINTS } from "@/lib/insightPrompts";

export interface MonthSignals {
    moodCounts: Record<string, number>;
    dominantMood: string;
    runnerUpMood: string | null;
    volatilityScore: number;
    activeDays: number;
    totalCaptures: number;
    last7DaysShift: "focused" | "intense" | "stable" | "lower";
    streaks: { mood: string; days: number }[];
}

export interface MonthlySummaryData {
    moodTotals: Record<string, number>;
    aiSummary: string | null;
    /** Reasoning that explains WHY the monthPhrase title was chosen */
    aiReasoning?: string | null;
    updatedAt: string;
    monthPhrase?: string | null;
    monthToDateSummary?: string | null;
    generatedThroughDate?: string | null;
    sourceStats?: MonthSignals | null;
}

/**
 * Compute detailed month signals from captures
 */
export function getMonthSignals(captures: Capture[], monthKey: string, throughDate?: string): MonthSignals {
    const end = throughDate ? new Date(throughDate) : new Date();
    const monthStart = new Date(new Date(monthKey + "-01").getTime());

    const monthCaptures = captures.filter(c => {
        const d = new Date(c.created_at);
        return d >= monthStart && d <= end;
    });

    const moodCounts: Record<string, number> = {};
    const moodSnapshots: Record<string, string> = {};
    const dayMoods: Record<string, string[]> = {};

    monthCaptures.forEach(c => {
        const moodId = c.mood_id || "neutral";
        moodCounts[moodId] = (moodCounts[moodId] || 0) + 1;
        if (c.mood_name_snapshot) moodSnapshots[moodId] = c.mood_name_snapshot;

        const dayKey = c.created_at.split('T')[0];
        if (!dayMoods[dayKey]) dayMoods[dayKey] = [];
        dayMoods[dayKey].push(moodId);
    });

    const totalCaptures = monthCaptures.length;
    const activeDays = Object.keys(dayMoods).length;

    // Dominant and Runner up
    const sortedMoods = Object.entries(moodCounts).sort((a, b) => b[1] - a[1]);
    const dominantMoodId = sortedMoods[0]?.[0] || "neutral";
    const runnerUpMoodId = sortedMoods[1]?.[0] || null;

    // Resolve labels for AI prompts
    const dominantMood = moodSnapshots[dominantMoodId] || getMoodLabel(dominantMoodId);
    const runnerUpMood = runnerUpMoodId ? (moodSnapshots[runnerUpMoodId] || getMoodLabel(runnerUpMoodId)) : null;

    // Volatility Score
    let shifts = 0;
    const sortedDays = Object.keys(dayMoods).sort();
    for (let i = 1; i < sortedDays.length; i++) {
        const moodsA = dayMoods[sortedDays[i - 1]];
        const moodsB = dayMoods[sortedDays[i]];
        const domA = moodsA.reduce((a, b, i, arr) => arr.filter(v => v === a).length >= arr.filter(v => v === b).length ? a : b);
        const domB = moodsB.reduce((a, b, i, arr) => arr.filter(v => v === a).length >= arr.filter(v => v === b).length ? a : b);
        if (domA !== domB) shifts++;
    }
    const volatilityScore = sortedDays.length > 1 ? shifts / (sortedDays.length - 1) : 0;

    // Last 7 days shift
    const sevenDaysAgo = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    const recentCaptures = monthCaptures.filter(c => new Date(c.created_at) >= sevenDaysAgo);
    const earlyCaptures = monthCaptures.filter(c => new Date(c.created_at) < sevenDaysAgo);

    let last7DaysShift: "focused" | "intense" | "stable" | "lower" = "stable";
    if (recentCaptures.length > 0 && earlyCaptures.length > 0) {
        // Use a robust energy check helper that works with both system IDs and custom mood IDs
        const isHighEnergy = (mId: string) => {
            const highEnergyIds = ["productive", "creative", "inspired", "confident", "joyful", "social", "busy", "restless", "stressed", "overwhelmed", "anxious", "angry", "pressured", "enthusiastic", "hyped", "manic", "playful"];
            return highEnergyIds.includes(mId);
        };

        const recentHighEnergy = recentCaptures.filter(c => isHighEnergy(c.mood_id || "")).length / recentCaptures.length;
        const earlyHighEnergy = earlyCaptures.filter(c => isHighEnergy(c.mood_id || "")).length / earlyCaptures.length;

        if (recentHighEnergy > earlyHighEnergy + 0.2) last7DaysShift = "intense";
        else if (recentHighEnergy < earlyHighEnergy - 0.2) last7DaysShift = "lower";
        else if (recentCaptures.every(c => c.mood_id === dominantMoodId)) last7DaysShift = "focused";
    }

    return {
        moodCounts,
        dominantMood,
        runnerUpMood,
        volatilityScore,
        activeDays,
        totalCaptures,
        last7DaysShift,
        streaks: []
    };
}

/**
 * Generate lightweight Month-to-Date summary
 */
export async function generateMonthToDateSummary(signals: MonthSignals): Promise<string> {
    if (signals.totalCaptures === 0) return "Not enough data to summarize this month yet.";

    const prompt = `You are a "month status" reporter. Summarize the month so far based on these signals.
    
    SIGNALS:
    - Dominant Mood: ${signals.dominantMood}
    - Runner up: ${signals.runnerUpMood || "none"}
    - Volatility: ${Math.round(signals.volatilityScore * 100)}% (0 is rock steady, 100 is wild shifts)
    - Active days: ${signals.activeDays}
    - Total captures: ${signals.totalCaptures}
    - Recent momentum: ${signals.last7DaysShift} (shift in energy over the last week)

    RULES:
    - Neutral and clear tone.
    - NO therapy vibe, NO poetic metaphors.
    - NEVER mention "journal", "photos", "entries", "captures", or "captured".
    - 2–4 sentences max.
    - Speak as a status update for the month rhythm.

    Example output style:
    "January so far has leaned productive with a steady undercurrent of calm. Most days feel consistent, with a few spikes of higher intensity that taper quickly. The last week trends slightly more focused than the start of the month, suggesting momentum is building rather than fading."`;

    try {
        const response = await callGemini([{ text: prompt }]);
        return response.trim();
    } catch (err) {
        console.error("[monthlySummaries] Month-to-date summary failed:", err);
        return "This month is showing a mix of patterns and momentum so far.";
    }
}

/**
 * Compute mood totals from captures using labels/snapshots for categorization
 */
export function computeMonthMoodTotals(captures: Capture[]): Record<string, number> {
    const totals: Record<string, number> = {};
    captures.forEach((capture) => {
        const label = capture.mood_name_snapshot || getMoodLabel(capture.mood_id || "neutral");
        totals[label] = (totals[label] || 0) + 1;
    });
    return totals;
}

/**
 * Categorize moods into energy levels
 */
function categorizeMoodEnergy(moodTotals: Record<string, number>): {
    highEnergy: number;
    mediumEnergy: number;
    lowEnergy: number;
    total: number;
} {
    const highEnergyMoods = ["productive", "creative", "inspired", "confident", "joyful",
        "social", "busy", "restless", "stressed", "overwhelmed", "anxious",
        "angry", "pressured", "enthusiastic", "hyped", "manic", "playful"];
    const lowEnergyMoods = ["calm", "relaxed", "peaceful", "tired", "drained",
        "bored", "reflective", "melancholy", "nostalgic", "lonely",
        "depressed", "numb", "safe"];

    let highEnergy = 0;
    let lowEnergy = 0;
    let mediumEnergy = 0;
    let total = 0;

    for (const [mood, count] of Object.entries(moodTotals)) {
        total += count;
        if (highEnergyMoods.includes(mood)) {
            highEnergy += count;
        } else if (lowEnergyMoods.includes(mood)) {
            lowEnergy += count;
        } else {
            mediumEnergy += count;
        }
    }

    return { highEnergy, mediumEnergy, lowEnergy, total };
}

/**
 * Generate monthly summary using Gemini AI (Legacy/Lightweight)
 */
export async function generateMonthlySummaryFromMoodTotals(
    moodTotals: Record<string, number>,
    bannedWords: string[]
): Promise<string> {
    const { highEnergy, mediumEnergy, lowEnergy, total } = categorizeMoodEnergy(moodTotals);

    if (total === 0) {
        return "No captures recorded this month yet.";
    }

    const highPct = Math.round((highEnergy / total) * 100);
    const medPct = Math.round((mediumEnergy / total) * 100);
    const lowPct = Math.round((lowEnergy / total) * 100);

    const prompt = `Generate a 2-sentence narrative about this month based on mood distribution.
Do NOT use these words: ${bannedWords.join(", ")}.
Focus on patterns and energy levels without naming specific moods.
Be observational, not therapeutic or advice-giving.
${LANGUAGE_CONSTRAINTS}

Mood distribution for this month:
- ${highPct}% high-energy states (active, driven, intense moments)
- ${medPct}% balanced states (focused, curious, grounded moments)
- ${lowPct}% contemplative states (quiet, restorative, introspective moments)
- Total captures: ${total}

Write 2 sentences that describe the month's emotional rhythm poetically.`;

    try {
        const response = await callGemini([{ text: prompt }]);

        // Post-check: if response contains banned word, try once more
        const lowerResponse = response.toLowerCase();
        const containsBanned = bannedWords.some(word => lowerResponse.includes(word.toLowerCase()));

        if (containsBanned) {
            const strictPrompt = `${prompt}\n\nIMPORTANT: Your previous response contained banned mood words. Use synonyms or metaphors instead.`;
            const retryResponse = await callGemini([{ text: strictPrompt }]);
            return retryResponse.trim();
        }

        return response.trim();
    } catch (err) {
        console.error("[monthlySummaries] AI generation failed:", err);
        // Fallback heuristic summary
        return `This month showed ${highPct}% high-energy patterns and ${lowPct}% contemplative moments. The rhythm varied between active engagement and quiet reflection.`;
    }
}

/**
 * Generate reasoning that explains WHY the monthPhrase title was chosen.
 * This is shown when the user taps the dial to expand it.
 */
export async function generateMonthPhraseReasoning(
    monthPhrase: string,
    signals: MonthSignals,
    bannedWords: string[]
): Promise<string> {
    const moodTotals = signals.moodCounts;
    const activeDays = signals.activeDays;
    const total = signals.totalCaptures;
    const { highEnergy, mediumEnergy, lowEnergy } = categorizeMoodEnergy(moodTotals);

    if (total === 0 || !monthPhrase) {
        return "- Not enough data to explain the title yet.";
    }

    const highPct = Math.round((highEnergy / total) * 100);
    const medPct = Math.round((mediumEnergy / total) * 100);
    const lowPct = Math.round((lowEnergy / total) * 100);

    // Build mood breakdown for context
    const sortedMoods = Object.entries(moodTotals)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([mood, count]) => `${mood}: ${Math.round((count / total) * 100)}%`);

    const prompt = `You are an empathetic observer translating monthly data into a quick human story.

TITLE: "${monthPhrase}"

MONTH DATA:
- Total captures: ${total}
- Days with activity: ${activeDays}
- High-vibe/Productive states: ${highPct}%
- Balanced/Steady states: ${medPct}%
- Quiet/Inward states: ${lowPct}%
- Top feelings: ${sortedMoods.join(", ")}

TASK: Write a 1-sentence summary and exactly 2 very short, thoughtful bullet points explaining why the month felt like "${monthPhrase}".

FORMAT:
Line 1: "This month saw ${total} moments captured across ${activeDays} active days."
Line 2: - [Short observation 1]
Line 3: - [Short observation 2]

RULES:
${LANGUAGE_CONSTRAINTS}
- CRITICAL: Keep bullets extremely concise (10-12 words max each).
- No technical jargon. Focus on the vibe.
- NO metaphors, poetry, or advice.
- Do NOT use these words: ${bannedWords.join(", ")}.`;

    try {
        const response = await callGemini([{ text: prompt }]);
        return response.trim();
    } catch (err) {
        console.error("[monthlySummaries] Reasoning generation failed:", err);
        // Deterministic fallback as 3 bullet points
        const dominantEnergy = highPct >= medPct && highPct >= lowPct
            ? "high-energy"
            : lowPct >= medPct
                ? "contemplative"
                : "balanced";
        return `- ${total} mood captures were recorded this month.\n- ${dominantEnergy.charAt(0).toUpperCase() + dominantEnergy.slice(1)} states accounted for the largest portion at ${Math.max(highPct, medPct, lowPct)}%.\n- The title "${monthPhrase}" reflects this dominant pattern.`;
    }
}

/**
 * Upsert monthly summary to Supabase
 */
export async function upsertMonthlySummary(
    userId: string,
    monthKey: string,
    moodTotals: Record<string, number>,
    aiSummary: string | null,
    monthPhrase?: string | null,
    aiReasoning?: string | null,
    monthToDateSummary?: string | null,
    generatedThroughDate?: string | null,
    sourceStats?: MonthSignals | null
): Promise<void> {
    try {
        const payload: Record<string, unknown> = {
            user_id: userId,
            month_key: monthKey,
            mood_totals: moodTotals,
            ai_summary: aiSummary,
            updated_at: new Date().toISOString(),
        };

        if (monthPhrase !== undefined) payload.month_phrase = monthPhrase;
        if (aiReasoning !== undefined) payload.ai_reasoning = aiReasoning;
        if (monthToDateSummary !== undefined) payload.month_to_date_summary = monthToDateSummary;
        if (generatedThroughDate !== undefined) payload.generated_through_date = generatedThroughDate;
        if (sourceStats !== undefined) payload.source_stats = sourceStats;

        const { error } = await supabase.from("monthly_mood_summaries").upsert(
            payload,
            { onConflict: "user_id,month_key" }
        );

        if (error) {
            console.error("[monthlySummaries] Upsert error:", error);
        }
    } catch (err) {
        console.error("[monthlySummaries] Upsert exception:", err);
    }
}

/**
 * Fetch monthly summary from Supabase
 */
export async function fetchMonthlySummary(
    userId: string,
    monthKey: string
): Promise<MonthlySummaryData | null> {
    try {
        const { data, error } = await supabase
            .from("monthly_mood_summaries")
            .select("*")
            .eq("user_id", userId)
            .eq("month_key", monthKey)
            .single();

        if (error || !data) {
            return null;
        }

        return {
            moodTotals: data.mood_totals as Record<string, number>,
            aiSummary: data.ai_summary,
            aiReasoning: data.ai_reasoning as string | null | undefined,
            updatedAt: data.updated_at,
            monthPhrase: data.month_phrase as string | null | undefined,
            monthToDateSummary: data.month_to_date_summary as string | null | undefined,
            generatedThroughDate: data.generated_through_date as string | null | undefined,
            sourceStats: data.source_stats as MonthSignals | null | undefined,
        };
    } catch (err) {
        console.error("[monthlySummaries] Fetch exception:", err);
        return null;
    }
}

/**
 * Check if monthly summary is stale
 */
export function isMonthlySummaryStale(updatedAt: string, latestCaptureDate: string): boolean {
    return new Date(latestCaptureDate) > new Date(updatedAt);
}


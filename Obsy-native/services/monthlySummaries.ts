import { supabase } from "@/lib/supabase";
import { Capture } from "@/types/capture";
import { formatMonthKey } from "@/lib/dailyMoodFlows";
import { getMoodLabel } from "@/lib/moodUtils";

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
 * Describe volatility score in human terms
 */
function describeVolatility(score: number): string {
    if (score >= 0.75) return "High variability, moods shifted frequently between days";
    if (score >= 0.5) return "Moderate variability, noticeable shifts across the month";
    if (score >= 0.25) return "Mild variability, some shifts but mostly steady";
    return "Low variability, moods stayed fairly consistent";
}

/**
 * Describe the last 7 days shift
 */
function describeLast7DaysShift(shift: string): string {
    switch (shift) {
        case "intense": return "Recent days have been more intense and high-energy";
        case "focused": return "Recent days have narrowed around one dominant mood";
        case "lower": return "Recent days have been calmer and lower-energy";
        default: return "Recent days have been consistent with the overall pattern";
    }
}

/**
 * Generate reasoning that explains WHY the monthPhrase title was chosen.
 * This is shown when the user taps the dial to expand it.
 * Provides detailed data points: top moods, energy breakdown, volatility, trends.
 */
export async function generateMonthPhraseReasoning(
    monthPhrase: string,
    signals: MonthSignals,
    bannedWords: string[]
): Promise<string> {
    const moodCounts = signals.moodCounts;
    const activeDays = signals.activeDays;
    const total = signals.totalCaptures;
    const { highEnergy, mediumEnergy, lowEnergy } = categorizeMoodEnergy(moodCounts);

    if (total === 0 || !monthPhrase) {
        return "Not enough data to explain the title yet.";
    }

    const lines: string[] = [];

    // 1. Overview line
    lines.push(`${total} captures across ${activeDays} active days.`);

    // 2. Top moods breakdown (top 4)
    const sortedMoods = Object.entries(moodCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4);

    if (sortedMoods.length > 0) {
        const moodLines = sortedMoods.map(([id, count]) => {
            const label = getMoodLabel(id);
            const pct = Math.round((count / total) * 100);
            return `${label} (${pct}%, ${count} captures)`;
        });
        lines.push(`- Top moods: ${moodLines.join(", ")}`);
    }

    // 3. Energy distribution
    const highPct = Math.round((highEnergy / total) * 100);
    const medPct = Math.round((mediumEnergy / total) * 100);
    const lowPct = Math.round((lowEnergy / total) * 100);
    lines.push(`- Energy: ${highPct}% high, ${medPct}% neutral, ${lowPct}% low`);

    // 4. Volatility
    const volPct = Math.round(signals.volatilityScore * 100);
    lines.push(`- Stability: ${volPct}% volatility. ${describeVolatility(signals.volatilityScore)}`);

    // 5. Recent trend
    lines.push(`- Trend: ${describeLast7DaysShift(signals.last7DaysShift)}`);

    // 6. Phrase explanation
    const dominantEnergy = highPct >= medPct && highPct >= lowPct
        ? "high-energy"
        : lowPct >= medPct
            ? "contemplative"
            : "balanced";
    lines.push(`- "${monthPhrase}" reflects a ${dominantEnergy} month shaped by ${signals.dominantMood}${signals.runnerUpMood ? ` and ${signals.runnerUpMood}` : ""}`);

    return lines.join("\n");
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



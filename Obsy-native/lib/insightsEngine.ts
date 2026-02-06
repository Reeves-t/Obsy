import { formatMonthKey, MoodFlowData, isMoodFlowReading, isMoodFlowSegments } from "@/lib/dailyMoodFlows";
import { generateMonthPhrase } from "@/lib/monthPhraseGenerator";
import { fetchMonthlySummary, upsertMonthlySummary, computeMonthMoodTotals } from "@/services/monthlySummaries";
import { getBannedMoodWords } from "@/lib/moodColors";
import { Capture } from "@/types/capture";

/**
 * Update the month phrase for a given date's month
 * (kept for potential reuse by other pipelines)
 */
export async function updateMonthPhraseForDate(
    userId: string,
    date: Date,
    allCaptures: Capture[]
): Promise<void> {
    const monthKey = formatMonthKey(date);

    // Filter captures for this month
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

    const monthCaptures = allCaptures.filter(c => {
        const captureDate = new Date(c.created_at);
        return captureDate >= monthStart && captureDate <= monthEnd;
    });

    if (monthCaptures.length < 3) {
        return; // Need minimum captures for meaningful phrase
    }

    // Compute mood totals
    const moodTotals = computeMonthMoodTotals(monthCaptures);

    // Generate phrase
    const bannedWords = getBannedMoodWords();
    const phrase = await generateMonthPhrase(moodTotals, bannedWords);

    // Fetch existing summary (if any)
    const existing = await fetchMonthlySummary(userId, monthKey);

    // Upsert with new phrase
    await upsertMonthlySummary(
        userId,
        monthKey,
        existing?.moodTotals || moodTotals,
        existing?.aiSummary || '',
        phrase
    );
}



/**
 * Log mood flow metrics for monitoring AI reliability
 * Supports both segments (array) and reading (object) formats
 */
export function logMoodFlowMetrics(moodFlow: MoodFlowData | undefined, source: 'ai' | 'fallback'): void {
    if (!moodFlow) {
        console.log(`[MoodFlowMetrics] source=${source} format=empty`);
        return;
    }

    // Detect format and log appropriately
    if (isMoodFlowReading(moodFlow)) {
        // Reading format
        console.log(`[MoodFlowMetrics] source=${source} format=reading title="${moodFlow.title}" confidence=${moodFlow.confidence}`);
    } else if (isMoodFlowSegments(moodFlow)) {
        // Segments format
        const segmentCount = moodFlow.length;
        const totalPercentage = moodFlow.reduce((sum, s) => sum + (s.percentage || 0), 0);

        console.log(`[MoodFlowMetrics] source=${source} format=segments count=${segmentCount} totalPercentage=${totalPercentage}`);

        if (segmentCount > 0 && Math.abs(totalPercentage - 100) > 1) {
            console.warn(`[MoodFlowMetrics] Percentage sum ${totalPercentage} != 100`);
        }
    } else {
        console.log(`[MoodFlowMetrics] source=${source} format=unknown`);
    }

    if (source === 'fallback') {
        console.warn('[MoodFlowMetrics] Fallback was used - AI did not generate valid mood_flow');
    }
}

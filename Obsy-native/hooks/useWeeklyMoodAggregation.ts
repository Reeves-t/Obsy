import { useMemo } from 'react';
import { Capture } from '@/types/capture';
import { getWeekRangeForUser } from '@/lib/dateUtils';
import { resolveMoodColorById } from '@/lib/moodUtils';

export interface MoodWeight {
    moodId: string;
    moodLabel: string;
    color: string;
    captureCount: number;
    percentage: number;
    size: number; // Calculated size multiplier
}

/**
 * Aggregates mood data for the current week and calculates orb sizes
 *
 * Size logic:
 * - Base size: 1.0 (default small orb)
 * - Each additional capture adds 0.5x
 * - Formula: size = 1.0 + ((captureCount - 1) * 0.5)
 *
 * Returns top 2-4 moods sorted by capture count
 */
export function useWeeklyMoodAggregation(captures: Capture[]): MoodWeight[] {
    return useMemo(() => {
        const { start, end } = getWeekRangeForUser(new Date());

        // Filter captures for current week
        const weekCaptures = captures.filter(capture => {
            const captureDate = new Date(capture.created_at);
            return captureDate >= start && captureDate <= end;
        });

        // No captures = no orbs
        if (weekCaptures.length === 0) {
            return [];
        }

        // Count captures by mood
        const moodCounts = new Map<string, { count: number; label: string }>();

        weekCaptures.forEach(capture => {
            const moodId = capture.mood_id;
            const moodLabel = capture.mood_name_snapshot || 'Unknown';

            if (!moodCounts.has(moodId)) {
                moodCounts.set(moodId, { count: 0, label: moodLabel });
            }

            const current = moodCounts.get(moodId)!;
            moodCounts.set(moodId, { count: current.count + 1, label: moodLabel });
        });

        // Convert to array and calculate percentages
        const totalCaptures = weekCaptures.length;
        const moodWeights: MoodWeight[] = Array.from(moodCounts.entries()).map(([moodId, data]) => {
            const captureCount = data.count;
            const percentage = (captureCount / totalCaptures) * 100;

            // Size calculation: base 1.0 + (additional captures * 0.5)
            const size = 1.0 + ((captureCount - 1) * 0.5);

            return {
                moodId,
                moodLabel: data.label,
                color: resolveMoodColorById(moodId, data.label),
                captureCount,
                percentage,
                size,
            };
        });

        // Sort by capture count descending and take top 2-4
        const sorted = moodWeights.sort((a, b) => b.captureCount - a.captureCount);

        // Return 2-4 moods (more moods if there's diversity, fewer if dominated)
        const topMoods = sorted.slice(0, Math.min(4, sorted.length));

        // Only return if we have at least 1 mood
        return topMoods.length > 0 ? topMoods : [];
    }, [captures]);
}

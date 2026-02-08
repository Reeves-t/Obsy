import { Capture } from '@/types/capture';
import { getLocalDayKey } from '@/lib/utils';
import { getWeekRangeForUser } from '@/lib/dateUtils';
import { formatMonthKey } from '@/lib/dailyMoodFlows';

/**
 * Counts captures created after the insight was last updated
 */
export function countPendingDailyCaptures(
    lastUpdated: Date | null,
    allCaptures: Capture[]
): number {
    if (!lastUpdated) return 0;

    const today = getLocalDayKey(new Date());
    const todayCaptures = allCaptures.filter(c =>
        getLocalDayKey(new Date(c.created_at)) === today
    );

    return todayCaptures.filter(c =>
        new Date(c.created_at) > lastUpdated
    ).length;
}

/**
 * Counts captures in the current week created after the insight was last updated
 */
export function countPendingWeeklyCaptures(
    lastUpdated: Date | null,
    allCaptures: Capture[]
): number {
    if (!lastUpdated) return 0;

    const { start, end } = getWeekRangeForUser(new Date());
    const weekCaptures = allCaptures.filter(c => {
        const captureDate = new Date(c.created_at);
        return captureDate >= start && captureDate <= end;
    });

    return weekCaptures.filter(c =>
        new Date(c.created_at) > lastUpdated
    ).length;
}

/**
 * Counts captures in the current month created after the insight was last updated
 */
export function countPendingMonthlyCaptures(
    lastUpdated: Date | null,
    currentMonth: string, // YYYY-MM format
    allCaptures: Capture[]
): number {
    if (!lastUpdated) return 0;

    const monthCaptures = allCaptures.filter(c => {
        const captureMonth = formatMonthKey(new Date(c.created_at));
        return captureMonth === currentMonth;
    });

    return monthCaptures.filter(c =>
        new Date(c.created_at) > lastUpdated
    ).length;
}

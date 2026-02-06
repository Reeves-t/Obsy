import { Capture } from '@/types/capture';
import { getLocalDayKey, getWeekRangeForUser, getMonthRangeForUser } from '@/lib/utils';

export type TimeBucket = 'early' | 'midday' | 'late';
export type DayPart = 'Late night' | 'Morning' | 'Midday' | 'Evening' | 'Night';

export interface CaptureForInsight {
    id: string;
    capturedAt: string; // ISO
    localTimeLabel: string; // "12:41 AM", "12:47 PM"
    timeBucket: TimeBucket;
    dayPart: DayPart;
    mood: string;
    hasJournal: boolean;
    journalSnippet?: string;
    tags?: string[];
    // Include any existing fields (image summary, challengeId, tag group id, etc.)
    imageDescription?: string;
    imageUrl?: string;
    usePhotoForInsight: boolean;
}

export interface DaySummaryForInsight {
    dateISO: string;       // "2025-11-29"
    dateLabel: string;     // "Saturday, Nov 29"
    weekdayLabel: string;  // "Saturday"
    primaryMoods: string[]; // deduped set of moods
    captures: CaptureForInsight[]; // sorted ASC by time
}

export interface WeekSummaryForInsight {
    weekLabel: string; // e.g. "Week of Nov 24–Nov 30"
    days: DaySummaryForInsight[]; // sorted ASC by date
}

export interface MonthSummaryForInsight {
    monthLabel: string; // "November 2025"
    weeks?: WeekSummaryForInsight[]; // optional, but at least days must be sorted
    days: DaySummaryForInsight[];   // full month timeline, sorted ASC
}

export function getTimeBucketForDate(date: Date): TimeBucket {
    const hour = date.getHours();
    if (hour < 11) return 'early';
    if (hour < 17) return 'midday';
    return 'late';
}

export function getDayPart(date: Date): DayPart {
    const hour = date.getHours();
    if (hour < 5) return 'Late night';   // 0-4 (12:00 AM - 4:59 AM)
    if (hour < 12) return 'Morning';     // 5-11 (5:00 AM - 11:59 AM)
    if (hour < 17) return 'Midday';      // 12-16 (12:00 PM - 4:59 PM)
    if (hour < 21) return 'Evening';     // 17-20 (5:00 PM - 8:59 PM)
    return 'Night';                       // 21-23 (9:00 PM - 11:59 PM)
}

export function formatLocalTimeLabel(date: Date): string {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// ============================================
// CAPTURE FILTERING UTILITIES
// ============================================

/**
 * Enriched capture with time context fields for insight generation.
 */
export interface EnrichedCapture extends Capture {
    localTimeLabel: string;
    timeBucket: TimeBucket;
    dayPart: DayPart;
}

/**
 * Enriches a capture with time context fields.
 */
function enrichCapture(capture: Capture): EnrichedCapture {
    const captureDate = new Date(capture.created_at);
    return {
        ...capture,
        localTimeLabel: formatLocalTimeLabel(captureDate),
        timeBucket: getTimeBucketForDate(captureDate),
        dayPart: getDayPart(captureDate),
    };
}

/**
 * Get captures for a specific day, filtered, sorted chronologically, and enriched with time context.
 *
 * @param date - The target date
 * @param captures - All captures to filter from
 * @returns Enriched captures for the day, sorted by created_at ascending
 */
export function getCapturesForDaily(date: Date, captures: Capture[]): EnrichedCapture[] {
    const targetDayKey = getLocalDayKey(date);

    return captures
        .filter((c) => {
            const captureKey = getLocalDayKey(new Date(c.created_at));
            return captureKey === targetDayKey && (c.includeInInsights !== false);
        })
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .map(enrichCapture);
}

/**
 * Get captures for a week, filtered, sorted chronologically, and enriched with time context.
 *
 * @param weekStart - The start of the week (typically Sunday)
 * @param captures - All captures to filter from
 * @param endDate - Optional end date (defaults to week end from getWeekRangeForUser)
 * @returns Enriched captures for the week, sorted by created_at ascending
 */
export function getCapturesForWeek(weekStart: Date, captures: Capture[], endDate?: Date): EnrichedCapture[] {
    const range = getWeekRangeForUser(weekStart);
    const effectiveEnd = endDate ?? range.end;

    return captures
        .filter((c) => {
            const createdAt = new Date(c.created_at);
            return createdAt >= range.start && createdAt <= effectiveEnd && (c.includeInInsights !== false);
        })
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .map(enrichCapture);
}

/**
 * Get captures for a month, filtered and sorted chronologically.
 *
 * @param monthStart - The start of the month (first day)
 * @param captures - All captures to filter from
 * @param endDate - Optional end date (defaults to month end from getMonthRangeForUser)
 * @returns Captures for the month, sorted by created_at ascending
 */
export function getCapturesForMonth(monthStart: Date, captures: Capture[], endDate?: Date): Capture[] {
    const range = getMonthRangeForUser(monthStart);
    const effectiveEnd = endDate ?? range.end;

    return captures
        .filter((c) => {
            const createdAt = new Date(c.created_at);
            return createdAt >= range.start && createdAt <= effectiveEnd && (c.includeInInsights !== false);
        })
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

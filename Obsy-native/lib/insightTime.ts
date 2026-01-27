export type TimeBucket = 'early' | 'midday' | 'late';

export interface CaptureForInsight {
    id: string;
    capturedAt: string; // ISO
    localTimeLabel: string; // "12:41 AM", "12:47 PM"
    timeBucket: TimeBucket;
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

export function formatLocalTimeLabel(date: Date): string {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

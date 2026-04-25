import { Capture } from '@/types/capture';
import { getWeekRangeForUser } from './dateUtils';
import { isWithinInterval, parseISO, format, startOfMonth, endOfMonth, addDays } from 'date-fns';
import { resolveMoodColorById, getMoodLabel } from './moodUtils';

export type MoodSignalRange = 'this_week' | 'last_week' | 'month' | 'all_time';

export interface MoodSignalData {
    range: MoodSignalRange;
    bars: DailyPatternData[];
    moodWeights: { mood: string; color: string; count: number }[];
    totalMoodsCount: number;
    hasEnoughData: boolean;
}

export interface DailyPatternData {
    dayName: string; // Mon, Tue, etc.
    topMood: string | null;
    color: string;
    dominance: number; // 0..1
    totalCaptures: number;
    topMoodCount: number;
}

/**
 * Processes captures into Mood Signal data for the selected range.
 * Pure data only: top mood by day/weekday with deterministic tie-breaking.
 */
export function getMoodSignal(captures: Capture[], range: MoodSignalRange): MoodSignalData {
    const now = new Date();
    const { start, end } = getRangeBounds(now, range);

    // Filter captures for the selected range
    const rangeCaptures = captures.filter(c => {
        const d = parseISO(c.created_at);
        return isWithinInterval(d, { start, end });
    });

    // Mood Weights for legend using mood_id
    const moodCounts: Record<string, number> = {};
    const moodSnapshots: Record<string, string> = {};

    rangeCaptures.forEach(c => {
        const moodId = c.mood_id || 'neutral';
        moodCounts[moodId] = (moodCounts[moodId] || 0) + 1;
        if (c.mood_name_snapshot) {
            moodSnapshots[moodId] = c.mood_name_snapshot;
        }
    });

    const sortedMoods = Object.entries(moodCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([moodId, count]) => {
            // Validate snapshot: if it looks like a raw ID (e.g., "custom_abc123"), resolve it
            const snapshot = moodSnapshots[moodId];
            const isValidSnapshot = snapshot && !snapshot.startsWith('custom_') && snapshot !== moodId;
            const label = isValidSnapshot ? snapshot : getMoodLabel(moodId, snapshot);
            return {
                mood: label,
                color: resolveMoodColorById(moodId, label),
                count
            };
        });

    const bars = buildBars(rangeCaptures);
    const hasEnoughData = rangeCaptures.length >= 3;

    return {
        range,
        bars,
        moodWeights: sortedMoods,
        totalMoodsCount: sortedMoods.length,
        hasEnoughData
    };
}

function getRangeBounds(now: Date, range: MoodSignalRange): { start: Date; end: Date } {
    if (range === 'this_week') {
        return getWeekRangeForUser(now);
    }
    if (range === 'last_week') {
        const lastWeekDate = addDays(now, -7);
        return getWeekRangeForUser(lastWeekDate);
    }
    if (range === 'month') {
        return { start: startOfMonth(now), end: endOfMonth(now) };
    }

    // all_time
    return { start: new Date(2000, 0, 1), end: now };
}

const WEEKDAY_ORDER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function buildBars(captures: Capture[]): DailyPatternData[] {
    // Stable Sun..Sat layout regardless of range start date.
    return WEEKDAY_ORDER.map((dayName) => {
        const dayCaptures = captures.filter((capture) => {
            const d = parseISO(capture.created_at);
            return format(d, 'EEE') === dayName;
        });

        const top = getTopMoodForBucket(dayCaptures);

        return {
            dayName,
            topMood: top?.label ?? null,
            color: top?.color ?? 'rgba(140,140,160,0.35)',
            dominance: top?.dominance ?? 0,
            totalCaptures: dayCaptures.length,
            topMoodCount: top?.count ?? 0,
        };
    });
}

function getTopMoodForBucket(bucket: Capture[]): { moodId: string; label: string; color: string; count: number; dominance: number } | null {
    if (bucket.length === 0) return null;

    const counts = new Map<string, { count: number; latestAt: string; label: string }>();
    bucket.forEach((capture) => {
        const moodId = capture.mood_id || 'neutral';
        const snapshot = capture.mood_name_snapshot;
        const label = getMoodLabel(moodId, snapshot);
        const existing = counts.get(moodId);
        if (!existing) {
            counts.set(moodId, { count: 1, latestAt: capture.created_at, label });
            return;
        }

        counts.set(moodId, {
            count: existing.count + 1,
            latestAt: capture.created_at > existing.latestAt ? capture.created_at : existing.latestAt,
            label: existing.label || label,
        });
    });

    const winner = Array.from(counts.entries()).sort((a, b) => {
        // 1) highest count
        if (b[1].count !== a[1].count) return b[1].count - a[1].count;
        // 2) most recent capture wins ties
        if (b[1].latestAt !== a[1].latestAt) return b[1].latestAt.localeCompare(a[1].latestAt);
        // 3) deterministic lexical fallback
        return a[1].label.localeCompare(b[1].label);
    })[0];

    if (!winner) return null;
    const [moodId, data] = winner;
    return {
        moodId,
        label: data.label,
        color: resolveMoodColorById(moodId, data.label),
        count: data.count,
        dominance: data.count / bucket.length,
    };
}

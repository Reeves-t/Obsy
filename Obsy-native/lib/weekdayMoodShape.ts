import { addMonths, format, parseISO, startOfMonth } from 'date-fns';
import type { Capture } from '@/types/capture';
import { getMoodLabel, resolveMoodThemeById } from '@/lib/moodUtils';
import type { MoodSignalSummary } from '@/lib/moodSignals';

export type WeekdayMoodKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export const WEEKDAY_MOOD_OPTIONS: Array<{ key: WeekdayMoodKey; label: string; jsDay: number }> = [
    { key: 'mon', label: 'Mon', jsDay: 1 },
    { key: 'tue', label: 'Tue', jsDay: 2 },
    { key: 'wed', label: 'Wed', jsDay: 3 },
    { key: 'thu', label: 'Thu', jsDay: 4 },
    { key: 'fri', label: 'Fri', jsDay: 5 },
    { key: 'sat', label: 'Sat', jsDay: 6 },
    { key: 'sun', label: 'Sun', jsDay: 0 },
];

export interface WeekdayMoodBucket {
    key: string;
    label: string;
    totalCaptures: number;
    moodCounts: Record<string, number>;
}

export interface WeekdayMoodLayer {
    moodId: string;
    label: string;
    color: string;
    gradientFrom: string;
    gradientMid: string;
    gradientTo: string;
    totalCount: number;
    values: number[];
}

export interface WeekdayMoodShapeData {
    weekday: WeekdayMoodKey;
    weekdayLabel: string;
    buckets: WeekdayMoodBucket[];
    layers: WeekdayMoodLayer[];
    summary: MoodSignalSummary;
    hasEnoughData: boolean;
}

interface MoodMeta {
    label: string;
    latestAt: string;
}

export function getWeekdayMoodShape(captures: Capture[], weekday: WeekdayMoodKey): WeekdayMoodShapeData {
    const option = WEEKDAY_MOOD_OPTIONS.find((item) => item.key === weekday) ?? WEEKDAY_MOOD_OPTIONS[0];
    const eligible = captures
        .filter((capture) => capture.includeInInsights !== false)
        .filter((capture) => parseISO(capture.created_at).getDay() === option.jsDay)
        .sort((a, b) => a.created_at.localeCompare(b.created_at));

    if (eligible.length === 0) {
        return {
            weekday,
            weekdayLabel: option.label,
            buckets: [],
            layers: [],
            summary: emptySummary(),
            hasEnoughData: false,
        };
    }

    const firstMonth = startOfMonth(parseISO(eligible[0].created_at));
    const lastMonth = startOfMonth(parseISO(eligible[eligible.length - 1].created_at));
    const bucketMap = new Map<string, WeekdayMoodBucket>();

    for (let cursor = firstMonth; cursor <= lastMonth; cursor = addMonths(cursor, 1)) {
        const key = format(cursor, 'yyyy-MM');
        bucketMap.set(key, {
            key,
            label: format(cursor, "MMM ''yy"),
            totalCaptures: 0,
            moodCounts: {},
        });
    }

    const moodMeta: Record<string, MoodMeta> = {};

    eligible.forEach((capture) => {
        const date = parseISO(capture.created_at);
        const bucketKey = format(date, 'yyyy-MM');
        const bucket = bucketMap.get(bucketKey);
        if (!bucket) return;

        const moodId = capture.mood_id || 'neutral';
        const label = getMoodLabel(moodId, capture.mood_name_snapshot);

        bucket.totalCaptures += 1;
        bucket.moodCounts[moodId] = (bucket.moodCounts[moodId] || 0) + 1;

        const existing = moodMeta[moodId];
        if (!existing || capture.created_at > existing.latestAt) {
            moodMeta[moodId] = { label, latestAt: capture.created_at };
        }
    });

    const buckets = Array.from(bucketMap.values());
    const moodTotals = new Map<string, number>();
    buckets.forEach((bucket) => {
        Object.entries(bucket.moodCounts).forEach(([moodId, count]) => {
            moodTotals.set(moodId, (moodTotals.get(moodId) ?? 0) + count);
        });
    });

    const orderedMoodIds = Array.from(moodTotals.entries())
        .sort((a, b) => {
            if (b[1] !== a[1]) return b[1] - a[1];
            const aLatest = moodMeta[a[0]]?.latestAt ?? '';
            const bLatest = moodMeta[b[0]]?.latestAt ?? '';
            return bLatest.localeCompare(aLatest);
        })
        .map(([moodId]) => moodId);

    const layers = orderedMoodIds.map((moodId) => {
        const label = moodMeta[moodId]?.label ?? getMoodLabel(moodId);
        const theme = resolveMoodThemeById(moodId, label);
        return {
            moodId,
            label,
            color: theme.solid,
            gradientFrom: theme.gradient.primary,
            gradientMid: theme.gradient.mid,
            gradientTo: theme.gradient.secondary,
            totalCount: moodTotals.get(moodId) ?? 0,
            values: buckets.map((bucket) => bucket.moodCounts[moodId] ?? 0),
        };
    });

    const activeDateCount = new Set(eligible.map((capture) => format(parseISO(capture.created_at), 'yyyy-MM-dd'))).size;

    return {
        weekday,
        weekdayLabel: option.label,
        buckets,
        layers,
        summary: buildSummary(buckets, layers, eligible.length, activeDateCount),
        hasEnoughData: eligible.length >= 3,
    };
}

function buildSummary(
    buckets: WeekdayMoodBucket[],
    layers: WeekdayMoodLayer[],
    totalEntries: number,
    activeDateCount: number
): MoodSignalSummary {
    const activeBuckets = buckets.filter((bucket) => bucket.totalCaptures > 0);
    const mixedBuckets = activeBuckets.filter((bucket) => Object.keys(bucket.moodCounts).length > 1);
    const mixScore = activeBuckets.length > 0 ? mixedBuckets.length / activeBuckets.length : 0;

    const peak = activeBuckets
        .slice()
        .sort((a, b) => b.totalCaptures - a.totalCaptures)[0];

    const mostMixed = activeBuckets
        .slice()
        .sort((a, b) => {
            const aMix = bucketMixScore(a);
            const bMix = bucketMixScore(b);
            if (bMix !== aMix) return bMix - aMix;
            return b.totalCaptures - a.totalCaptures;
        })[0];

    return {
        totalEntries,
        activeDays: activeDateCount,
        moodVariety: layers.length,
        dominantMood: layers[0]?.label ?? null,
        runnerUpMood: layers[1]?.label ?? null,
        mixScore,
        mixLabel: describeMixScore(mixScore, activeBuckets.length),
        strongestDay: peak?.label ?? null,
        mostBlendedDay: mostMixed && bucketMixScore(mostMixed) > 0 ? mostMixed.label : null,
    };
}

function emptySummary(): MoodSignalSummary {
    return {
        totalEntries: 0,
        activeDays: 0,
        moodVariety: 0,
        dominantMood: null,
        runnerUpMood: null,
        mixScore: 0,
        mixLabel: 'No signal yet',
        strongestDay: null,
        mostBlendedDay: null,
    };
}

function bucketMixScore(bucket: WeekdayMoodBucket): number {
    if (bucket.totalCaptures <= 1) return 0;
    const top = Math.max(...Object.values(bucket.moodCounts));
    return Math.max(0, Math.min(1, 1 - (top / bucket.totalCaptures)));
}

function describeMixScore(score: number, activeBuckets: number): string {
    if (activeBuckets === 0) return 'No signal yet';
    if (score === 0) return 'Focused';
    if (score < 0.35) return 'Mostly focused';
    if (score < 0.65) return 'Blended';
    return 'Highly mixed';
}

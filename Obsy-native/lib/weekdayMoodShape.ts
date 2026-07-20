import { addMonths, format, parseISO, startOfMonth } from 'date-fns';
import type { Capture } from '@/types/capture';
import { getMoodLabel, resolveMoodThemeById } from '@/lib/moodUtils';
import type { MoodSignalSummary } from '@/lib/moodSignals';
import { MOODS } from '@/constants/Moods';

type MoodTone = 'low' | 'medium' | 'high';

// Energy tones only exist on the static system catalog; custom moods fall back
// to a label match (e.g. a custom "Happy") or count as unknown.
const TONE_BY_ID = new Map<string, MoodTone>(MOODS.map((mood) => [mood.id, mood.tone]));
const TONE_BY_LABEL = new Map<string, MoodTone>(MOODS.map((mood) => [mood.label.toLowerCase(), mood.tone]));

export interface EnergyBreakdown {
    low: number;
    medium: number;
    high: number;
    unknown: number;
}

export interface WeekdayShapeSummary extends MoodSignalSummary {
    energyBreakdown: EnergyBreakdown;
    energyLabel: string;
}

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
    summary: WeekdayShapeSummary;
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
    const energy: EnergyBreakdown = { low: 0, medium: 0, high: 0, unknown: 0 };

    eligible.forEach((capture) => {
        const date = parseISO(capture.created_at);
        const bucketKey = format(date, 'yyyy-MM');
        const bucket = bucketMap.get(bucketKey);
        if (!bucket) return;

        const moodId = capture.mood_id || 'neutral';
        const label = getMoodLabel(moodId, capture.mood_name_snapshot);
        const tone = TONE_BY_ID.get(moodId) ?? TONE_BY_LABEL.get(label.toLowerCase());
        energy[tone ?? 'unknown'] += 1;

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
        summary: buildSummary(buckets, layers, eligible.length, activeDateCount, energy),
        hasEnoughData: eligible.length >= 3,
    };
}

function buildSummary(
    buckets: WeekdayMoodBucket[],
    layers: WeekdayMoodLayer[],
    totalEntries: number,
    activeDateCount: number,
    energy: EnergyBreakdown
): WeekdayShapeSummary {
    const activeBuckets = buckets.filter((bucket) => bucket.totalCaptures > 0);
    // Capture-weighted average of each month's proportional mix, so one stray
    // second mood in a heavy month no longer counts the month as fully mixed.
    const totalActiveCaptures = activeBuckets.reduce((sum, bucket) => sum + bucket.totalCaptures, 0);
    const mixScore = totalActiveCaptures > 0
        ? activeBuckets.reduce((sum, bucket) => sum + bucketMixScore(bucket) * bucket.totalCaptures, 0) / totalActiveCaptures
        : 0;

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
        energyBreakdown: energy,
        energyLabel: describeEnergy(energy),
    };
}

function emptySummary(): WeekdayShapeSummary {
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
        energyBreakdown: { low: 0, medium: 0, high: 0, unknown: 0 },
        energyLabel: '—',
    };
}

function describeEnergy(energy: EnergyBreakdown): string {
    const known = energy.low + energy.medium + energy.high;
    if (known === 0) return '—';
    const lowShare = energy.low / known;
    const mediumShare = energy.medium / known;
    const highShare = energy.high / known;
    if (highShare >= 0.55) return 'High-leaning';
    if (lowShare >= 0.55) return 'Low-leaning';
    if (mediumShare >= 0.55) return 'Steady';
    if (lowShare >= 0.35 && highShare >= 0.35) return 'Polarized';
    return 'Balanced';
}

function bucketMixScore(bucket: WeekdayMoodBucket): number {
    if (bucket.totalCaptures <= 1) return 0;
    const top = Math.max(...Object.values(bucket.moodCounts));
    return Math.max(0, Math.min(1, 1 - (top / bucket.totalCaptures)));
}

// Thresholds are calibrated for the proportional metric, which tops out near
// 0.67 when three moods are evenly mixed (1 - top/total).
function describeMixScore(score: number, activeBuckets: number): string {
    if (activeBuckets === 0) return 'No signal yet';
    if (score === 0) return 'Focused';
    if (score < 0.18) return 'Mostly focused';
    if (score < 0.4) return 'Blended';
    return 'Highly mixed';
}

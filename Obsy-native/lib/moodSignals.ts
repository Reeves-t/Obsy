import { Capture } from '@/types/capture';
import { getWeekRangeForUser } from './dateUtils';
import { isWithinInterval, parseISO, format, startOfMonth, endOfMonth, addDays } from 'date-fns';
import { resolveMoodThemeById, getMoodLabel } from './moodUtils';

export type MoodSignalRange = 'this_week' | 'last_week' | 'month' | 'all_time';
export type MoodMixLevel = 'empty' | 'single' | 'blended' | 'highly_mixed';

export interface MoodSignalSegment {
    moodId: string;
    label: string;
    count: number;
    percentage: number;
    color: string;
    gradientFrom: string;
    gradientMid: string;
    gradientTo: string;
    latestAt: string;
}

export interface MoodSignalPaint {
    colors: [string, string, ...string[]];
    locations: [number, number, ...number[]];
}

export interface MoodSignalSummary {
    totalEntries: number;
    activeDays: number;
    moodVariety: number;
    dominantMood: string | null;
    runnerUpMood: string | null;
    mixScore: number;
    mixLabel: string;
    strongestDay: string | null;
    mostBlendedDay: string | null;
}

export interface MoodSignalRangeContext {
    startDate: string;
    endDate: string;
    displayLabel: string;
    cacheKey: string;
}

export interface MoodSignalData {
    range: MoodSignalRange;
    rangeContext: MoodSignalRangeContext;
    bars: DailyPatternData[];
    moodWeights: { mood: string; moodId: string; color: string; count: number; percentage: number }[];
    totalMoodsCount: number;
    hasEnoughData: boolean;
    summary: MoodSignalSummary;
}

export interface DailyPatternData {
    dayName: string; // Mon, Tue, etc.
    topMood: string | null;
    color: string;
    gradientColors: [string, string, ...string[]];
    gradientLocations: [number, number, ...number[]];
    segments: MoodSignalSegment[];
    mixLevel: MoodMixLevel;
    mixScore: number;
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

    // Filter captures for the selected range and respect the user's insight opt-out.
    const rangeCaptures = captures.filter(c => {
        const d = parseISO(c.created_at);
        return isWithinInterval(d, { start, end }) && c.includeInInsights !== false;
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
            const percentage = rangeCaptures.length > 0 ? (count / rangeCaptures.length) * 100 : 0;
            return {
                moodId,
                mood: label,
                color: resolveMoodThemeById(moodId, label).solid,
                count,
                percentage,
            };
        });

    const bars = buildBars(rangeCaptures);
    const hasEnoughData = rangeCaptures.length >= 3;
    const activeDateCount = new Set(rangeCaptures.map((capture) => format(parseISO(capture.created_at), 'yyyy-MM-dd'))).size;
    const summary = buildMoodSignalSummary({
        range,
        rangeContext: buildRangeContext(range, start, end),
        bars,
        moodWeights: sortedMoods,
        totalMoodsCount: sortedMoods.length,
        hasEnoughData,
        summary: {
            totalEntries: 0,
            activeDays: 0,
            moodVariety: 0,
            dominantMood: null,
            runnerUpMood: null,
            mixScore: 0,
            mixLabel: 'No signal yet',
            strongestDay: null,
            mostBlendedDay: null,
        },
    }, {
        totalEntries: rangeCaptures.length,
        activeDays: activeDateCount,
    });

    return {
        range,
        rangeContext: buildRangeContext(range, start, end),
        bars,
        moodWeights: sortedMoods,
        totalMoodsCount: sortedMoods.length,
        hasEnoughData,
        summary,
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

function buildRangeContext(
    range: MoodSignalRange,
    start: Date,
    end: Date
): MoodSignalRangeContext {
    const startDate = format(start, 'yyyy-MM-dd');
    const endDate = format(end, 'yyyy-MM-dd');

    if (range === 'all_time') {
        return {
            startDate,
            endDate,
            displayLabel: `All time through ${format(end, 'MMM d, yyyy')}`,
            cacheKey: range,
        };
    }

    return {
        startDate,
        endDate,
        displayLabel: `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`,
        cacheKey: `${range}:${startDate}:${endDate}`,
    };
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
        const segments = buildMoodSignalSegments(dayCaptures);
        const paint = buildMoodSignalPaint(segments.slice(0, 1));

        return {
            dayName,
            topMood: top?.label ?? null,
            color: top?.color ?? 'rgba(140,140,160,0.35)',
            gradientColors: paint.colors,
            gradientLocations: paint.locations,
            segments,
            mixLevel: getMixLevel(segments),
            mixScore: getMixScore(segments),
            dominance: top?.dominance ?? 0,
            totalCaptures: dayCaptures.length,
            topMoodCount: top?.count ?? 0,
        };
    });
}

export function buildMoodSignalSegments(bucket: Capture[]): MoodSignalSegment[] {
    if (bucket.length === 0) return [];

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

    const total = bucket.length;

    return Array.from(counts.entries())
        .map(([moodId, data]) => {
            const theme = resolveMoodThemeById(moodId, data.label);
            return {
                moodId,
                label: data.label,
                count: data.count,
                percentage: (data.count / total) * 100,
                color: theme.solid,
                gradientFrom: theme.gradient.primary,
                gradientMid: theme.gradient.mid,
                gradientTo: theme.gradient.secondary,
                latestAt: data.latestAt,
            };
        })
        .sort((a, b) => {
            if (b.count !== a.count) return b.count - a.count;
            if (b.latestAt !== a.latestAt) return b.latestAt.localeCompare(a.latestAt);
            return a.label.localeCompare(b.label);
        });
}

export function buildMoodSignalGradient(segments: MoodSignalSegment[]): [string, string, ...string[]] {
    return buildMoodSignalPaint(segments).colors;
}

export function buildMoodSignalPaint(segments: MoodSignalSegment[]): MoodSignalPaint {
    if (segments.length === 0) {
        return {
            colors: ['rgba(140,140,160,0.35)', 'rgba(90,90,110,0.22)'],
            locations: [0, 1],
        };
    }

    if (segments.length === 1) {
        const segment = segments[0];
        return {
            colors: [segment.gradientFrom, segment.gradientMid, segment.gradientTo],
            locations: [0, 0.5, 1],
        };
    }

    const gradient: string[] = [];
    const locations: number[] = [];
    let cursor = 0;

    segments.forEach((segment, index) => {
        const start = cursor;
        const end = index === segments.length - 1
            ? 1
            : Math.min(1, cursor + (segment.percentage / 100));
        const mid = start + ((end - start) / 2);

        gradient.push(segment.gradientFrom);
        locations.push(start);
        gradient.push(segment.gradientMid);
        locations.push(mid);
        gradient.push(segment.gradientTo);
        locations.push(end);

        cursor = end;
    });

    return {
        colors: gradient as [string, string, ...string[]],
        locations: locations as [number, number, ...number[]],
    };
}

export function buildMoodSignalSummary(
    signalData: MoodSignalData,
    actual?: { totalEntries: number; activeDays: number }
): MoodSignalSummary {
    const activeBars = signalData.bars.filter((bar) => bar.totalCaptures > 0);
    const totalEntries = actual?.totalEntries ?? activeBars.reduce((sum, bar) => sum + bar.totalCaptures, 0);
    const blendedBars = activeBars.filter((bar) => bar.segments.length > 1);
    const mixScore = activeBars.length > 0 ? blendedBars.length / activeBars.length : 0;

    const strongest = activeBars
        .slice()
        .sort((a, b) => {
            if (b.dominance !== a.dominance) return b.dominance - a.dominance;
            return b.totalCaptures - a.totalCaptures;
        })[0];

    const mostBlended = activeBars
        .slice()
        .sort((a, b) => {
            if (b.mixScore !== a.mixScore) return b.mixScore - a.mixScore;
            return b.totalCaptures - a.totalCaptures;
        })[0];

    return {
        totalEntries,
        activeDays: actual?.activeDays ?? activeBars.length,
        moodVariety: signalData.totalMoodsCount,
        dominantMood: signalData.moodWeights[0]?.mood ?? null,
        runnerUpMood: signalData.moodWeights[1]?.mood ?? null,
        mixScore,
        mixLabel: describeMixScore(mixScore, activeBars.length),
        strongestDay: strongest?.dayName ?? null,
        mostBlendedDay: mostBlended && mostBlended.mixScore > 0 ? mostBlended.dayName : null,
    };
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
        color: resolveMoodThemeById(moodId, data.label).solid,
        count: data.count,
        dominance: data.count / bucket.length,
    };
}

function getMixScore(segments: MoodSignalSegment[]): number {
    if (segments.length <= 1) return 0;
    const dominance = segments[0].percentage / 100;
    return Math.max(0, Math.min(1, 1 - dominance));
}

function getMixLevel(segments: MoodSignalSegment[]): MoodMixLevel {
    if (segments.length === 0) return 'empty';
    if (segments.length === 1) return 'single';
    return getMixScore(segments) >= 0.5 || segments.length >= 3 ? 'highly_mixed' : 'blended';
}

function describeMixScore(score: number, activeDays: number): string {
    if (activeDays === 0) return 'No signal yet';
    if (score === 0) return 'Focused';
    if (score < 0.35) return 'Mostly focused';
    if (score < 0.65) return 'Blended';
    return 'Highly mixed';
}

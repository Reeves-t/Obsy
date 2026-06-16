import {
    buildMoodSignalGradient,
    buildMoodSignalPaint,
    buildMoodSignalSegments,
    getMoodSignal,
} from '@/lib/moodSignals';
import { buildMoodSignalInterpretationKey } from '@/lib/moodSignalInterpretationStore';
import {
    buildMoodConnectionInterpretationData,
    buildMoodConnectionModel,
} from '@/lib/moodConnections';
import { getWeekdayMoodShape } from '@/lib/weekdayMoodShape';
import type { Capture } from '@/types/capture';

jest.mock('@react-native-async-storage/async-storage', () => ({
    getItem: jest.fn(),
    setItem: jest.fn(),
}));

jest.mock('@/lib/moodCache', () => ({
    moodCache: {
        getMoodById: jest.fn(() => null),
    },
}));

function capture(
    id: string,
    createdAt: string,
    moodId: string,
    moodName: string,
    includeInInsights = true
): Capture {
    return {
        id,
        user_id: 'user-1',
        created_at: createdAt,
        mood_id: moodId,
        mood_name_snapshot: moodName,
        note: null,
        image_url: '',
        tags: [],
        includeInInsights,
        usePhotoForInsight: true,
    };
}

describe('mood signal analytics', () => {
    it('returns an empty signal for an empty range', () => {
        const signal = getMoodSignal([], 'all_time');

        expect(signal.hasEnoughData).toBe(false);
        expect(signal.summary.totalEntries).toBe(0);
        expect(signal.summary.activeDays).toBe(0);
        expect(signal.bars).toHaveLength(7);
        expect(signal.bars.every((bar) => bar.segments.length === 0)).toBe(true);
    });

    it('builds a single-mood day with that mood gradient', () => {
        const segments = buildMoodSignalSegments([
            capture('1', '2026-06-08T10:00:00.000Z', 'calm', 'Calm'),
            capture('2', '2026-06-08T12:00:00.000Z', 'calm', 'Calm'),
        ]);
        const gradient = buildMoodSignalGradient(segments);

        expect(segments).toHaveLength(1);
        expect(segments[0].label).toBe('Calm');
        expect(segments[0].percentage).toBe(100);
        expect(gradient).toEqual([
            segments[0].gradientFrom,
            segments[0].gradientMid,
            segments[0].gradientTo,
        ]);
    });

    it('builds multi-mood segments and blended gradients', () => {
        const segments = buildMoodSignalSegments([
            capture('1', '2026-06-08T10:00:00.000Z', 'calm', 'Calm'),
            capture('2', '2026-06-08T12:00:00.000Z', 'focused', 'Focused'),
            capture('3', '2026-06-08T13:00:00.000Z', 'joyful', 'Joyful'),
        ]);
        const gradient = buildMoodSignalGradient(segments);

        expect(segments).toHaveLength(3);
        segments.forEach((segment) => {
            expect(segment.percentage).toBeCloseTo(100 / 3);
        });
        expect(gradient.length).toBeGreaterThan(segments.length);
    });

    it('builds percentage-aware gradient locations', () => {
        const segments = buildMoodSignalSegments([
            capture('1', '2026-06-08T10:00:00.000Z', 'calm', 'Calm'),
            capture('2', '2026-06-08T12:00:00.000Z', 'calm', 'Calm'),
            capture('3', '2026-06-08T13:00:00.000Z', 'focused', 'Focused'),
        ]);
        const paint = buildMoodSignalPaint(segments);

        expect(paint.locations[0]).toBe(0);
        expect(paint.locations[paint.locations.length - 1]).toBe(1);
        expect(paint.locations.some((location) => Math.abs(location - (2 / 3)) < 0.0001)).toBe(true);
    });

    it('paints mood signal bars with only the top mood for the day', () => {
        const signal = getMoodSignal([
            capture('1', '2026-06-08T10:00:00.000Z', 'calm', 'Calm'),
            capture('2', '2026-06-08T12:00:00.000Z', 'calm', 'Calm'),
            capture('3', '2026-06-08T13:00:00.000Z', 'focused', 'Focused'),
        ], 'all_time');

        const monday = signal.bars.find((bar) => bar.dayName === 'Mon');
        const topSegment = monday?.segments[0];

        expect(monday?.topMood).toBe('Calm');
        expect(monday?.gradientColors).toEqual([
            topSegment?.gradientFrom,
            topSegment?.gradientMid,
            topSegment?.gradientTo,
        ]);
        expect(monday?.gradientLocations).toEqual([0, 0.5, 1]);
    });

    it('breaks top-mood ties by recency', () => {
        const signal = getMoodSignal([
            capture('1', '2026-06-08T10:00:00.000Z', 'calm', 'Calm'),
            capture('2', '2026-06-08T12:00:00.000Z', 'focused', 'Focused'),
            capture('3', '2026-06-09T10:00:00.000Z', 'joyful', 'Joyful'),
        ], 'all_time');

        const monday = signal.bars.find((bar) => bar.dayName === 'Mon');
        expect(monday?.topMood).toBe('Focused');
    });

    it('excludes entries opted out of insights', () => {
        const signal = getMoodSignal([
            capture('1', '2026-06-08T10:00:00.000Z', 'calm', 'Calm'),
            capture('2', '2026-06-08T12:00:00.000Z', 'focused', 'Focused', false),
            capture('3', '2026-06-09T10:00:00.000Z', 'calm', 'Calm'),
        ], 'all_time');

        expect(signal.summary.totalEntries).toBe(2);
        expect(signal.moodWeights).toHaveLength(1);
        expect(signal.moodWeights[0].mood).toBe('Calm');
    });

    it('uses custom mood snapshots for labels', () => {
        const segments = buildMoodSignalSegments([
            capture('1', '2026-06-08T10:00:00.000Z', 'custom_123', 'Custom Focus'),
        ]);

        expect(segments[0].label).toBe('Custom Focus');
        expect(segments[0].color).toMatch(/^#/);
    });

    it('builds all-time weekday mood shape and excludes opted-out entries', () => {
        const shape = getWeekdayMoodShape([
            capture('1', '2026-04-06T10:00:00.000Z', 'calm', 'Calm'),
            capture('2', '2026-04-13T10:00:00.000Z', 'focused', 'Focused'),
            capture('3', '2026-05-04T10:00:00.000Z', 'calm', 'Calm'),
            capture('4', '2026-05-11T10:00:00.000Z', 'joyful', 'Joyful', false),
            capture('5', '2026-05-12T10:00:00.000Z', 'angry', 'Angry'),
        ], 'mon');

        expect(shape.weekdayLabel).toBe('Mon');
        expect(shape.summary.totalEntries).toBe(3);
        expect(shape.summary.activeDays).toBe(3);
        expect(shape.layers.map((layer) => layer.label)).toEqual(['Calm', 'Focused']);
        expect(shape.buckets.length).toBeGreaterThanOrEqual(2);
    });

    it('builds stable interpretation cache keys by user and signal scope', () => {
        expect(buildMoodSignalInterpretationKey('user-1', 'weekly_signal', 'this_week:2026-06-08:2026-06-14'))
            .toBe('obsy:mood-signal-interpretation:v1:user-1:weekly_signal:this_week:2026-06-08:2026-06-14');
        expect(buildMoodSignalInterpretationKey('user-1', 'weekday_shape', 'mon:all_time'))
            .toBe('obsy:mood-signal-interpretation:v1:user-1:weekday_shape:mon:all_time');
    });

    it('builds aggregate mood connection data for a selected mood', () => {
        const model = buildMoodConnectionModel([
            capture('1', '2026-06-08T10:00:00.000Z', 'calm', 'Calm'),
            capture('2', '2026-06-08T11:00:00.000Z', 'focused', 'Focused'),
            capture('3', '2026-06-08T12:00:00.000Z', 'calm', 'Calm'),
            capture('4', '2026-06-08T13:00:00.000Z', 'joyful', 'Joyful'),
            capture('5', '2026-06-08T14:00:00.000Z', 'calm', 'Calm', false),
        ]);
        const data = buildMoodConnectionInterpretationData(model, 'calm');

        expect(data?.summary.totalEntries).toBe(4);
        expect(data?.before.map((item) => item.label)).toEqual(['Focused']);
        expect(data?.after.map((item) => item.label)).toEqual(['Focused', 'Joyful']);
        expect(data?.hasEnoughData).toBe(true);
    });
});

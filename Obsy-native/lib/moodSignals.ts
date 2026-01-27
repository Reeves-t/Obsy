import { Capture } from '@/types/capture';
import { getWeekRangeForUser } from './dateUtils';
import { isWithinInterval, parseISO, format } from 'date-fns';
import { resolveMoodColorById, getMoodLabel } from './moodUtils';

export type PatternType = 'time-linked' | 'day-clustering' | 'mood-drift' | 'none';

export interface MoodSignalData {
    pattern: PatternType;
    insight: string;
    weeklyData: DailyPatternData[];
    moodWeights: { mood: string; color: string; count: number }[];
    totalMoodsCount: number;
    hasEnoughData: boolean;
}

export interface DailyPatternData {
    dayName: string; // Mon, Tue, etc.
    dots: MoodDot[];
    isHighlighted: boolean;
}

export interface MoodDot {
    timePercent: number; // 0 to 1 representing time of day (00:00 to 23:59)
    intensity: number; // 0 to 1 based on mood or capture frequency
    color: string;
    mood: string;
}

/**
 * Processes captures for the current week into Mood Signal data.
 */
export function getWeeklyMoodSignal(captures: Capture[]): MoodSignalData {
    const now = new Date();
    const { start, end } = getWeekRangeForUser(now);

    // Filter captures for the current week
    const weeklyCaptures = captures.filter(c => {
        const d = parseISO(c.created_at);
        return isWithinInterval(d, { start, end });
    });

    const hasEnoughData = weeklyCaptures.length >= 3;

    // Mood Weights for the color key using mood_id
    const moodCounts: Record<string, number> = {};
    const moodSnapshots: Record<string, string> = {};

    weeklyCaptures.forEach(c => {
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

    if (!hasEnoughData) {
        return {
            pattern: 'none',
            insight: "New weekly signal begins Sunday. Insights appear as data builds.",
            weeklyData: generateEmptyWeeklyData(start),
            moodWeights: sortedMoods,
            totalMoodsCount: sortedMoods.length,
            hasEnoughData: false
        };
    }

    // Group captures by day
    const days: DailyPatternData[] = [];
    const dayMap: Record<number, Capture[]> = {};

    for (let i = 0; i < 7; i++) {
        const current = new Date(start);
        current.setDate(start.getDate() + i);
        const dayIdx = i; // 0 = Mon, ..., 6 = Sun

        const dayCaptures = weeklyCaptures.filter(c => {
            const d = parseISO(c.created_at);
            return d.getDate() === current.getDate() && d.getMonth() === current.getMonth();
        });

        dayMap[dayIdx] = dayCaptures;

        days.push({
            dayName: format(current, 'EEE'),
            dots: dayCaptures.map(c => {
                const d = parseISO(c.created_at);
                const minutes = d.getHours() * 60 + d.getMinutes();
                const moodId = c.mood_id || 'neutral';
                // Validate snapshot: if it looks like a raw ID (e.g., "custom_abc123"), resolve it
                const snapshot = c.mood_name_snapshot;
                const isValidSnapshot = snapshot && !snapshot.startsWith('custom_') && snapshot !== moodId;
                const label = isValidSnapshot ? snapshot : getMoodLabel(moodId, snapshot);
                return {
                    timePercent: minutes / (24 * 60),
                    intensity: 0.6 + (Math.random() * 0.4),
                    color: resolveMoodColorById(moodId, label),
                    mood: label
                };
            }),
            isHighlighted: false
        });
    }

    // Pattern Detection Logic
    let pattern: PatternType = 'none';
    let insight = "";

    const driftDetected = detectMoodDrift(dayMap);
    const clusterDetected = detectDayClustering(dayMap);
    const timeLinkDetected = detectTimeLink(weeklyCaptures);

    // Rotation logic
    if (timeLinkDetected) {
        pattern = 'time-linked';
    } else if (clusterDetected) {
        pattern = 'day-clustering';
        const peakDayIdx = findPeakDay(dayMap);
        if (peakDayIdx !== -1) days[peakDayIdx].isHighlighted = true;
    } else if (driftDetected) {
        pattern = 'mood-drift';
    } else {
        pattern = 'none';
    }

    insight = getTinyInsight(pattern, weeklyCaptures);

    return {
        pattern,
        insight,
        weeklyData: days,
        moodWeights: sortedMoods,
        totalMoodsCount: sortedMoods.length,
        hasEnoughData: true
    };
}

function generateEmptyWeeklyData(start: Date): DailyPatternData[] {
    const days: DailyPatternData[] = [];
    for (let i = 0; i < 7; i++) {
        const current = new Date(start);
        current.setDate(start.getDate() + i);
        days.push({
            dayName: format(current, 'EEE'),
            dots: [],
            isHighlighted: false
        });
    }
    return days;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern Detection Helpers
// ─────────────────────────────────────────────────────────────────────────────

function detectMoodDrift(dayMap: Record<number, Capture[]>): boolean {
    const activeDays = Object.values(dayMap).filter(caps => caps.length > 0).length;
    return activeDays >= 4;
}

function detectDayClustering(dayMap: Record<number, Capture[]>): boolean {
    const counts = Object.values(dayMap).map(c => c.length);
    const max = Math.max(...counts);
    const avg = counts.reduce((a, b) => a + b, 0) / 7;
    return max > avg * 1.8 && max >= 3;
}

function findPeakDay(dayMap: Record<number, Capture[]>): number {
    let max = -1;
    let peakIdx = -1;
    Object.entries(dayMap).forEach(([idx, caps]) => {
        if (caps.length > max) {
            max = caps.length;
            peakIdx = parseInt(idx);
        }
    });
    return peakIdx;
}

function detectTimeLink(captures: Capture[]): boolean {
    if (captures.length < 5) return false;
    const hours = captures.map(c => parseISO(c.created_at).getHours());
    const hourCounts: Record<number, number> = {};
    hours.forEach(h => { hourCounts[h] = (hourCounts[h] || 0) + 1; });

    return Object.values(hourCounts).some(count => count >= captures.length * 0.4);
}

// ─────────────────────────────────────────────────────────────────────────────
// Insight Generation
// ─────────────────────────────────────────────────────────────────────────────

function getTinyInsight(pattern: PatternType, captures: Capture[]): string {
    const moodCounts: Record<string, number> = {};
    const moodSnapshots: Record<string, string> = {};
    captures.forEach(c => {
        const moodId = c.mood_id || 'neutral';
        moodCounts[moodId] = (moodCounts[moodId] || 0) + 1;
        if (c.mood_name_snapshot) moodSnapshots[moodId] = c.mood_name_snapshot;
    });

    const sortedMoods = Object.entries(moodCounts).sort((a, b) => b[1] - a[1]);
    const topMoodId = sortedMoods[0]?.[0] || 'neutral';
    const topMood = moodSnapshots[topMoodId] || getMoodLabel(topMoodId);

    const insights: Record<PatternType, string[]> = {
        'time-linked': [
            `Rhythmic ${topMood} states appeared at similar times this week.`,
            `A consistent timing of ${topMood} captures is emerging in your routine.`,
            `Daily ${topMood} patterns showed a distinct temporal rhythm.`,
            `Emotional capture timing centered around ${topMood} states.`
        ],
        'day-clustering': [
            `Certain days showed repeated ${topMood} behavior and frequency.`,
            `Emotional activity clustered around ${topMood} notes on active days.`,
            `Frequency of captures peaked with ${topMood} signals on specific days.`,
            `${topMood} moments appeared concentrated within specific windows.`
        ],
        'mood-drift': [
            `Signals showed a gradual drift toward ${topMood} states this week.`,
            `The weekly slope moved gently through deeper ${topMood} patterns.`,
            `Inner signals transitioned toward ${topMood} across the week.`,
            `A soft progression in emotional states favored ${topMood} vibes.`
        ],
        'none': [
            `Signals remained ambient with ${topMood} as a recurring note.`,
            `Weekly distribution was balanced, with ${topMood} appearing clearly.`,
            `Mood variations were broad, often returning to ${topMood} states.`,
            `No dominant time pattern, though ${topMood} remained present.`
        ]
    };

    const pool = insights[pattern];
    // Use a more dynamic seed incorporating minutes to allow more variety within the day if data changes
    const now = new Date();
    const { start } = getWeekRangeForUser(now);
    const seed = start.getDate() + pattern.length + now.getDate() + now.getHours() + Math.floor(now.getMinutes() / 15);
    return pool[seed % pool.length];
}

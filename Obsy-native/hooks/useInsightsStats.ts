import { useMemo } from "react";
import { useCaptureStore } from "@/lib/captureStore";
import { getLocalDayKey } from "@/lib/utils";
import { getMoodLabel } from "@/lib/moodUtils";

type TimeOfDayMood = {
    dominant: string | null;
    count: number;
    totalCaptures: number;
};

type StatsResult = {
    streak: number;
    bestStreak: number;
    activeHours: number[];
    peakTimeLabel: string;
    totalEntries: number;
    mostCapturesDay: { count: number; date: string };
    avgCapturesPerDay: number;
    morningMood: TimeOfDayMood;
    afternoonMood: TimeOfDayMood;
    eveningMood: TimeOfDayMood;
};

const BUCKET_LABELS: Record<"morning" | "afternoon" | "evening", string> = {
    morning: "MORNING",
    afternoon: "AFTERNOON",
    evening: "EVENING",
};

export function useInsightsStats(userId?: string): StatsResult {
    const { captures } = useCaptureStore();

    return useMemo(() => {
        const filtered = captures.filter((c) => !userId || c.user_id === userId);
        const totalEntries = filtered.length;

        const daySet = new Set(filtered.map((c) => c.created_at.split("T")[0]));
        const dayCounts: Record<string, number> = {};
        filtered.forEach((c) => {
            const dayKey = c.created_at.split("T")[0];
            dayCounts[dayKey] = (dayCounts[dayKey] || 0) + 1;
        });

        const sortedDays = Array.from(daySet).sort().reverse(); // Newest first

        let streak = 0;
        let bestStreak = 0;
        const todayKey = getLocalDayKey(new Date());
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayKey = getLocalDayKey(yesterday);

        // Current Streak
        const streakStart = daySet.has(todayKey) ? new Date() : daySet.has(yesterdayKey) ? yesterday : null;

        if (streakStart) {
            let cursor = new Date(streakStart);
            while (true) {
                const key = getLocalDayKey(cursor);
                if (daySet.has(key)) {
                    streak += 1;
                    cursor.setDate(cursor.getDate() - 1);
                } else {
                    break;
                }
            }
        }

        // Best Streak (Global)
        if (daySet.size > 0) {
            let currentBest = 0;
            const chronologicalDays = Array.from(daySet).sort();
            if (chronologicalDays.length > 0) {
                let tempStreak = 1;
                for (let i = 1; i < chronologicalDays.length; i++) {
                    const prev = new Date(chronologicalDays[i - 1]);
                    const curr = new Date(chronologicalDays[i]);
                    const nextDay = new Date(prev);
                    nextDay.setDate(nextDay.getDate() + 1);
                    const nextDayKey = getLocalDayKey(nextDay);
                    const currDayKey = getLocalDayKey(curr);

                    if (nextDayKey === currDayKey) {
                        tempStreak += 1;
                    } else {
                        bestStreak = Math.max(bestStreak, tempStreak);
                        tempStreak = 1;
                    }
                }
                bestStreak = Math.max(bestStreak, tempStreak);
            }
        }

        // Most Captures in a Single Day
        let mostCapturesDay = { count: 0, date: '' };
        Object.entries(dayCounts).forEach(([day, count]) => {
            if (count > mostCapturesDay.count) {
                mostCapturesDay = { count, date: day };
            }
        });

        // Average Captures per Day
        const uniqueDays = Object.keys(dayCounts).length;
        const avgCapturesPerDay = uniqueDays > 0 ? Math.round((totalEntries / uniqueDays) * 10) / 10 : 0;

        const hourCounts: Record<number, number> = {};
        filtered.forEach((c) => {
            const hour = new Date(c.created_at).getHours();
            hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        });
        const activeHours = Object.keys(hourCounts).map((h) => Number(h));

        // 3 buckets for peak time detection
        const buckets = { morning: 0, afternoon: 0, evening: 0 };
        activeHours.forEach((hour) => {
            if (hour >= 5 && hour < 12) {
                buckets.morning += hourCounts[hour];
            } else if (hour >= 12 && hour < 18) {
                buckets.afternoon += hourCounts[hour];
            } else {
                // Evening: 6pm-4:59am (hour >= 18 OR hour < 5)
                buckets.evening += hourCounts[hour];
            }
        });

        const peak = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0]?.[0] as keyof typeof buckets | undefined;
        const peakTimeLabel = peak ? BUCKET_LABELS[peak] : "EVENING";

        // Time-of-day mood calculation
        // Morning: 5am-11:59am, Afternoon: 12pm-5:59pm, Evening: 6pm-4:59am
        const moodByTime: Record<"morning" | "afternoon" | "evening", Record<string, number>> = {
            morning: {},
            afternoon: {},
            evening: {},
        };

        filtered.forEach((c) => {
            if (!c.mood_id) return;
            // Validate snapshot: if it looks like a raw ID (e.g., "custom_abc123"), resolve it
            const snapshot = c.mood_name_snapshot;
            const isValidSnapshot = snapshot && !snapshot.startsWith('custom_') && snapshot !== c.mood_id;
            const moodLabel = isValidSnapshot ? snapshot : getMoodLabel(c.mood_id, snapshot);
            const hour = new Date(c.created_at).getHours();
            let bucket: "morning" | "afternoon" | "evening";
            if (hour >= 5 && hour < 12) {
                bucket = "morning";
            } else if (hour >= 12 && hour < 18) {
                bucket = "afternoon";
            } else {
                bucket = "evening";
            }
            moodByTime[bucket][moodLabel] = (moodByTime[bucket][moodLabel] || 0) + 1;
        });

        const getTimeOfDayMood = (bucket: "morning" | "afternoon" | "evening"): TimeOfDayMood => {
            const moods = moodByTime[bucket];
            const entries = Object.entries(moods);
            if (entries.length === 0) {
                return { dominant: null, count: 0, totalCaptures: 0 };
            }
            const sorted = entries.sort((a, b) => b[1] - a[1]);
            const [topMoodLabel, topCount] = sorted[0];
            const totalCaptures = entries.reduce((sum, [, cnt]) => sum + cnt, 0);

            // topMoodLabel is already the resolved mood name from mood_name_snapshot or getMoodLabel
            return {
                dominant: topMoodLabel,
                count: topCount,
                totalCaptures,
            };
        };

        const morningMood = getTimeOfDayMood("morning");
        const afternoonMood = getTimeOfDayMood("afternoon");
        const eveningMood = getTimeOfDayMood("evening");

        return { streak, bestStreak, activeHours, peakTimeLabel, totalEntries, mostCapturesDay, avgCapturesPerDay, morningMood, afternoonMood, eveningMood };
    }, [captures, userId]);
}

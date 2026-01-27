import { create } from 'zustand';
import { DailyInsight } from '@/services/dailyInsights';
import { ensureDailyInsight } from '@/lib/insightsEngine';
import { Capture } from '@/types/capture';
import { AiSettings } from '@/services/ai';
import { getLocalDayKey } from '@/lib/utils';
import { PendingInsights, computePendingInsights, createSnapshotFromHistory, InsightSnapshot } from '@/lib/pendingInsights';

interface TodayInsightState {
    todayInsight: DailyInsight | null;
    isRefreshing: boolean;
    dateKey: string | null; // YYYY-MM-DD
    hasGeneratedToday: boolean; // Tracks if we've auto-generated today
    pendingInsights: PendingInsights;

    // Actions
    setTodayInsight: (insight: DailyInsight | null) => void;
    refreshTodayInsight: (
        userId: string,
        settings: AiSettings,
        captures: Capture[],
        force?: boolean
    ) => Promise<void>;
    checkMidnightReset: () => void;
    computePending: (captures: Capture[]) => void;
}

const INITIAL_PENDING: PendingInsights = {
    daily: { pendingCount: 0, totalEligible: 0 },
    weekly: { pendingCount: 0, totalEligible: 0 },
    monthly: { pendingCount: 0, totalEligible: 0 },
};

export const useTodayInsight = create<TodayInsightState>((set, get) => ({
    todayInsight: null,
    isRefreshing: false,
    dateKey: null,
    hasGeneratedToday: false,
    pendingInsights: INITIAL_PENDING,

    setTodayInsight: (insight) => {
        set({
            todayInsight: insight,
            dateKey: insight ? getLocalDayKey(new Date(insight.date)) : getLocalDayKey(new Date()),
        });
        get().computePending([]); // Trigger recompute with existing captures in store via useCaptureStore if needed, or caller passes them
    },

    refreshTodayInsight: async (userId, settings, captures, force = false) => {
        if (get().isRefreshing) return;

        set({ isRefreshing: true });
        try {
            const insight = await ensureDailyInsight(
                userId,
                settings,
                new Date(),
                captures,
                force
            );

            const updates: Partial<TodayInsightState> = {
                todayInsight: insight || get().todayInsight, // Keep old one if new fails/returns null
                isRefreshing: false,
            };

            if (insight) {
                updates.dateKey = getLocalDayKey(new Date(insight.date));
                updates.hasGeneratedToday = true;
            }

            set(updates);
            get().computePending(captures);
        } catch (error) {
            console.error("[useTodayInsight] Refresh failed:", error);
            set({ isRefreshing: false });
            throw error;
        }
    },

    checkMidnightReset: () => {
        const today = getLocalDayKey(new Date());
        const { dateKey } = get();

        if (dateKey && dateKey !== today) {
            console.log("[useTodayInsight] Midnight reset triggered");
            set({
                todayInsight: null,
                dateKey: today,
                hasGeneratedToday: false,
                pendingInsights: INITIAL_PENDING,
            });
        }
    },

    computePending: (captures: Capture[]) => {
        const { todayInsight } = get();
        if (!captures.length) return;

        const snapshots: Partial<Record<string, InsightSnapshot>> = {};
        if (todayInsight) {
            snapshots.daily = {
                kind: 'daily',
                generatedAt: new Date(todayInsight.created_at).getTime(),
                periodStart: startOfDay(new Date(todayInsight.date)).getTime(),
                periodEnd: endOfDay(new Date(todayInsight.date)).getTime(),
                includedCaptureIds: todayInsight.capture_ids || []
            };
        }

        const pending = computePendingInsights(captures, snapshots as any);
        set({ pendingInsights: pending });
    }
}));

function startOfDay(date: Date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

function endOfDay(date: Date) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
}


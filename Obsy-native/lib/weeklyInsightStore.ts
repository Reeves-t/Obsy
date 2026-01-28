import { create } from 'zustand';
import { Capture } from '@/types/capture';
import { AiSettings } from '@/services/secureAI';
import { InsightHistory, fetchInsightHistory } from '@/services/insightHistory';
import { ensureWeeklyInsight } from '@/lib/longTermInsights';
import { startOfWeek } from 'date-fns';
import { PendingInsightInfo, computePendingInsights, createSnapshotFromHistory } from '@/lib/pendingInsights';
import { WeeklyStats } from '@/lib/insightsAnalytics';

interface WeeklyInsightState {
    weeklyInsight: InsightHistory | null;
    weeklyStats: WeeklyStats | null;
    isGenerating: boolean;
    pendingInfo: PendingInsightInfo;

    // Actions
    setWeeklyStats: (stats: WeeklyStats | null) => void;
    loadSnapshot: (userId: string) => Promise<void>;
    refreshWeeklyInsight: (
        userId: string,
        settings: AiSettings,
        captures: Capture[],
        force?: boolean
    ) => Promise<void>;
    computePending: (captures: Capture[]) => void;
}

export const useWeeklyInsight = create<WeeklyInsightState>((set, get) => ({
    weeklyInsight: null,
    weeklyStats: null,
    isGenerating: false,
    pendingInfo: { pendingCount: 0, totalEligible: 0 },

    setWeeklyStats: (stats) => set({ weeklyStats: stats }),

    loadSnapshot: async (userId: string) => {
        const now = new Date();
        const weekStart = startOfWeek(now, { weekStartsOn: 1 });
        const snapshot = await fetchInsightHistory(userId, 'weekly', weekStart, now);

        if (snapshot) {
            set({ weeklyInsight: snapshot });
            // Initial pending compute will happen when captures are loaded or passed
        }
    },

    refreshWeeklyInsight: async (userId, settings, captures, force = false) => {
        if (get().isGenerating) return;

        set({ isGenerating: true });
        try {
            const insight = await ensureWeeklyInsight(
                userId,
                settings,
                captures,
                new Date(),
                force
            );

            if (insight) {
                set({ weeklyInsight: insight });
            }
            get().computePending(captures);
        } catch (error) {
            console.error("[WeeklyInsightStore] Refresh failed:", error);
        } finally {
            set({ isGenerating: false });
        }
    },

    computePending: (captures: Capture[]) => {
        const { weeklyInsight } = get();
        if (!captures.length) return;

        const snapshot = createSnapshotFromHistory(weeklyInsight, 'weekly');
        const snapshots = snapshot ? { weekly: snapshot } : {};

        const pending = computePendingInsights(captures, snapshots);
        set({ pendingInfo: pending.weekly });
    }
}));

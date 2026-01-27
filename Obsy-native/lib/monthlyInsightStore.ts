import { create } from 'zustand';
import { Capture } from '@/types/capture';
import { AiSettings } from '@/services/ai';
import { InsightHistory, fetchInsightHistory } from '@/services/insightHistory';
import { ensureMonthlyInsight } from '@/lib/longTermInsights';
import { startOfMonth } from 'date-fns';
import { PendingInsightInfo, computePendingInsights, createSnapshotFromHistory } from '@/lib/pendingInsights';

interface MonthlyInsightState {
    monthlyInsight: InsightHistory | null;
    isGenerating: boolean;
    pendingInfo: PendingInsightInfo;
    currentMonth: Date;

    // Actions
    setCurrentMonth: (month: Date) => void;
    loadSnapshot: (userId: string, month: Date) => Promise<void>;
    refreshMonthlyInsight: (
        userId: string,
        settings: AiSettings,
        captures: Capture[],
        targetMonth: Date,
        force?: boolean
    ) => Promise<void>;
    computePending: (captures: Capture[]) => void;
}

export const useMonthlyInsight = create<MonthlyInsightState>((set, get) => ({
    monthlyInsight: null,
    isGenerating: false,
    pendingInfo: { pendingCount: 0, totalEligible: 0 },
    currentMonth: new Date(),

    setCurrentMonth: (month: Date) => {
        set({ currentMonth: month });
    },

    loadSnapshot: async (userId: string, month: Date) => {
        const monthStart = startOfMonth(month);
        const snapshot = await fetchInsightHistory(userId, 'monthly', monthStart, monthStart);

        if (snapshot) {
            set({ monthlyInsight: snapshot });
        } else {
            set({ monthlyInsight: null });
        }
    },

    refreshMonthlyInsight: async (userId, settings, captures, targetMonth, force = false) => {
        if (get().isGenerating) return;

        set({ isGenerating: true });
        try {
            const insight = await ensureMonthlyInsight(
                userId,
                settings,
                captures,
                targetMonth,
                force
            );

            if (insight) {
                set({ monthlyInsight: insight });
            }
            get().computePending(captures);
        } catch (error) {
            console.error("[MonthlyInsightStore] Refresh failed:", error);
        } finally {
            set({ isGenerating: false });
        }
    },

    computePending: (captures: Capture[]) => {
        const { monthlyInsight } = get();
        if (!captures.length) return;

        const snapshot = createSnapshotFromHistory(monthlyInsight, 'monthly');
        const snapshots = snapshot ? { monthly: snapshot } : {};

        const pending = computePendingInsights(captures, snapshots);
        set({ pendingInfo: pending.monthly });
    }
}));

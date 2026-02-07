import { create } from 'zustand';
import { DailyInsight } from '@/services/dailyInsights';
import { ensureDailyInsight } from '@/lib/insightsEngine';
import { Capture } from '@/types/capture';
import { AiSettings } from '@/services/ai';
import { getLocalDayKey } from '@/lib/utils';
import { PendingInsights, computePendingInsights, createSnapshotFromHistory, InsightSnapshot } from '@/lib/pendingInsights';
import { fetchInsightHistory, fetchMostRecentDailyInsight } from '@/services/insightHistory';

interface TodayInsightState {
    todayInsight: DailyInsight | null;
    isRefreshing: boolean;
    dateKey: string | null; // YYYY-MM-DD
    hasGeneratedToday: boolean; // Tracks if we've auto-generated today
    pendingInsights: PendingInsights;
    hasLoadedSnapshot: boolean; // Tracks if initial snapshot load has been attempted

    // Actions
    setTodayInsight: (insight: DailyInsight | null) => void;
    loadSnapshot: (userId: string) => Promise<void>;
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
    hasLoadedSnapshot: false,

    setTodayInsight: (insight) => {
        set({
            todayInsight: insight,
            dateKey: insight ? getLocalDayKey(new Date(insight.date)) : getLocalDayKey(new Date()),
        });
        get().computePending([]); // Trigger recompute with existing captures in store via useCaptureStore if needed, or caller passes them
    },

    loadSnapshot: async (userId: string) => {
        // Skip if already loaded or currently refreshing
        if (get().hasLoadedSnapshot || get().todayInsight) return;

        try {
            const today = getLocalDayKey(new Date());

            // First try to load today's insight
            const todaySnapshot = await fetchInsightHistory(userId, 'daily', new Date(), new Date());

            if (todaySnapshot) {
                set({
                    todayInsight: {
                        id: todaySnapshot.id,
                        user_id: todaySnapshot.user_id,
                        date: todaySnapshot.start_date,
                        summary_text: todaySnapshot.content,
                        sentences: todaySnapshot.mood_summary?.sentences || [],
                        meta: todaySnapshot.mood_summary?.meta,
                        created_at: todaySnapshot.created_at,
                        updated_at: todaySnapshot.updated_at,
                        vibe_tags: todaySnapshot.mood_summary?.vibe_tags || [],
                        mood_colors: todaySnapshot.mood_summary?.mood_colors || [],
                        mood_flow: todaySnapshot.mood_summary?.mood_flow || null,
                        capture_ids: todaySnapshot.capture_ids || []
                    },
                    dateKey: today,
                    hasLoadedSnapshot: true,
                    hasGeneratedToday: true,
                });
                return;
            }

            // If no today insight, load the most recent one as a preload
            const recentSnapshot = await fetchMostRecentDailyInsight(userId);

            if (recentSnapshot) {
                set({
                    todayInsight: {
                        id: recentSnapshot.id,
                        user_id: recentSnapshot.user_id,
                        date: recentSnapshot.start_date,
                        summary_text: recentSnapshot.content,
                        sentences: recentSnapshot.mood_summary?.sentences || [],
                        meta: recentSnapshot.mood_summary?.meta,
                        created_at: recentSnapshot.created_at,
                        updated_at: recentSnapshot.updated_at,
                        vibe_tags: recentSnapshot.mood_summary?.vibe_tags || [],
                        mood_colors: recentSnapshot.mood_summary?.mood_colors || [],
                        mood_flow: recentSnapshot.mood_summary?.mood_flow || null,
                        capture_ids: recentSnapshot.capture_ids || []
                    },
                    dateKey: recentSnapshot.start_date,
                    hasLoadedSnapshot: true,
                    hasGeneratedToday: false, // Not today's insight, so auto-gen can still trigger
                });
            } else {
                set({ hasLoadedSnapshot: true });
            }
        } catch (error) {
            console.error("[useTodayInsight] loadSnapshot failed:", error);
            set({ hasLoadedSnapshot: true });
        }
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
                hasLoadedSnapshot: false, // Allow re-loading snapshot for new day
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

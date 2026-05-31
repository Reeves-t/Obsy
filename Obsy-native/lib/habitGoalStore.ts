import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { startOfWeek, format } from 'date-fns';
import { WEEK_STARTS_ON } from './dateUtils';
import { fetchHabitGoals, upsertHabitGoal, deleteHabitGoal } from '@/services/habitGoals';

// ── Types ────────────────────────────────────────────────────

export type HabitGoalType = 'habit' | 'goal';
export type HabitGoalFrequency = 'daily' | 'weekly';

export type HabitGoal = {
    id: string;
    type: HabitGoalType;
    title: string;
    frequency: HabitGoalFrequency;
    linkedTopicId?: string;
    note?: string;
    createdAt: string; // ISO timestamp
    updatedAt: string; // ISO timestamp — bumped on every mutation
    currentStreak: number;
    bestStreak: number;
    totalCompletions: number;
    lastCompletedAt: string | null; // ISO timestamp
    completionHistory: string[]; // completed period keys (day key or "W:"+weekStart key)
    isCompletedForCurrentPeriod: boolean;
};

export type NewHabitGoal = {
    type: HabitGoalType;
    title: string;
    frequency: HabitGoalFrequency;
    linkedTopicId?: string;
    note?: string;
};

// Lightweight shape exposed to Insights logic.
export type HabitGoalCompletionSummary = {
    frequency: HabitGoalFrequency;
    total: number;
    completed: number;
    missed: number;
    items: {
        id: string;
        title: string;
        type: HabitGoalType;
        isCompleted: boolean;
        currentStreak: number;
    }[];
};

// ── Period helpers ───────────────────────────────────────────
// A "period" is one local day (daily) or one local week (weekly). Completion
// state is keyed by period, so it auto-resets when a new period begins while
// the streak/history metadata is preserved.

export function periodKeyForDate(frequency: HabitGoalFrequency, date: Date): string {
    if (frequency === 'daily') return format(date, 'yyyy-MM-dd');
    const start = startOfWeek(date, { weekStartsOn: WEEK_STARTS_ON });
    return `W:${format(start, 'yyyy-MM-dd')}`;
}

// Period key n periods before now (0 = current period).
function periodKeyBack(frequency: HabitGoalFrequency, n: number): string {
    const d = new Date();
    if (frequency === 'daily') {
        d.setDate(d.getDate() - n);
    } else {
        d.setDate(d.getDate() - n * 7);
    }
    return periodKeyForDate(frequency, d);
}

function currentPeriodKey(frequency: HabitGoalFrequency): string {
    return periodKeyForDate(frequency, new Date());
}

// Count consecutive completed periods up to (and including) the current one.
// If the current period isn't completed yet, the streak is still counted from
// the previous period so a not-yet-done day doesn't read as broken.
function computeStreak(history: string[], frequency: HabitGoalFrequency): number {
    const set = new Set(history);
    let n = set.has(periodKeyBack(frequency, 0)) ? 0 : 1;
    let streak = 0;
    // Guard against runaway loops; 1000 periods is years of history.
    while (streak < 1000 && set.has(periodKeyBack(frequency, n))) {
        streak++;
        n++;
    }
    return streak;
}

// Reconcile a single item's derived fields against the current period.
function reconcileItem(item: HabitGoal): HabitGoal {
    const key = currentPeriodKey(item.frequency);
    const isCompletedForCurrentPeriod = item.completionHistory.includes(key);
    const currentStreak = computeStreak(item.completionHistory, item.frequency);
    if (
        isCompletedForCurrentPeriod === item.isCompletedForCurrentPeriod &&
        currentStreak === item.currentStreak
    ) {
        return item;
    }
    return { ...item, isCompletedForCurrentPeriod, currentStreak };
}

// ── Store ────────────────────────────────────────────────────

type HabitGoalState = {
    items: HabitGoal[];
    // The user whose cloud rows currently back `items` (null = guest/local-only).
    ownerId: string | null;
    addHabitGoal: (input: NewHabitGoal) => string;
    removeHabitGoal: (id: string) => void;
    setCompletion: (id: string, completed: boolean) => void;
    toggleCompletion: (id: string) => void;
    // Re-derive completion/streak fields against the current local period.
    reconcilePeriods: () => void;
    getByFrequency: (frequency: HabitGoalFrequency) => HabitGoal[];
    // Pull cloud rows for a user and merge with local. Non-blocking; local stays
    // the working source of truth if the fetch fails. Pass null on logout/guest.
    hydrateFromCloud: (userId: string | null) => Promise<void>;
};

export const useHabitGoalStore = create<HabitGoalState>()(
    persist(
        (set, get) => ({
            items: [],
            ownerId: null,

            addHabitGoal: (input) => {
                const id = Crypto.randomUUID();
                const now = new Date().toISOString();
                const item: HabitGoal = {
                    id,
                    type: input.type,
                    title: input.title.trim(),
                    frequency: input.frequency,
                    linkedTopicId: input.linkedTopicId,
                    note: input.note?.trim() || undefined,
                    createdAt: now,
                    updatedAt: now,
                    currentStreak: 0,
                    bestStreak: 0,
                    totalCompletions: 0,
                    lastCompletedAt: null,
                    completionHistory: [],
                    isCompletedForCurrentPeriod: false,
                };
                set((state) => ({ items: [...state.items, item] }));
                syncUpsert(get().ownerId, item);
                return id;
            },

            removeHabitGoal: (id) => {
                set((state) => ({ items: state.items.filter((i) => i.id !== id) }));
                if (get().ownerId) void deleteHabitGoal(id);
            },

            setCompletion: (id, completed) => {
                const item = get().items.find((i) => i.id === id);
                if (!item) return;

                const key = currentPeriodKey(item.frequency);
                const already = item.completionHistory.includes(key);
                if (completed === already) return; // no change

                let history: string[];
                let totalCompletions = item.totalCompletions;
                let lastCompletedAt = item.lastCompletedAt;

                if (completed) {
                    history = [...item.completionHistory, key];
                    totalCompletions += 1;
                    lastCompletedAt = new Date().toISOString();
                } else {
                    history = item.completionHistory.filter((k) => k !== key);
                    totalCompletions = Math.max(0, totalCompletions - 1);
                    // Roll lastCompletedAt back: unknown exact time, so clear it
                    // when nothing remains, otherwise keep the prior value.
                    lastCompletedAt = history.length > 0 ? item.lastCompletedAt : null;
                }

                const currentStreak = computeStreak(history, item.frequency);
                const bestStreak = Math.max(item.bestStreak, currentStreak);

                const next: HabitGoal = {
                    ...item,
                    completionHistory: history,
                    totalCompletions,
                    lastCompletedAt,
                    currentStreak,
                    bestStreak,
                    isCompletedForCurrentPeriod: completed,
                    updatedAt: new Date().toISOString(),
                };

                set((state) => ({ items: state.items.map((i) => (i.id === id ? next : i)) }));
                syncUpsert(get().ownerId, next);
            },

            toggleCompletion: (id) => {
                const item = get().items.find((i) => i.id === id);
                if (!item) return;
                get().setCompletion(id, !item.isCompletedForCurrentPeriod);
            },

            reconcilePeriods: () => {
                set((state) => {
                    let changed = false;
                    const items = state.items.map((item) => {
                        const next = reconcileItem(item);
                        if (next !== item) changed = true;
                        return next;
                    });
                    return changed ? { items } : state;
                });
            },

            getByFrequency: (frequency) => get().items.filter((i) => i.frequency === frequency),

            hydrateFromCloud: async (userId) => {
                // Guest / logout: stay local-only, stop writing to the cloud.
                if (!userId) {
                    set({ ownerId: null });
                    return;
                }

                const prevOwner = get().ownerId;
                const cloud = await fetchHabitGoals(userId);
                const cloudIds = new Set(cloud.map((i) => i.id));

                // Local items not yet in the cloud. If a *different* real user
                // previously owned this device's cache, don't migrate their items
                // into this account — only migrate guest-created (unowned) items.
                const localUnsynced =
                    prevOwner && prevOwner !== userId
                        ? []
                        : get().items.filter((i) => !cloudIds.has(i.id));

                // Push any guest/offline items up so the cloud becomes complete.
                for (const item of localUnsynced) {
                    void upsertHabitGoal(userId, item);
                }

                const merged = [...cloud, ...localUnsynced].map((i) => reconcileItem(i));
                set({ items: merged, ownerId: userId });
            },
        }),
        {
            name: 'obsy-habit-goals-storage',
            storage: createJSONStorage(() => AsyncStorage),
            version: 2,
            // v1 → v2: cloud backing added `updatedAt`. Backfill it from createdAt
            // for any items saved before the field existed.
            migrate: (persistedState: any, fromVersion: number) => {
                if (persistedState?.items && fromVersion < 2) {
                    persistedState.items = persistedState.items.map((i: HabitGoal) => ({
                        ...i,
                        updatedAt: i.updatedAt ?? i.createdAt ?? new Date().toISOString(),
                    }));
                }
                return persistedState;
            },
            partialize: (state) => ({ items: state.items, ownerId: state.ownerId }),
            onRehydrateStorage: () => (state) => {
                // Reset stale completion flags against the current period on load.
                state?.reconcilePeriods();
            },
        }
    )
);

// Fire-and-forget cloud upsert — only when a signed-in owner backs the cache.
// Never blocks or throws, so the UI keeps working offline / signed out.
function syncUpsert(ownerId: string | null, item: HabitGoal) {
    if (ownerId) void upsertHabitGoal(ownerId, item);
}

// Count completions in the current period that happened after the insight was
// last generated — drives the "new entry · refresh to update" nudge. Takes the
// items array so callers can pass a subscribed (reactive) copy from the store.
export function countPendingHabitGoals(
    items: HabitGoal[],
    lastUpdated: Date | null,
    frequency: HabitGoalFrequency
): number {
    if (!lastUpdated) return 0;
    return items.filter(
        (i) =>
            i.frequency === frequency &&
            i.isCompletedForCurrentPeriod &&
            i.lastCompletedAt != null &&
            new Date(i.lastCompletedAt) > lastUpdated
    ).length;
}

// ── Insight awareness (non-hook accessor) ────────────────────
// Lets Day/Week insight logic reference completed/missed habits & goals.
export function getHabitGoalSummary(frequency: HabitGoalFrequency): HabitGoalCompletionSummary {
    const items = useHabitGoalStore
        .getState()
        .items.filter((i) => i.frequency === frequency)
        .map((i) => reconcileItem(i));
    const completed = items.filter((i) => i.isCompletedForCurrentPeriod).length;
    return {
        frequency,
        total: items.length,
        completed,
        missed: items.length - completed,
        items: items.map((i) => ({
            id: i.id,
            title: i.title,
            type: i.type,
            isCompleted: i.isCompletedForCurrentPeriod,
            currentStreak: i.currentStreak,
        })),
    };
}

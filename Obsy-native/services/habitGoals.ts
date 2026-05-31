import { supabase } from '@/lib/supabase';
import type { HabitGoal, HabitGoalType, HabitGoalFrequency } from '@/lib/habitGoalStore';

// Supabase row shape (snake_case) for public.habit_goals.
interface HabitGoalRow {
    id: string;
    user_id: string;
    type: HabitGoalType;
    title: string;
    frequency: HabitGoalFrequency;
    linked_topic_id: string | null;
    note: string | null;
    created_at: string;
    updated_at: string;
    current_streak: number;
    best_streak: number;
    total_completions: number;
    last_completed_at: string | null;
    completion_history: string[] | null;
    is_completed_for_current_period: boolean;
}

function rowToItem(r: HabitGoalRow): HabitGoal {
    return {
        id: r.id,
        type: r.type,
        title: r.title,
        frequency: r.frequency,
        linkedTopicId: r.linked_topic_id ?? undefined,
        note: r.note ?? undefined,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        currentStreak: r.current_streak ?? 0,
        bestStreak: r.best_streak ?? 0,
        totalCompletions: r.total_completions ?? 0,
        lastCompletedAt: r.last_completed_at ?? null,
        completionHistory: Array.isArray(r.completion_history) ? r.completion_history : [],
        isCompletedForCurrentPeriod: !!r.is_completed_for_current_period,
    };
}

function itemToRow(userId: string, i: HabitGoal): HabitGoalRow {
    return {
        id: i.id,
        user_id: userId,
        type: i.type,
        title: i.title,
        frequency: i.frequency,
        linked_topic_id: i.linkedTopicId ?? null,
        note: i.note ?? null,
        created_at: i.createdAt ?? new Date().toISOString(),
        updated_at: i.updatedAt ?? i.createdAt ?? new Date().toISOString(),
        current_streak: i.currentStreak,
        best_streak: i.bestStreak,
        total_completions: i.totalCompletions,
        last_completed_at: i.lastCompletedAt,
        completion_history: i.completionHistory,
        is_completed_for_current_period: i.isCompletedForCurrentPeriod,
    };
}

/**
 * Fetch all habit/goal rows for a user. Non-throwing: returns [] on any failure
 * so the local cache remains the working source of truth.
 */
export async function fetchHabitGoals(userId: string): Promise<HabitGoal[]> {
    try {
        const { data, error } = await supabase
            .from('habit_goals')
            .select('*')
            .eq('user_id', userId);
        if (error) {
            console.error('[habitGoals] Fetch error:', error);
            return [];
        }
        return (data ?? []).map(rowToItem);
    } catch (err) {
        console.error('[habitGoals] Fetch exception:', err);
        return [];
    }
}

/**
 * Upsert a single habit/goal. Non-blocking — logs but never throws, so the UI
 * keeps working if auth/session or network is unavailable.
 */
export async function upsertHabitGoal(userId: string, item: HabitGoal): Promise<void> {
    try {
        const { error } = await supabase
            .from('habit_goals')
            .upsert(itemToRow(userId, item), { onConflict: 'id' });
        if (error) console.error('[habitGoals] Upsert error:', error);
    } catch (err) {
        console.error('[habitGoals] Upsert exception:', err);
    }
}

/**
 * Delete a habit/goal by id. Non-blocking — logs but never throws.
 */
export async function deleteHabitGoal(id: string): Promise<void> {
    try {
        const { error } = await supabase.from('habit_goals').delete().eq('id', id);
        if (error) console.error('[habitGoals] Delete error:', error);
    } catch (err) {
        console.error('[habitGoals] Delete exception:', err);
    }
}

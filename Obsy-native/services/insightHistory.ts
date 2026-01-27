import { supabase } from "@/lib/supabase";

/**
 * INSIGHT HISTORY SNAPSHOT CONTRACT
 * ==================================
 *
 * This module manages the insight_history table which stores snapshots of generated insights.
 * The snapshot contract ensures:
 *
 * UNIQUENESS:
 * - One insight per (user_id, type, start_date) - enforced by database unique index
 * - For daily: start_date = end_date = the calendar day (local timezone)
 * - For weekly: start_date = week start (Sunday), end_date = week end (Saturday)
 *   Week convention: Sunday to Saturday (weekStartsOn: 0) - see dateUtils.ts
 * - For monthly: start_date = month start (1st), end_date = month end (28-31)
 *
 * LOCKING BEHAVIOR:
 * - Past time frames are locked: the last generated version is preserved forever
 * - Current time frame can be regenerated: updates the existing snapshot via UPSERT
 * - The UI fast-loads from stored snapshots before attempting regeneration
 *
 * CAPTURE TRACKING:
 * - capture_ids array stores which captures were analyzed for this insight
 * - This enables the archive to show exactly which photos were used on that day
 *
 * Daily insights are now stored one per user per day and never overwritten by future days.
 * Weekly insights are now stored one per user per week and reused for fast load.
 * Monthly insights are now stored one per user per month and reused for fast load.
 */

export type InsightType = 'weekly' | 'monthly' | 'daily' | 'challenge';

export interface InsightHistory {
    id: string;
    user_id: string;
    type: InsightType;
    start_date: string; // YYYY-MM-DD
    end_date: string;   // YYYY-MM-DD
    content: string;
    mood_summary?: any; // JSONB
    capture_ids?: string[]; // Array of capture IDs used to generate this insight
    created_at: string;
    updated_at: string;
}

/**
 * FAST-LOAD PATH: Fetches an existing insight snapshot from the database.
 *
 * This is the primary method for loading stored insights. Always check for an existing
 * snapshot before generating a new one to avoid unnecessary AI calls.
 *
 * @param userId - The user's ID
 * @param type - The insight type ('daily', 'weekly', or 'monthly')
 * @param startDate - Start of the time frame
 * @param endDate - End of the time frame
 * @returns The stored insight snapshot, or null if none exists for this time frame
 */
export async function fetchInsightHistory(
    userId: string,
    type: InsightType,
    startDate: Date,
    endDate: Date
): Promise<InsightHistory | null> {
    const startStr = startDate.toISOString().split("T")[0];
    const endStr = endDate.toISOString().split("T")[0];

    const { data, error } = await (supabase as any)
        .from("insight_history")
        .select("id, user_id, type, start_date, end_date, content, mood_summary, capture_ids, created_at, updated_at")
        .eq("user_id", userId)
        .eq("type", type)
        .gte("start_date", startStr)
        .lte("end_date", endStr)
        .maybeSingle();

    if (error) {
        console.error(`Error fetching ${type} insight history:`, error);
        return null;
    }

    if (!data) return null;

    // Normalize data for backward compatibility
    return {
        ...data,
        mood_summary: typeof data.mood_summary === 'string' ? JSON.parse(data.mood_summary) : data.mood_summary,
        capture_ids: data.capture_ids || []
    } as InsightHistory;
}

function safeJsonParse(value: any) {
    if (typeof value !== 'string') return value;
    try {
        return JSON.parse(value);
    } catch (e) {
        console.warn("Failed to parse JSON:", value);
        return null;
    }
}

export async function fetchDailyArchives(userId: string): Promise<InsightHistory[]> {
    const { data, error } = await (supabase as any)
        .from("insight_history")
        .select("id, user_id, type, start_date, end_date, content, mood_summary, capture_ids, created_at, updated_at")
        .eq("user_id", userId)
        .eq("type", "daily")
        .order("start_date", { ascending: false });

    if (error) {
        console.error("Error fetching daily archives:", error);
        return [];
    }

    return (data || []).map((row: any) => ({
        ...row,
        mood_summary: safeJsonParse(row.mood_summary),
        capture_ids: row.capture_ids || []
    })) as InsightHistory[];
}

export async function fetchWeeklyArchives(userId: string): Promise<InsightHistory[]> {
    const { data, error } = await (supabase as any)
        .from("insight_history")
        .select("id, user_id, type, start_date, end_date, content, mood_summary, capture_ids, created_at, updated_at")
        .eq("user_id", userId)
        .eq("type", "weekly")
        .order("start_date", { ascending: false });

    if (error) {
        console.error("Error fetching weekly archives:", error);
        return [];
    }

    return (data || []).map((row: any) => ({
        ...row,
        mood_summary: safeJsonParse(row.mood_summary),
        capture_ids: row.capture_ids || []
    })) as InsightHistory[];
}

/**
 * SNAPSHOT SAVE: Upserts an insight into the insight_history table.
 *
 * This function enforces snapshot uniqueness via the database constraint on
 * (user_id, type, start_date, end_date). Multiple calls for the same time frame
 * will update the existing row instead of creating duplicates.
 *
 * The onConflict parameter ensures upsert behavior:
 * - If no row exists: INSERT a new row
 * - If row exists: UPDATE the existing row with new content
 *
 * Capture IDs are tracked to enable fast-loading of associated photos when
 * viewing archived insights.
 *
 * @param userId - The user's ID
 * @param type - The insight type ('daily', 'weekly', or 'monthly')
 * @param startDate - Start of the time frame
 * @param endDate - End of the time frame
 * @param content - The generated insight text
 * @param moodSummary - Optional mood summary data (vibe_tags, mood_colors, mood_flow)
 * @param captureIds - Array of capture IDs that were analyzed for this insight
 * @returns The saved insight snapshot
 */
export async function upsertInsightHistory(
    userId: string,
    type: InsightType,
    startDate: Date,
    endDate: Date,
    content: string,
    moodSummary?: any,
    captureIds?: string[]
): Promise<InsightHistory | null> {
    const startStr = startDate.toISOString().split("T")[0];
    const endStr = endDate.toISOString().split("T")[0];

    // UPSERT using unique index on (user_id, type, start_date)
    // The start_date alone uniquely identifies a time period (day, week start, or month start)
    const { data, error } = await (supabase as any)
        .from("insight_history")
        .upsert(
            {
                user_id: userId,
                type,
                start_date: startStr,
                end_date: endStr,
                content,
                mood_summary: moodSummary,
                capture_ids: captureIds || [],
                updated_at: new Date().toISOString()
            },
            { onConflict: "user_id,type,start_date" }
        )
        .select()
        .single();

    if (error) {
        console.error(`Error upserting ${type} insight history:`, error);
        throw error;
    }

    return data as InsightHistory;
}

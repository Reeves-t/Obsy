import { supabase } from "@/lib/supabase";

export async function fetchDailyInsightForDate(userId: string, date: Date): Promise<DailyInsight | null> {
    const dateStr = date.toISOString().split("T")[0];

    const { data, error } = await supabase
        .from("daily_insights")
        .select("*")
        .eq("user_id", userId)
        .eq("date", dateStr)
        .maybeSingle();

    if (error) {
        console.error("Error fetching daily insight:", error);
        return null;
    }

    return data as DailyInsight | null;
}

export async function upsertDailyInsightForDate(
    userId: string,
    date: Date,
    summary: string,
    vibe_tags: string[],
    mood_colors: string[],
    mood_flow: any // New argument for Mood Flow data
): Promise<DailyInsight | null> {
    const dateStr = date.toISOString().split("T")[0];

    const { data, error } = await supabase
        .from("daily_insights")
        .upsert(
            {
                user_id: userId,
                date: dateStr,
                summary_text: summary, // Use 'summary_text' as migration ensured this column exists
                vibe_tags,
                mood_colors,
                mood_flow
            } as any,
            { onConflict: "user_id,date" }
        )
        .select()
        .single();

    if (error) {
        console.error("Error upserting daily insight:", error);
        throw error;
    }

    return data as DailyInsight;
}


// Individual sentence in the structured insight format
export interface InsightSentence {
    text: string;
    highlight: boolean;
}

// Meta information for insights
export interface InsightMeta {
    type: 'daily' | 'weekly';
    entryCount: number;
    weekRange?: string; // Only for weekly insights, format: "YYYY-MM-DD to YYYY-MM-DD"
}

export interface DailyInsight {
    id: string;
    user_id: string;
    date: string; // ISO date-only string YYYY-MM-DD
    summary_text: string; // Legacy plain text (for backwards compatibility)
    sentences?: InsightSentence[]; // New structured format with highlights
    meta?: InsightMeta; // Insight metadata
    created_at: string;
    updated_at: string;
    moods_json?: Record<string, number>; // Legacy? Or maybe used for stats
    objects_json?: Record<string, number>;
    dominant_mood?: string;
    main_object?: string;
    total_captures?: number;
    first_capture_time?: string;
    last_capture_time?: string;
    vibe_tags?: string[]; // Array of strings
    mood_colors?: string[]; // Array of hex codes
    mood_flow?: any; // JSONB structure for Mood Flow
    capture_ids?: string[]; // Capture IDs included in this insight
}

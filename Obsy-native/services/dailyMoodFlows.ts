import { supabase } from "@/lib/supabase";
import {
    DailyMoodFlowData,
    computeDailyMoodFlow,
    filterCapturesForDate,
} from "@/lib/dailyMoodFlows";
import { Capture } from "@/lib/captureStore";

/**
 * Upsert a daily mood flow record to Supabase
 * Non-blocking - logs errors but doesn't throw
 */
export async function upsertDailyMoodFlow(
    userId: string,
    dateKey: string,
    flowData: DailyMoodFlowData
): Promise<void> {
    try {
        const { error } = await supabase.from("daily_mood_flows").upsert(
            {
                user_id: userId,
                date_key: dateKey,
                segments: flowData.segments,
                dominant: flowData.dominant,
                total_captures: flowData.totalCaptures,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id,date_key" }
        );

        if (error) {
            console.error("[dailyMoodFlows] Upsert error:", error);
        }
    } catch (err) {
        console.error("[dailyMoodFlows] Upsert exception:", err);
    }
}

/**
 * Fetch daily mood flows for a date range
 * @param userId - User ID
 * @param startDate - Start date key (YYYY-MM-DD)
 * @param endDate - End date key (YYYY-MM-DD)
 * @returns Map of dateKey -> DailyMoodFlowData
 */
export async function fetchDailyMoodFlows(
    userId: string,
    startDate: string,
    endDate: string
): Promise<Record<string, DailyMoodFlowData>> {
    try {
        const { data, error } = await supabase
            .from("daily_mood_flows")
            .select("*")
            .eq("user_id", userId)
            .gte("date_key", startDate)
            .lte("date_key", endDate);

        if (error) {
            console.error("[dailyMoodFlows] Fetch error:", error);
            return {};
        }

        const flowMap: Record<string, DailyMoodFlowData> = {};
        for (const row of data || []) {
            flowMap[row.date_key] = {
                segments: row.segments as DailyMoodFlowData["segments"],
                dominant: row.dominant,
                totalCaptures: row.total_captures,
            };
        }

        return flowMap;
    } catch (err) {
        console.error("[dailyMoodFlows] Fetch exception:", err);
        return {};
    }
}

/**
 * Backfill daily mood flows for missing date keys
 * @param userId - User ID
 * @param captures - All captures
 * @param dateKeys - Date keys to backfill
 */
export async function backfillDailyMoodFlows(
    userId: string,
    captures: Capture[],
    dateKeys: string[]
): Promise<void> {
    try {
        const upsertPromises = dateKeys.map(async (dateKey) => {
            const dayCaptures = filterCapturesForDate(captures, dateKey);
            if (dayCaptures.length > 0) {
                const flowData = computeDailyMoodFlow(dayCaptures);
                await upsertDailyMoodFlow(userId, dateKey, flowData);
            }
        });

        await Promise.all(upsertPromises);
    } catch (err) {
        console.error("[dailyMoodFlows] Backfill exception:", err);
    }
}

/**
 * Helper to get date range for a month
 */
export function getMonthDateRange(month: Date): { startDate: string; endDate: string } {
    const year = month.getFullYear();
    const monthNum = month.getMonth();
    
    const startDate = new Date(year, monthNum, 1);
    const endDate = new Date(year, monthNum + 1, 0); // Last day of month
    
    const formatDate = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    };

    return {
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
    };
}


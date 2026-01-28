import { Capture } from "@/types/capture";
import {
    AiSettings,
    generateWeeklyInsightSecure,
    generateMonthlyInsightSecure,
    CaptureData,
    MonthSignals
} from "@/services/secureAI";
import { getCustomToneById } from "@/lib/customTone";
import { upsertInsightHistory, fetchInsightHistory, InsightHistory } from "@/services/insightHistory";
import { archiveInsight } from "@/services/archive";
import { startOfWeek, format } from "date-fns";
import { formatMonthKey } from "@/lib/dailyMoodFlows";
import { getMoodLabel } from "@/lib/moodUtils";
import { getMonthSignals } from "@/services/monthlySummaries";

/**
 * Helper function to extract tone and custom tone prompt from AiSettings
 */
async function extractToneSettings(settings: AiSettings): Promise<{ tone: string; customTonePrompt?: string }> {
    const tone = settings.tone;
    let customTonePrompt: string | undefined;

    // Check if custom tone is selected
    if (settings.selectedCustomToneId) {
        const customTone = await getCustomToneById(settings.selectedCustomToneId);
        if (customTone) {
            customTonePrompt = customTone.prompt;
        }
    }

    return { tone, customTonePrompt };
}

export const ensureMonthlyInsight = async (
    userId?: string,
    settings?: AiSettings,
    captures?: Capture[],
    targetDate?: Date,
    force?: boolean
): Promise<InsightHistory | null> => {
    if (!userId || !settings || !captures) return null;

    const now = new Date();
    const isTargetCurrentMonth = !targetDate || (
        targetDate.getMonth() === now.getMonth() &&
        targetDate.getFullYear() === now.getFullYear()
    );

    const targetMonth = targetDate ?? now;
    const monthKey = formatMonthKey(targetMonth);
    const monthStart = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1);

    // Determine the "through" date for the summary
    const throughDate = isTargetCurrentMonth ? now : new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0);
    const dayOfMonth = throughDate.getDate();

    // GATING: Only after day 7 and with sufficient data (7+ distinct days)
    const signals = getMonthSignals(captures, monthKey, throughDate.toISOString());
    const isEligible = dayOfMonth >= 7 && signals.activeDays >= 7;

    if (!isEligible && !force) {
        console.log(`[MonthlyInsight] Not eligible yet: Day ${dayOfMonth}, ${signals.activeDays} active days`);
        return null;
    }

    // Fast-load path: check for existing snapshot for this month
    // We use monthStart as the surrogate for the whole month's snapshot uniqueness
    // SNAPSHOT CONTRACT: Always return existing unless force=true
    // Pending insights feature handles "new captures" messaging
    if (!force) {
        const existing = await fetchInsightHistory(userId, "monthly", monthStart, monthStart);
        if (existing) {
            return existing; // Always return existing snapshot unless explicitly forced
        }
    }

    // Bundle monthly stats for LLM
    const monthLabel = format(targetMonth, "MMMM yyyy");

    // Extract tone settings
    const { tone, customTonePrompt } = await extractToneSettings(settings);

    // Generate Monthly Insight via secure Edge Function
    let content: string;
    try {
        content = await generateMonthlyInsightSecure(
            monthLabel,
            signals as MonthSignals,
            tone,
            customTonePrompt
        );
    } catch (error: any) {
        console.error("[MonthlyInsight] Generation failed:", error);
        // Handle rate limit errors
        if (error.message?.includes('Rate limit')) {
            throw new Error(`Monthly insight generation limit reached. ${error.message}`);
        }
        // Handle auth errors
        if (error.message?.includes('Authentication required')) {
            throw new Error('Please sign in to generate insights');
        }
        // Re-throw other errors
        throw error;
    }

    const captureIds = captures
        .filter(c => {
            const d = new Date(c.created_at);
            return d >= monthStart && d <= throughDate && (c.includeInInsights ?? true);
        })
        .map(c => c.id);

    // Save to history
    const result = await upsertInsightHistory(
        userId,
        "monthly",
        monthStart,
        monthStart, // Use same date to fulfill unique constraint (user_id, type, start_date)
        content,
        {
            generated_through_date: throughDate.toISOString().split('T')[0],
            tone_id: settings.tone,
            source_stats: signals
        },
        captureIds
    );

    return result;
};

export const ensureWeeklyInsight = async (
    userId?: string,
    settings?: AiSettings,
    captures?: Capture[],
    targetDate?: Date,
    force?: boolean
) => {
    if (!userId || !settings || !captures) return null;

    const now = targetDate ?? new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday start

    // Fast path: use cached snapshot unless forcing regeneration
    if (!force) {
        const existing = await fetchInsightHistory(userId, "weekly", weekStart, now);
        if (existing) {
            return existing;
        }
    }

    // Filter captures within the week window and opted into insights
    const weeklyCaptures = captures.filter((c) => {
        const createdAt = new Date(c.created_at);
        return createdAt >= weekStart && createdAt <= now && (c.includeInInsights ?? true);
    });

    if (!weeklyCaptures.length) return null;

    const weekLabel = `Week of ${format(weekStart, "MMM d")} - ${format(now, "MMM d")}`;

    // Map captures to CaptureData format for secure AI
    const capturesData: CaptureData[] = weeklyCaptures.map((c) => ({
        mood: c.mood_name_snapshot || getMoodLabel(c.mood_id || 'neutral'),
        note: c.note || undefined,
        capturedAt: c.created_at,
        tags: c.tags,
        // Note: secureAI doesn't support image analysis yet, so we omit imageUrl and usePhotoForInsight
    }));

    // Extract tone settings
    const { tone, customTonePrompt } = await extractToneSettings(settings);

    // Generate Weekly Insight via secure Edge Function
    let insightResponse: { insight: string };
    try {
        insightResponse = await generateWeeklyInsightSecure(
            weekLabel,
            capturesData,
            tone,
            customTonePrompt
        );
    } catch (error: any) {
        console.error("[WeeklyInsight] Generation failed:", error);
        // Handle rate limit errors
        if (error.message?.includes('Rate limit')) {
            throw new Error(`Weekly insight generation limit reached. ${error.message}`);
        }
        // Handle auth errors
        if (error.message?.includes('Authentication required')) {
            throw new Error('Please sign in to generate insights');
        }
        // Re-throw other errors
        throw error;
    }

    // Map response to legacy format for backward compatibility
    const content = insightResponse.insight;
    const sentences = content
        .split(/(?<=[.!?])\s+/)
        .filter((s: string) => s.trim().length > 0)
        .map((text: string) => ({ text: text.trim(), highlight: false }));

    const meta = {
        type: 'weekly' as const,
        entryCount: weeklyCaptures.length,
        weekRange: weekLabel
    };

    const captureIds = weeklyCaptures.map((c) => c.id);

    const result = await upsertInsightHistory(
        userId,
        "weekly",
        weekStart,
        now,
        content,
        { sentences, meta },
        captureIds
    );

    return result;
};

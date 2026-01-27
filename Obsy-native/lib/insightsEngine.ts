import { generateDailySummary, AiSettings, DailySummaryInput } from "@/services/ai";
import { fetchInsightHistory, upsertInsightHistory } from "@/services/insightHistory";
import { archiveInsight } from "@/services/archive";
import { Capture } from "@/types/capture";
import { getMoodLabel } from "@/lib/moodUtils";
import { DailyInsight } from "@/services/dailyInsights";
import { getLocalDayKey } from "@/lib/utils";
import { formatMonthKey } from "@/lib/dailyMoodFlows";
import { generateMonthPhrase } from "@/lib/monthPhraseGenerator";
import { fetchMonthlySummary, upsertMonthlySummary, computeMonthMoodTotals } from "@/services/monthlySummaries";
import { getBannedMoodWords } from "@/lib/moodColors";

/**
 * DAILY INSIGHT SNAPSHOT PATTERN
 * ================================
 *
 * Daily insights follow the snapshot pattern:
 * - One insight per user per day (enforced by database constraint)
 * - The function first checks for existing snapshot (fast-load)
 * - Only generates if no snapshot exists or force=true
 * - Each day's snapshot is locked once the day ends
 *
 * The UI fast loads by using the stored snapshot instead of regenerating every time.
 * Daily insights are now stored one per user per day and never overwritten by future days.
 */

export async function ensureDailyInsight(
    userId: string,
    settings: AiSettings,
    targetDate: Date,
    captures: Capture[],
    force: boolean = false
): Promise<DailyInsight | null> {
    // Use shared date utility for consistent local timezone handling
    // This ensures alignment with challenge_entries and challenge_insights dates
    const dateStr = getLocalDayKey(targetDate);
    const todayStr = getLocalDayKey(new Date());

    // 1. FAST-LOAD PATH: Check for existing snapshot first
    // This avoids unnecessary AI calls by reusing stored insights
    if (!force) {
        // Check InsightHistory first (the permanent archive)
        const history = await fetchInsightHistory(userId, 'daily', targetDate, targetDate);
        if (history) {
            // Map to DailyInsight format for UI compatibility
            return {
                id: history.id,
                user_id: history.user_id,
                date: history.start_date,
                summary_text: history.content,
                sentences: history.mood_summary?.sentences || [],
                meta: history.mood_summary?.meta,
                created_at: history.created_at,
                updated_at: history.updated_at,
                vibe_tags: history.mood_summary?.vibe_tags || [],
                mood_colors: history.mood_summary?.mood_colors || [],
                mood_flow: history.mood_summary?.mood_flow || null,
                capture_ids: history.capture_ids || []
            };
        }
    }

    // 2. If auto-generation is off, do nothing
    if (!settings.autoDailyInsights) {
        return null;
    }

    // 3. Filter captures for the target date
    // FIX: Compare local day keys instead of string prefix to handle timezones correctly
    const targetCaptures = captures.filter((c) => {
        const captureDate = new Date(c.created_at);
        const captureKey = getLocalDayKey(captureDate);
        return captureKey === dateStr && (c.includeInInsights ?? true);
    });

    // 4. If no captures, do nothing
    if (targetCaptures.length === 0) {
        return null;
    }

    // 5. Prepare input for AI
    const dateLabel = targetDate.toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
    });

    const input: DailySummaryInput = {
        dateLabel,
        captures: targetCaptures.map((c) => ({
            mood: c.mood_name_snapshot || getMoodLabel(c.mood_id || 'neutral'),
            note: c.note || undefined,
            capturedAt: c.created_at,
            tags: c.tags,
            imageUrl: c.image_url,
            usePhotoForInsight: c.usePhotoForInsight,
        })),
    };

    // PHOTO GUARDRAIL: Log photo inclusion status
    const photoOptInCount = targetCaptures.filter(c => c.usePhotoForInsight).length;
    console.log(`[InsightEngine] Generating insight: ${targetCaptures.length} captures, ${photoOptInCount} with photo opt-in`);

    // Get AI generated summary
    try {
        const { summary, sentences, vibe_tags, mood_colors, mood_flow, meta } = await generateDailySummary(input, settings);

        // 7. Extract capture IDs for tracking
        const captureIds = targetCaptures.map(c => c.id);

        // 8. SNAPSHOT SAVE: Upsert ensures one row per (user_id, type, start_date)
        // This ensures insights are cached and don't regenerate on refresh
        const saved = await upsertInsightHistory(
            userId,
            'daily',
            targetDate,
            targetDate,
            summary,
            { vibe_tags, mood_colors, mood_flow, sentences, meta },
            captureIds
        );

        if (!saved) {
            throw new Error("Failed to save insight history");
        }

        // 9. ARCHIVE: Save to permanent archive
        await archiveInsight({
            userId,
            type: 'daily',
            insightText: summary,
            relatedCaptureIds: targetCaptures.map(c => c.id),
            date: targetDate,
            tone: settings.tone
        });

        // 10. UPDATE MONTH PHRASE: Update month phrase for current month
        try {
            await updateMonthPhraseForDate(userId, targetDate, captures);
        } catch (error) {
            console.error("Failed to update month phrase:", error);
            // Don't fail daily insight if month phrase fails
        }

        // This snapshot will be reused on subsequent loads (no regeneration unless forced)
        return {
            id: saved.id,
            user_id: saved.user_id,
            date: saved.start_date,
            summary_text: saved.content,
            sentences: saved.mood_summary?.sentences || [],
            meta: saved.mood_summary?.meta,
            created_at: saved.created_at,
            updated_at: saved.updated_at,
            vibe_tags: saved.mood_summary?.vibe_tags || [],
            mood_colors: saved.mood_summary?.mood_colors || [],
            mood_flow: saved.mood_summary?.mood_flow || null,
            capture_ids: saved.capture_ids || []
        };
    } catch (error) {
        console.error("Failed to generate daily insight:", error);
        throw error;
    }
}

/**
 * Update the month phrase for a given date's month
 * This is called after daily insight generation to keep month phrase fresh
 */
async function updateMonthPhraseForDate(
    userId: string,
    date: Date,
    allCaptures: Capture[]
): Promise<void> {
    const monthKey = formatMonthKey(date);

    // Filter captures for this month
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

    const monthCaptures = allCaptures.filter(c => {
        const captureDate = new Date(c.created_at);
        return captureDate >= monthStart && captureDate <= monthEnd;
    });

    if (monthCaptures.length < 3) {
        return; // Need minimum captures for meaningful phrase
    }

    // Compute mood totals
    const moodTotals = computeMonthMoodTotals(monthCaptures);

    // Generate phrase
    const bannedWords = getBannedMoodWords();
    const phrase = await generateMonthPhrase(moodTotals, bannedWords);

    // Fetch existing summary (if any)
    const existing = await fetchMonthlySummary(userId, monthKey);

    // Upsert with new phrase
    await upsertMonthlySummary(
        userId,
        monthKey,
        existing?.moodTotals || moodTotals,
        existing?.aiSummary || '',
        phrase
    );
}

import { create } from 'zustand';
import { Capture } from '@/types/capture';
import { getLocalDayKey } from '@/lib/utils';
import { callDaily } from '@/services/dailyInsightClient';
import { getCapturesForDaily, CaptureData } from '@/lib/captureData';
import { getMoodLabel } from '@/lib/moodUtils';
import { getTimeBucketForDate, getDayPart } from '@/lib/insightTime';
import { fetchMostRecentDailyInsight, fetchInsightHistory, upsertInsightHistory } from '@/services/insightHistory';
import { upsertDailyMoodFlow, fetchDailyMoodFlows } from '@/services/dailyMoodFlows';
import { formatDateKey, isMoodFlowReading } from '@/lib/dailyMoodFlows';

/**
 * Validates and sanitizes a mood string.
 * Returns the trimmed string if valid, null otherwise.
 */
function validateMoodString(mood: string | null | undefined): string | null {
    if (!mood || typeof mood !== 'string') return null;
    const trimmed = mood.trim();
    return trimmed.length > 0 ? trimmed : null;
}

/**
 * Resolves mood value with comprehensive fallback chain.
 * Priority: mood_name_snapshot > getMoodLabel > "Neutral"
 * Logs warnings when fallbacks are used for debugging.
 */
function resolveMoodWithFallback(
    moodId: string,
    moodNameSnapshot: string | null | undefined,
    captureId: string
): string {
    const validSnapshot = validateMoodString(moodNameSnapshot);
    if (validSnapshot) {
        return validSnapshot;
    }

    const resolvedMood = getMoodLabel(moodId);
    const validResolved = validateMoodString(resolvedMood);
    if (validResolved) {
        if (!moodNameSnapshot) {
            console.warn(
                `[TodayInsight] Capture ${captureId}: mood_name_snapshot is empty, using resolved mood "${validResolved}"`
            );
        }
        return validResolved;
    }

    console.warn(
        `[TodayInsight] Capture ${captureId}: Both mood_name_snapshot and getMoodLabel failed, falling back to "Neutral". moodId: ${moodId}, snapshot: ${moodNameSnapshot}`
    );
    return "Neutral";
}

interface TodayInsightState {
    status: 'idle' | 'loading' | 'success' | 'error';
    text: string | null;
    error: {
        stage: string;
        message: string;
        requestId?: string;
    } | null;
    lastUpdated: Date | null;
    requestId: string | null;
    dateKey: string | null; // YYYY-MM-DD
    hasGeneratedToday: boolean;
    hasLoadedSnapshot: boolean; // Tracks if initial snapshot load has been attempted

    // Actions
    setTodayInsight: (text: string | null) => void;
    loadSnapshot: (userId: string) => Promise<void>;
    refreshTodayInsight: (
        userId: string,
        tone: string,
        customTonePrompt: string | undefined,
        allCaptures: Capture[]
    ) => Promise<void>;
    checkMidnightReset: () => void;
    clearError: () => void;
    computePending: (captures: Capture[]) => void;
}

export const useTodayInsight = create<TodayInsightState>((set, get) => ({
    status: 'idle',
    text: null,
    error: null,
    lastUpdated: null,
    requestId: null,
    dateKey: getLocalDayKey(new Date()),
    hasGeneratedToday: false,
    hasLoadedSnapshot: false,

    setTodayInsight: (text) => {
        set({
            status: 'success',
            text,
            error: null,
            lastUpdated: new Date(),
            dateKey: getLocalDayKey(new Date()),
        });
    },

    loadSnapshot: async (userId: string) => {
        // Skip if already loaded or currently has text
        if (get().hasLoadedSnapshot || get().text) return;

        try {
            const today = getLocalDayKey(new Date());

            // First try to load today's insight
            const todaySnapshot = await fetchInsightHistory(userId, 'daily', new Date(), new Date());

            if (todaySnapshot) {
                set({
                    text: todaySnapshot.content,
                    status: 'success',
                    dateKey: today,
                    hasLoadedSnapshot: true,
                    hasGeneratedToday: true,
                    lastUpdated: new Date(todaySnapshot.updated_at),
                });
                return;
            }

            // If no today insight, load the most recent one as a preload
            const recentSnapshot = await fetchMostRecentDailyInsight(userId);

            if (recentSnapshot) {
                set({
                    text: recentSnapshot.content,
                    status: 'success',
                    dateKey: recentSnapshot.start_date,
                    hasLoadedSnapshot: true,
                    hasGeneratedToday: false, // Not today's insight, so auto-gen can still trigger
                    lastUpdated: new Date(recentSnapshot.updated_at),
                });
            } else {
                set({ hasLoadedSnapshot: true });
            }
        } catch (error) {
            console.error("[useTodayInsight] loadSnapshot failed:", error);
            set({ hasLoadedSnapshot: true });
        }
    },

    refreshTodayInsight: async (userId, tone, customTonePrompt, allCaptures) => {
        if (get().status === 'loading') return;

        set({ status: 'loading', error: null });

        try {
            const todayCaptures = getCapturesForDaily(new Date(), allCaptures);

            if (!todayCaptures.length) {
                set({ status: 'idle', text: null, requestId: null, lastUpdated: new Date() });
                return;
            }

            const captureData: CaptureData[] = todayCaptures.map((c) => {
                const date = new Date(c.created_at);
                const mood = resolveMoodWithFallback(
                    c.mood_id,
                    c.mood_name_snapshot,
                    c.id
                );
                return {
                    mood,
                    note: c.note ?? c.journal_entry ?? undefined,
                    capturedAt: c.created_at,
                    tags: c.tags ?? [],
                    timeBucket: c.timeBucket ?? getTimeBucketForDate(date),
                    dayPart: c.dayPart ?? getDayPart(date),
                    localTimeLabel: c.localTimeLabel,
                };
            });

            const invalidCaptures = captureData.filter((c) => !validateMoodString(c.mood));
            if (invalidCaptures.length > 0) {
                console.error(
                    `[TodayInsight] Found ${invalidCaptures.length} captures with invalid mood values after resolution. This should never happen.`,
                    invalidCaptures
                );
                set({
                    status: 'error',
                    error: {
                        stage: 'validation',
                        message: 'Invalid mood data detected',
                    },
                    requestId: null,
                });
                return;
            }

            const dateLabel = new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
            });

            const response = await callDaily(dateLabel, captureData, tone, customTonePrompt);

            if (response.ok && response.text) {
                // Save mood_flow data to database if present
                if (userId && response.mood_flow) {
                    const dateKey = formatDateKey(new Date());

                    // Incremental update: Check for existing mood flow to preserve title/subtitle
                    const existingFlows = await fetchDailyMoodFlows(userId, dateKey, dateKey);
                    const existingFlow = existingFlows[dateKey];

                    // Check if it's Reading format with segments
                    if (isMoodFlowReading(response.mood_flow) && response.mood_flow.segments) {
                        // Save full Reading format with title, subtitle, confidence
                        const segments = response.mood_flow.segments;

                        // Incremental update logic: Reuse existing title/subtitle if they exist
                        const title = existingFlow?.title || response.mood_flow.title;
                        const subtitle = existingFlow?.subtitle || response.mood_flow.subtitle;
                        const confidence = existingFlow?.confidence || response.mood_flow.confidence;

                        console.log('[TodayInsight] Saving mood flow (Reading format):', {
                            title,
                            subtitle,
                            confidence,
                            segments,
                            isIncremental: !!(existingFlow?.title)
                        });

                        const dominant = segments[0]?.mood || 'neutral';
                        await upsertDailyMoodFlow(userId, dateKey, {
                            segments,
                            dominant,
                            totalCaptures: todayCaptures.length,
                            title,
                            subtitle,
                            confidence,
                        });
                    } else if (Array.isArray(response.mood_flow)) {
                        // Old segments format (no title/subtitle)
                        console.log('[TodayInsight] Saving mood flow (old format):', response.mood_flow);
                        const dominant = response.mood_flow[0]?.mood || 'neutral';
                        await upsertDailyMoodFlow(userId, dateKey, {
                            segments: response.mood_flow,
                            dominant,
                            totalCaptures: todayCaptures.length,
                            // Preserve existing title/subtitle if available
                            title: existingFlow?.title,
                            subtitle: existingFlow?.subtitle,
                            confidence: existingFlow?.confidence,
                        });
                    } else {
                        console.warn('[TodayInsight] Unrecognized mood_flow format:', response.mood_flow);
                    }
                }

                set({
                    status: 'success',
                    text: response.text,
                    requestId: response.requestId || null,
                    lastUpdated: new Date(),
                    error: null,
                    hasGeneratedToday: true,
                    dateKey: getLocalDayKey(new Date()),
                });

                // Persist to insight_history for fast-load on next app start
                const today = new Date();
                try {
                    await upsertInsightHistory(
                        userId, 'daily', today, today,
                        response.text, undefined,
                        todayCaptures.map(c => c.id)
                    );
                } catch (e) {
                    console.warn('[TodayInsight] Failed to persist to insight_history:', e);
                }

                return;
            }

            if (response.error) {
                set({
                    status: 'error',
                    error: {
                        stage: response.error.stage,
                        message: response.error.message,
                        requestId: response.requestId,
                    },
                    requestId: response.requestId || null,
                });
                return;
            }

            set({
                status: 'error',
                error: {
                    stage: 'parse',
                    message: 'Unexpected response shape',
                },
                requestId: response.requestId || null,
            });
        } catch (error: any) {
            set({
                status: 'error',
                error: {
                    stage: 'unknown',
                    message: error?.message || 'Unexpected error',
                },
                requestId: null,
            });
        }
    },

    checkMidnightReset: () => {
        const today = getLocalDayKey(new Date());
        const { dateKey } = get();

        if (dateKey && dateKey !== today) {
            set({
                status: 'idle',
                text: null,
                error: null,
                hasGeneratedToday: false,
                hasLoadedSnapshot: false, // Allow re-loading snapshot for new day
                dateKey: today,
                requestId: null,
            });
        }
    },

    clearError: () => set({ error: null }),

    // Legacy compatibility: pending computation no-op (stores no longer track pending)
    computePending: () => undefined,
}));


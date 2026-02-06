import { create } from 'zustand';
import { Capture } from '@/types/capture';
import { getLocalDayKey } from '@/lib/utils';
import { callDaily } from '@/services/dailyInsightClient';
import { getCapturesForDaily, CaptureData } from '@/lib/captureData';
import { getMoodLabel } from '@/lib/moodUtils';
import { getTimeBucketForDate, getDayPart } from '@/lib/insightTime';

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

    // Actions
    setTodayInsight: (text: string | null) => void;
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

    setTodayInsight: (text) => {
        set({
            status: 'success',
            text,
            error: null,
            lastUpdated: new Date(),
            dateKey: getLocalDayKey(new Date()),
        });
    },

    refreshTodayInsight: async (_userId, tone, customTonePrompt, allCaptures) => {
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
                set({
                    status: 'success',
                    text: response.text,
                    requestId: response.requestId || null,
                    lastUpdated: new Date(),
                    error: null,
                    hasGeneratedToday: true,
                    dateKey: getLocalDayKey(new Date()),
                });
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
                dateKey: today,
                requestId: null,
            });
        }
    },

    clearError: () => set({ error: null }),

    // Legacy compatibility: pending computation no-op (stores no longer track pending)
    computePending: () => undefined,
}));


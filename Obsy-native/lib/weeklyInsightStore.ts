import { create } from 'zustand';
import { Capture } from '@/types/capture';
import { startOfWeek, format } from 'date-fns';
import { callWeekly } from '@/services/weeklyInsightClient';
import { getCapturesForWeek, CaptureData } from '@/lib/captureData';
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
                `[WeeklyInsight] Capture ${captureId}: mood_name_snapshot is empty, using resolved mood "${validResolved}"`
            );
        }
        return validResolved;
    }

    console.warn(
        `[WeeklyInsight] Capture ${captureId}: Both mood_name_snapshot and getMoodLabel failed, falling back to "Neutral". moodId: ${moodId}, snapshot: ${moodNameSnapshot}`
    );
    return "Neutral";
}

interface WeeklyInsightState {
    status: 'idle' | 'loading' | 'success' | 'error';
    text: string | null;
    error: {
        stage: string;
        message: string;
        requestId?: string;
    } | null;
    lastUpdated: Date | null;
    requestId: string | null;
    weekStart: Date | null;

    // Actions
    setWeeklyInsight: (text: string | null, weekStart: Date) => void;
    refreshWeeklyInsight: (
        userId: string,
        tone: string,
        customTonePrompt: string | undefined,
        allCaptures: Capture[],
        targetDate?: Date
    ) => Promise<void>;
    clearError: () => void;
    computePending: (captures: Capture[]) => void;
}

export const useWeeklyInsight = create<WeeklyInsightState>((set, get) => ({
    status: 'idle',
    text: null,
    error: null,
    lastUpdated: null,
    requestId: null,
    weekStart: null,

    setWeeklyInsight: (text, weekStart) => {
        set({
            status: 'success',
            text,
            weekStart,
            error: null,
            lastUpdated: new Date(),
        });
    },

    refreshWeeklyInsight: async (_userId, tone, customTonePrompt, allCaptures, targetDate) => {
        if (get().status === 'loading') return;

        set({ status: 'loading', error: null });

        try {
            const effectiveDate = targetDate ?? new Date();
            const weekStart = startOfWeek(effectiveDate, { weekStartsOn: 0 });
            console.log('[WEEKLY_RANGE]', {
                weekStart: weekStart.toISOString(),
                effectiveDate: effectiveDate?.toISOString()
            });
            const captures = getCapturesForWeek(weekStart, allCaptures, effectiveDate);
            console.log('[WEEKLY_FETCHED_CAPTURES] count:', captures.length, 'from', allCaptures.length, 'range:', {
                start: weekStart.toISOString(),
                end: effectiveDate?.toISOString(),
            });

            if (!captures.length) {
                console.log(
                    '[WEEKLY_INSIGHT] No captures found for week',
                    {
                        weekStart: weekStart.toISOString().slice(0, 10),
                        effectiveDate: effectiveDate.toISOString().slice(0, 10),
                        count: captures.length,
                    }
                );
                set({ status: 'idle', text: null, requestId: null, lastUpdated: new Date(), weekStart });
                return;
            }

            const captureData: CaptureData[] = captures.map((c) => {
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

            // Safety check: prevents malformed mood values from reaching the edge function.
            const invalidCaptures = captureData.filter((c) => !validateMoodString(c.mood));
            if (invalidCaptures.length > 0) {
                console.error(
                    `[WeeklyInsight] Found ${invalidCaptures.length} captures with invalid mood values after resolution. This should never happen.`,
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

            const startLabel = format(weekStart, 'MMM d');
            const endLabel = format(effectiveDate, 'MMM d');
            const weekLabel = `Week of ${startLabel} - ${endLabel}`;

            console.log('[WEEKLY_PAYLOAD_TO_SEND]', {
                weekLabel,
                captureCount: captureData.length,
                sampleMoods: captureData.slice(0, 3).map(c => c.mood),
                dateRange: {
                    start: weekStart.toISOString().slice(0, 10),
                    end: effectiveDate?.toISOString().slice(0, 10) || 'N/A'
                },
                tone
            });

            const response = await callWeekly(weekLabel, captureData, tone, customTonePrompt);

            if (response.ok && response.text) {
                set({
                    status: 'success',
                    text: response.text,
                    requestId: response.requestId || null,
                    lastUpdated: new Date(),
                    weekStart,
                    error: null,
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

    clearError: () => set({ error: null }),

    // Legacy compatibility: pending computation no-op
    computePending: () => undefined,
}));

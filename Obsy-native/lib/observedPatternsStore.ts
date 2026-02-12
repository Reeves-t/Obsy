import { create } from 'zustand';
import { Capture } from '@/types/capture';
import { getMoodLabel } from '@/lib/moodUtils';
import { getTimeBucketForDate, getDayPart } from '@/lib/insightTime';
import {
    callObservedPatterns,
    fetchObservedPattern,
    upsertObservedPattern,
    ObservedPatternsCaptureData,
} from '@/services/observedPatternsClient';

const GENERATION_THRESHOLD = 5;

interface ObservedPatternsState {
    status: 'idle' | 'loading' | 'success' | 'error' | 'locked';
    text: string | null;
    eligibleCount: number;
    lastGenCount: number;
    generationNumber: number;
    error: { stage: string; message: string; requestId?: string } | null;
    lastUpdated: Date | null;
    hasLoadedSnapshot: boolean;

    needsGeneration: () => boolean;
    isLocked: () => boolean;
    nextThreshold: () => number;

    loadSnapshot: (userId: string) => Promise<void>;
    refreshPatterns: (userId: string, allCaptures: Capture[]) => Promise<void>;
    updateEligibleCount: (allCaptures: Capture[]) => void;
}

function validateMoodString(mood: string | null | undefined): string | null {
    if (!mood || typeof mood !== 'string') return null;
    const trimmed = mood.trim();
    return trimmed.length > 0 ? trimmed : null;
}

export const useObservedPatterns = create<ObservedPatternsState>((set, get) => ({
    status: 'idle',
    text: null,
    eligibleCount: 0,
    lastGenCount: 0,
    generationNumber: 0,
    error: null,
    lastUpdated: null,
    hasLoadedSnapshot: false,

    needsGeneration: () => {
        const { eligibleCount, lastGenCount } = get();
        if (eligibleCount < GENERATION_THRESHOLD) return false;
        if (lastGenCount === 0) return true; // First generation
        return (eligibleCount - lastGenCount) >= GENERATION_THRESHOLD;
    },

    isLocked: () => {
        return get().eligibleCount < GENERATION_THRESHOLD;
    },

    nextThreshold: () => {
        const { lastGenCount, eligibleCount } = get();
        if (eligibleCount < GENERATION_THRESHOLD) return GENERATION_THRESHOLD;
        return lastGenCount + GENERATION_THRESHOLD;
    },

    updateEligibleCount: (allCaptures: Capture[]) => {
        const eligible = allCaptures.filter(c => c.includeInInsights !== false);
        const count = eligible.length;
        const current = get();

        set({ eligibleCount: count });

        // Update locked status if needed
        if (count < GENERATION_THRESHOLD && current.status !== 'loading') {
            set({ status: current.text ? 'success' : 'locked' });
        }
    },

    loadSnapshot: async (userId: string) => {
        if (get().hasLoadedSnapshot) return;

        try {
            const stored = await fetchObservedPattern(userId);
            if (stored) {
                set({
                    text: stored.pattern_text,
                    lastGenCount: stored.eligible_capture_count,
                    generationNumber: stored.generation_number,
                    status: 'success',
                    lastUpdated: new Date(stored.updated_at),
                    hasLoadedSnapshot: true,
                });
            } else {
                set({ hasLoadedSnapshot: true, status: 'idle' });
            }
        } catch (error) {
            console.error('[ObservedPatterns] loadSnapshot failed:', error);
            set({ hasLoadedSnapshot: true });
        }
    },

    refreshPatterns: async (userId: string, allCaptures: Capture[]) => {
        const state = get();
        if (state.status === 'loading') return;

        const eligible = allCaptures.filter(c => c.includeInInsights !== false);
        const eligibleCount = eligible.length;

        if (eligibleCount < GENERATION_THRESHOLD) {
            set({ status: 'locked', eligibleCount });
            return;
        }

        set({ status: 'loading', error: null, eligibleCount });

        try {
            const captureData: ObservedPatternsCaptureData[] = eligible
                .sort((a, b) =>
                    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                )
                .map(c => {
                    const date = new Date(c.created_at);
                    const mood = validateMoodString(c.mood_name_snapshot)
                        || validateMoodString(getMoodLabel(c.mood_id))
                        || 'Neutral';
                    return {
                        mood,
                        note: c.note ?? undefined,
                        obsyNote: c.obsy_note ?? undefined,
                        capturedAt: c.created_at,
                        tags: c.tags ?? [],
                        timeBucket: getTimeBucketForDate(date),
                        dayPart: getDayPart(date),
                    };
                });

            const newGenNumber = state.generationNumber + 1;

            const response = await callObservedPatterns(
                captureData,
                state.text,
                newGenNumber,
                eligibleCount,
            );

            if (response.ok && response.text) {
                await upsertObservedPattern(
                    userId,
                    response.text,
                    eligibleCount,
                    newGenNumber,
                );

                set({
                    status: 'success',
                    text: response.text,
                    lastGenCount: eligibleCount,
                    generationNumber: newGenNumber,
                    lastUpdated: new Date(),
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
                });
            }
        } catch (error: any) {
            set({
                status: 'error',
                error: { stage: 'unknown', message: error?.message || 'Unexpected error' },
            });
        }
    },
}));

import { create } from 'zustand';
import { Capture } from '@/types/capture';
import { getMoodLabel } from '@/lib/moodUtils';
import {
    callPatternKeywords,
    fetchPatternKeywords,
    upsertPatternKeywords,
    PatternKeywordsCaptureData,
} from '@/services/patternKeywordsClient';
import type {
    PatternKeywordsPayload,
    PatternKeywordsChangeResult,
    PatternTheme,
} from '@/types/patternKeywords';

const MIN_ELIGIBLE = 8;

interface PatternKeywordsState {
    status: 'idle' | 'loading' | 'success' | 'error' | 'locked';
    payload: PatternKeywordsPayload | null;
    eligibleCount: number;
    generationNumber: number;
    lastEmergingId: string | null;
    error: { stage: string; message: string; requestId?: string } | null;
    lastUpdated: Date | null;
    hasLoadedSnapshot: boolean;
    lastChange: PatternKeywordsChangeResult | null;

    isLocked: () => boolean;

    loadSnapshot: (userId: string) => Promise<void>;
    refreshPatterns: (userId: string, allCaptures: Capture[]) => Promise<PatternKeywordsChangeResult>;
    updateEligibleCount: (allCaptures: Capture[]) => void;
    clearLastChange: () => void;
    clearError: () => void;
}

function validateMoodString(mood: string | null | undefined): string | null {
    if (!mood || typeof mood !== 'string') return null;
    const trimmed = mood.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function getEmergingTheme(payload: PatternKeywordsPayload | null): PatternTheme | null {
    return payload?.emerging?.[0] ?? null;
}

export const usePatternKeywords = create<PatternKeywordsState>((set, get) => ({
    status: 'idle',
    payload: null,
    eligibleCount: 0,
    generationNumber: 0,
    lastEmergingId: null,
    error: null,
    lastUpdated: null,
    hasLoadedSnapshot: false,
    lastChange: null,

    isLocked: () => get().eligibleCount < MIN_ELIGIBLE,

    updateEligibleCount: (allCaptures: Capture[]) => {
        const count = allCaptures.filter(c => c.includeInInsights !== false).length;
        const current = get();
        set({ eligibleCount: count });
        if (count < MIN_ELIGIBLE && current.status !== 'loading') {
            set({ status: current.payload ? 'success' : 'locked' });
        }
    },

    loadSnapshot: async (userId: string) => {
        if (get().hasLoadedSnapshot) return;

        try {
            const stored = await fetchPatternKeywords(userId);
            if (stored) {
                set({
                    payload: stored.payload,
                    generationNumber: stored.generation_number,
                    lastEmergingId: stored.last_emerging_id ?? getEmergingTheme(stored.payload)?.id ?? null,
                    status: 'success',
                    lastUpdated: new Date(stored.updated_at),
                    hasLoadedSnapshot: true,
                });
            } else {
                set({ hasLoadedSnapshot: true, status: 'idle' });
            }
        } catch (error) {
            console.error('[PatternKeywords] loadSnapshot failed:', error);
            set({ hasLoadedSnapshot: true });
        }
    },

    refreshPatterns: async (userId: string, allCaptures: Capture[]): Promise<PatternKeywordsChangeResult> => {
        const state = get();
        if (state.status === 'loading') return { kind: 'none' };

        const eligible = allCaptures.filter(c => c.includeInInsights !== false);
        const eligibleCount = eligible.length;

        if (eligibleCount < MIN_ELIGIBLE) {
            set({ status: 'locked', eligibleCount });
            return { kind: 'none' };
        }

        set({ status: 'loading', error: null, eligibleCount });

        try {
            const sorted = [...eligible].sort((a, b) =>
                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );

            const captureData: PatternKeywordsCaptureData[] = sorted.map(c => {
                const mood = validateMoodString(c.mood_name_snapshot)
                    || validateMoodString(getMoodLabel(c.mood_id))
                    || 'Neutral';
                return {
                    mood,
                    note: c.note ?? undefined,
                    obsyNote: c.obsy_note ?? undefined,
                    capturedAt: c.created_at,
                    tags: c.tags ?? [],
                    entryType: (c.source_type as PatternKeywordsCaptureData['entryType']) ?? 'capture',
                    sharedLinkPlatform: c.shared_link_platform ?? null,
                    sharedLinkTitle: c.shared_link_title ?? null,
                    sharedLinkDigest: c.shared_link_digest ?? null,
                };
            });

            const previousEmergingId = state.lastEmergingId ?? getEmergingTheme(state.payload)?.id ?? null;

            const response = await callPatternKeywords(captureData, previousEmergingId);

            if (response.ok && response.payload) {
                const newEmerging = getEmergingTheme(response.payload);
                const newEmergingId = newEmerging?.id ?? null;
                const isNewEmerging = !!newEmergingId && newEmergingId !== previousEmergingId;

                const newGenNumber = state.generationNumber + 1;

                await upsertPatternKeywords(
                    userId,
                    response.payload,
                    eligibleCount,
                    newGenNumber,
                    newEmergingId,
                );

                const change: PatternKeywordsChangeResult = isNewEmerging && newEmerging
                    ? { kind: 'new-emerging', theme: newEmerging }
                    : { kind: 'none' };

                set({
                    status: 'success',
                    payload: response.payload,
                    generationNumber: newGenNumber,
                    lastEmergingId: newEmergingId,
                    lastUpdated: new Date(),
                    error: null,
                    lastChange: change,
                });

                return change;
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
            return { kind: 'none' };
        } catch (error: any) {
            set({
                status: 'error',
                error: { stage: 'unknown', message: error?.message || 'Unexpected error' },
            });
            return { kind: 'none' };
        }
    },

    clearLastChange: () => set({ lastChange: null }),
    clearError: () => set({ error: null }),
}));

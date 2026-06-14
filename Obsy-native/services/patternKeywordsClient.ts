import { supabase } from '@/lib/supabase';
import type { PatternKeywordsPayload, StoredPatternKeywords } from '@/types/patternKeywords';

export interface PatternKeywordsCaptureData {
    mood: string;
    note?: string;
    obsyNote?: string;
    capturedAt: string;
    tags?: string[];
    entryType?: 'capture' | 'journal' | 'voice' | 'shared_link';
    sharedLinkPlatform?: string | null;
    sharedLinkTitle?: string | null;
    sharedLinkDigest?: string | null;
}

export interface PatternKeywordsResponse {
    ok: boolean;
    payload?: PatternKeywordsPayload;
    requestId?: string;
    error?: {
        stage: string;
        message: string;
        status: number;
    };
}

export async function callPatternKeywords(
    captures: PatternKeywordsCaptureData[],
    previousEmergingId: string | null,
): Promise<PatternKeywordsResponse> {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
        return {
            ok: false,
            error: { stage: 'auth', message: 'Authentication required', status: 401 },
        };
    }

    try {
        const response = await supabase.functions.invoke('generate-pattern-keywords', {
            body: { captures, previousEmergingId },
            headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (response.error) {
            return {
                ok: false,
                error: {
                    stage: 'fetch',
                    message: response.error.message || 'Network error',
                    status: (response.error as any)?.status ?? 500,
                },
            };
        }

        const data = response.data;
        if (!data || typeof data !== 'object') {
            return {
                ok: false,
                error: { stage: 'parse', message: 'Invalid response format', status: 500 },
            };
        }

        return data as PatternKeywordsResponse;
    } catch (error: any) {
        return {
            ok: false,
            error: { stage: 'unknown', message: error?.message || 'Unexpected error', status: 500 },
        };
    }
}

export async function fetchPatternKeywords(userId: string): Promise<StoredPatternKeywords | null> {
    const { data, error } = await supabase
        .from('pattern_keywords')
        .select('payload, eligible_capture_count, generation_number, last_emerging_id, updated_at')
        .eq('user_id', userId)
        .maybeSingle();

    if (error || !data) return null;
    return data as StoredPatternKeywords;
}

export async function upsertPatternKeywords(
    userId: string,
    payload: PatternKeywordsPayload,
    eligibleCount: number,
    generationNumber: number,
    lastEmergingId: string | null,
): Promise<void> {
    const { error } = await supabase
        .from('pattern_keywords')
        .upsert(
            {
                user_id: userId,
                payload,
                eligible_capture_count: eligibleCount,
                generation_number: generationNumber,
                last_emerging_id: lastEmergingId,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' }
        );

    if (error) {
        console.error('[PatternKeywords] Failed to upsert:', error);
        throw error;
    }
}

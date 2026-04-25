import { supabase } from '@/lib/supabase';
import type { ChatMessage } from '@/lib/moodverseStore';

export interface CaptureContext {
    id: string;
    mood: string;
    note?: string;
    tags?: string[];
    date: string;
    clusterId?: string;
}

export interface ExplainResponse {
    ok: boolean;
    text?: string;
    highlightedMoods?: string[];
    requestId?: string;
    error?: {
        stage: string;
        message: string;
        status: number;
    };
}

export async function callMoodverseExplain(
    captures: CaptureContext[],
    selectionMode: 'single' | 'multi' | 'cluster',
    messages: ChatMessage[],
    moodverseContext?: string,
): Promise<ExplainResponse> {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
        return {
            ok: false,
            error: { stage: 'auth', message: 'Authentication required', status: 401 },
        };
    }

    try {
        console.log('[MoodverseExplain] Invoking edge function with', captures.length, 'captures,', messages.length, 'messages');

        const response = await supabase.functions.invoke('moodverse-explain', {
            body: {
                captures,
                selectionMode,
                messages: messages.map((m) => ({ role: m.role, text: m.text })),
                moodverseContext,
            },
            headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (response.error) {
            console.error('[MoodverseExplain] Edge function error:', response.error);
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
        console.log('[MoodverseExplain] Response data:', JSON.stringify(data).slice(0, 200));

        if (!data || typeof data !== 'object') {
            return {
                ok: false,
                error: { stage: 'parse', message: 'Invalid response', status: 500 },
            };
        }

        return data as ExplainResponse;
    } catch (error: any) {
        console.error('[MoodverseExplain] Exception:', error?.message);
        return {
            ok: false,
            error: { stage: 'unknown', message: error?.message || 'Unexpected error', status: 500 },
        };
    }
}

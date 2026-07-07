import { supabase } from '@/lib/supabase';
import type { TopicPulseCard } from '@/lib/topicAiTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Topic Pulse client — the DeepSeek-powered "Explore this topic" engager.
//
// PRIVACY: this client sends ONLY non-sensitive topic metadata to the
// `topic-pulse` edge function — title, description, lens label, tone label,
// response-energy label, and the action. It intentionally does NOT use
// buildTopicDigest() and never sends captures, notes, moods, stats, dates or
// any personal data. Keep this surface minimal — the safe-by-construction
// payload is the whole point.
// ─────────────────────────────────────────────────────────────────────────────

export type TopicPulseAction =
    | 'initial_pulse'  // first auto-load per topic per day — FREE, never counted
    | 'refresh_pulse'
    | 'give_me_ideas'
    | 'ask_question'
    | 'teach_me_something'
    | 'make_mini_plan';

/** The only fields that ever leave the device for Topic Pulse. */
export interface TopicPulseMeta {
    topicTitle: string;
    topicDescription: string;
    topicLens: string;       // lens LABEL (e.g. "Learning"), never the raw id
    tone: string;            // tone LABEL (e.g. "Neutral")
    responseEnergy: string;  // depth LABEL (e.g. "Balanced")
}

export interface TopicPulseUsage {
    used: number;
    limit: number;
    remaining: number;
    tier: 'free' | 'plus';
}

export interface TopicPulseResult {
    ok: boolean;
    cards?: TopicPulseCard[];
    usage?: TopicPulseUsage;
    error?: { stage: string; message: string; status: number };
}

export async function generateTopicPulse(
    meta: TopicPulseMeta,
    action: TopicPulseAction,
): Promise<TopicPulseResult> {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
        return { ok: false, error: { stage: 'auth', message: 'Authentication required', status: 401 } };
    }

    // Explicitly construct the body so nothing sensitive can leak in by accident.
    const body = {
        topicTitle: meta.topicTitle,
        topicDescription: meta.topicDescription,
        topicLens: meta.topicLens,
        tone: meta.tone,
        responseEnergy: meta.responseEnergy,
        action,
    };

    try {
        const response = await supabase.functions.invoke('topic-pulse', {
            body,
            headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (response.error) {
            // Try to surface the structured body (e.g. a 429 with usage info).
            const parsed = await readErrorBody(response.error);
            return {
                ok: false,
                usage: parsed?.usage,
                error: {
                    stage: parsed?.error?.stage ?? 'fetch',
                    message: parsed?.error?.message ?? response.error.message ?? 'Network error',
                    status: parsed?.error?.status ?? 500,
                },
            };
        }

        const data = response.data as any;
        if (!data || typeof data !== 'object' || !Array.isArray(data.cards)) {
            return { ok: false, error: { stage: 'parse', message: 'Invalid response', status: 500 } };
        }

        return {
            ok: true,
            cards: data.cards as TopicPulseCard[],
            usage: data.usage as TopicPulseUsage | undefined,
        };
    } catch (error: any) {
        return { ok: false, error: { stage: 'unknown', message: error?.message || 'Unexpected error', status: 500 } };
    }
}

/**
 * supabase-js wraps non-2xx responses in a FunctionsHttpError whose `context`
 * is the raw Response. Pull the JSON body out so callers can read `usage` on a
 * 429 (out of refreshes). Best-effort: returns null if anything goes wrong.
 */
async function readErrorBody(
    error: any,
): Promise<{ error?: { stage?: string; message?: string; status?: number }; usage?: TopicPulseUsage } | null> {
    try {
        const ctx = error?.context;
        if (ctx && typeof ctx.json === 'function') {
            return await ctx.json();
        }
    } catch {
        // ignore — fall through to null
    }
    return null;
}

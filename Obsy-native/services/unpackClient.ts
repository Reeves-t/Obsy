import { supabase } from '@/lib/supabase';
import { getProfile } from '@/services/profile';
import type {
    UnpackContext,
    UnpackQuestion,
    UnpackReflection,
    UnpackUsage,
} from '@/lib/unpack/types';

/**
 * Client for the `unpack-reflection` edge function (Plus-only guided reflection).
 * Two steps: generate 3 clarifying questions, then generate a reviewable draft.
 * Also exposes a raw-URL link preview that digests a shared link WITHOUT saving
 * an entry (used during Unpack enrichment).
 */

/** The flattened context the edge function expects. */
interface UnpackEdgeContext {
    type: UnpackContext['type'];
    text?: string;
    transcript?: string;
    imageBase64?: string;
    imageMimeType?: string;
    imageContext?: string;
    linkSummary?: string;
    linkTitle?: string;
    source?: string;
}

interface UnpackErrorEnvelope {
    ok: false;
    requestId?: string;
    error: { stage: string; message: string; status: number };
    usage?: UnpackUsage;
}

export interface UnpackQuestionsSuccess {
    ok: true;
    requestId: string;
    questions: UnpackQuestion[];
    imageContext: string | null;
    usage?: UnpackUsage;
}

export interface UnpackReflectionSuccess {
    ok: true;
    requestId: string;
    reflection: UnpackReflection;
    imageContext: string | null;
    usage?: UnpackUsage;
}

export type UnpackQuestionsResponse = UnpackQuestionsSuccess | UnpackErrorEnvelope;
export type UnpackReflectionResponse = UnpackReflectionSuccess | UnpackErrorEnvelope;

export interface LinkPreviewResult {
    ok: boolean;
    digest?: string | null;
    mediaType?: string | null;
    title?: string | null;
    thumbnailUrl?: string | null;
    source?: string | null;
    error?: string;
}

const authError = (): UnpackErrorEnvelope => ({
    ok: false,
    error: { stage: 'auth', message: 'Authentication required', status: 401 },
});

/** Flatten the store's UnpackContext into the edge function's context shape. */
function toEdgeContext(context: UnpackContext, includeImageBase64: boolean): UnpackEdgeContext {
    return {
        type: context.type,
        text: context.text || undefined,
        transcript: context.transcript || undefined,
        imageBase64: includeImageBase64 ? context.imageBase64 || undefined : undefined,
        imageMimeType: context.imageMimeType || undefined,
        imageContext: context.imageContext || undefined,
        linkSummary: context.sharedLink?.summary || undefined,
        linkTitle: context.sharedLink?.title || undefined,
        source: context.sharedLink?.source || undefined,
    };
}

async function resolveProfileContext(): Promise<string | undefined> {
    try {
        const profile = await getProfile();
        return profile?.profile_context ?? undefined;
    } catch {
        return undefined;
    }
}

export async function generateUnpackQuestions(
    context: UnpackContext,
    mood: { id?: string | null; name: string }
): Promise<UnpackQuestionsResponse> {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) return authError();

    const profileContext = await resolveProfileContext();

    try {
        const response = await supabase.functions.invoke('unpack-reflection', {
            body: {
                step: 'questions',
                context: toEdgeContext(context, true),
                mood: { id: mood.id ?? undefined, name: mood.name },
                profileContext,
            },
            headers: { Authorization: `Bearer ${session.access_token}` },
        });
        return normalizeResponse<UnpackQuestionsResponse>(response);
    } catch (error: any) {
        return {
            ok: false,
            error: { stage: 'unknown', message: error?.message || 'Unexpected error', status: 500 },
        };
    }
}

export async function generateUnpackReflection(
    context: UnpackContext,
    mood: { id?: string | null; name: string },
    questions: { question: string; answer: string; skipped: boolean }[]
): Promise<UnpackReflectionResponse> {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) return authError();

    const profileContext = await resolveProfileContext();

    try {
        const response = await supabase.functions.invoke('unpack-reflection', {
            body: {
                step: 'reflection',
                // Image already described during the questions step → don't resend base64.
                context: toEdgeContext(context, false),
                mood: { id: mood.id ?? undefined, name: mood.name },
                questions,
                profileContext,
            },
            headers: { Authorization: `Bearer ${session.access_token}` },
        });
        return normalizeResponse<UnpackReflectionResponse>(response);
    } catch (error: any) {
        return {
            ok: false,
            error: { stage: 'unknown', message: error?.message || 'Unexpected error', status: 500 },
        };
    }
}

/**
 * Digest a shared link by URL without saving an entry. Never throws; resolves
 * with `{ ok: false }` so the flow can degrade to title + platform only.
 */
export async function requestLinkPreview(
    url: string,
    platform?: string | null,
    title?: string | null
): Promise<LinkPreviewResult> {
    try {
        const { data: sessionData } = await supabase.auth.getSession();
        const session = sessionData.session;
        if (!session) return { ok: false, error: 'no_session' };

        const response = await supabase.functions.invoke('digest-shared-link', {
            body: { url, platform: platform ?? undefined, title: title ?? undefined },
            headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (response.error) {
            return { ok: false, error: response.error.message ?? 'invoke_error' };
        }
        const data = response.data as LinkPreviewResult | null;
        if (!data || typeof data !== 'object') return { ok: false, error: 'bad_response' };
        return data;
    } catch (err: any) {
        return { ok: false, error: err?.message ?? 'unknown' };
    }
}

function normalizeResponse<T>(response: { data: unknown; error: any }): T {
    if (response.error) {
        // Edge function returned a non-2xx with a JSON body → pass it through.
        if (response.data && typeof response.data === 'object') {
            return response.data as T;
        }
        return {
            ok: false,
            error: {
                stage: 'fetch',
                message: response.error.message || 'Network error',
                status: (response.error as any)?.status ?? 500,
            },
        } as T;
    }
    if (!response.data || typeof response.data !== 'object') {
        return {
            ok: false,
            error: { stage: 'parse', message: 'Invalid response format', status: 500 },
        } as T;
    }
    return response.data as T;
}

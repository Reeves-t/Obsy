import { supabase } from '@/lib/supabase';

export interface LinkDigestResult {
    ok: boolean;
    entryId?: string;
    digest?: string | null;
    mediaType?: string | null;
    title?: string | null;
    thumbnailUrl?: string | null;
    error?: string;
}

/**
 * Ask the backend to digest a shared-link entry with Gemini (content summary,
 * media type, real title, thumbnail). Fire-and-forget from the save flow — the
 * entry is already saved with the title/platform fallback before this runs.
 *
 * Never throws; resolves with `{ ok: false }` on any failure so callers can
 * safely ignore the result.
 */
export async function requestLinkDigest(entryId: string): Promise<LinkDigestResult> {
    try {
        const { data: sessionData } = await supabase.auth.getSession();
        const session = sessionData.session;
        if (!session) return { ok: false, error: 'no_session' };

        const response = await supabase.functions.invoke('digest-shared-link', {
            body: { entryId },
            headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (response.error) {
            return { ok: false, error: response.error.message ?? 'invoke_error' };
        }

        const data = response.data as LinkDigestResult | null;
        if (!data || typeof data !== 'object') {
            return { ok: false, error: 'bad_response' };
        }
        return data;
    } catch (err: any) {
        return { ok: false, error: err?.message ?? 'unknown' };
    }
}

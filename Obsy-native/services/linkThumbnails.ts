/**
 * Signed-URL access for re-hosted shared-link thumbnails.
 *
 * The `link-thumbnails` bucket is private (it mirrors content a user saved
 * privately), so every read goes through createSignedUrl — the same contract as
 * topic attachments. Signed URLs are cached in memory until shortly before they
 * expire, because a feed can ask for the same thumbnail on every re-render.
 */

import { supabase } from '@/lib/supabase';

const BUCKET = 'link-thumbnails';
const SIGNED_URL_TTL_SEC = 3600;
/** Re-sign this long before true expiry so an in-flight render never 403s. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

interface CacheEntry {
    url: string;
    expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
/** De-dupes concurrent signing requests for the same path. */
const inflight = new Map<string, Promise<string | null>>();

/**
 * Resolves a storage path to a temporary signed URL.
 * Returns null when the path is missing or signing fails — callers fall back to
 * the original (possibly expiring) CDN URL, then to a platform card.
 */
export async function getLinkThumbnailUrl(path: string | null | undefined): Promise<string | null> {
    if (!path) return null;

    const cached = cache.get(path);
    if (cached && cached.expiresAt > Date.now() + REFRESH_MARGIN_MS) {
        return cached.url;
    }

    const pending = inflight.get(path);
    if (pending) return pending;

    const request = (async () => {
        try {
            const { data, error } = await supabase.storage
                .from(BUCKET)
                .createSignedUrl(path, SIGNED_URL_TTL_SEC);

            if (error || !data?.signedUrl) return null;

            cache.set(path, {
                url: data.signedUrl,
                expiresAt: Date.now() + SIGNED_URL_TTL_SEC * 1000,
            });
            return data.signedUrl;
        } catch {
            return null;
        } finally {
            inflight.delete(path);
        }
    })();

    inflight.set(path, request);
    return request;
}

/** Drops cached signed URLs. Call on sign-out so a new session re-signs. */
export function clearLinkThumbnailCache(): void {
    cache.clear();
    inflight.clear();
}

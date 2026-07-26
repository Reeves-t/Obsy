/**
 * Resolves the image URI for a shared-link card.
 *
 * Prefers the re-hosted copy in our private bucket (signed on demand) and falls
 * back to the source CDN URL, which for TikTok/Meta links is signed by the
 * platform and expires within days — the fallback covers entries saved before
 * re-hosting existed, and re-hosts that failed.
 *
 * Returns null when there is no usable image, which is the card's cue to render
 * a text or monogram tier instead.
 */

import { useEffect, useState } from 'react';
import { getLinkThumbnailUrl } from '@/services/linkThumbnails';

export function useLinkThumbnail(
    path: string | null | undefined,
    fallbackUrl: string | null | undefined,
): string | null {
    const [uri, setUri] = useState<string | null>(() => (path ? null : fallbackUrl ?? null));

    useEffect(() => {
        let cancelled = false;

        if (!path) {
            setUri(fallbackUrl ?? null);
            return;
        }

        // Show the fallback (if any) while the signed URL resolves, so the card
        // does not flash empty on first paint.
        setUri(fallbackUrl ?? null);

        getLinkThumbnailUrl(path).then((signed) => {
            if (!cancelled && signed) setUri(signed);
        });

        return () => { cancelled = true; };
    }, [path, fallbackUrl]);

    return uri;
}

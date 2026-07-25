/**
 * Shared Link Service
 *
 * Handles platform detection and URL metadata extraction for shared link entries.
 * MVP scope: extract platform + title from URL/path only.
 * No full-page scraping, no external media downloading.
 */

export type SharedLinkPlatform =
    | 'TikTok'
    | 'YouTube'
    | 'Reddit'
    | 'Instagram'
    | 'Spotify'
    | 'Twitter'
    | 'Tumblr'
    | 'Twitch'
    | 'Web';

export interface SharedLinkMetadata {
    url: string;
    platform: SharedLinkPlatform;
    title: string | null;
    domain: string;
}

// Maps hostname substrings → platform label
const PLATFORM_MAP: Array<{ pattern: RegExp; label: SharedLinkPlatform }> = [
    { pattern: /tiktok\.com/i, label: 'TikTok' },
    { pattern: /youtube\.com|youtu\.be/i, label: 'YouTube' },
    { pattern: /reddit\.com/i, label: 'Reddit' },
    { pattern: /instagram\.com/i, label: 'Instagram' },
    { pattern: /spotify\.com/i, label: 'Spotify' },
    { pattern: /twitter\.com|x\.com/i, label: 'Twitter' },
    { pattern: /tumblr\.com/i, label: 'Tumblr' },
    { pattern: /twitch\.tv/i, label: 'Twitch' },
];

/**
 * Detects the platform from a URL hostname.
 * Falls back to 'Web' if no known platform is matched.
 */
export function detectPlatform(url: string): SharedLinkPlatform {
    try {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase();
        for (const { pattern, label } of PLATFORM_MAP) {
            if (pattern.test(host)) return label;
        }
    } catch {
        // Invalid URL — scan raw string as fallback
        for (const { pattern, label } of PLATFORM_MAP) {
            if (pattern.test(url)) return label;
        }
    }
    return 'Web';
}

/**
 * Extracts a human-readable domain label from a URL.
 * e.g. "https://www.reddit.com/r/..." → "reddit.com"
 */
export function extractDomain(url: string): string {
    try {
        const parsed = new URL(url);
        return parsed.hostname.replace(/^www\./, '');
    } catch {
        return url.split('/')[0] || url;
    }
}

/**
 * Attempts to derive a readable title from a URL path segment.
 * Converts slugs like "my-cool-video-title" → "My Cool Video Title".
 * Returns null if no useful title segment is found.
 *
 * This is a heuristic — no scraping, no external requests.
 */
export function extractTitleFromUrl(url: string, platform: SharedLinkPlatform): string | null {
    try {
        const parsed = new URL(url);
        const parts = parsed.pathname.split('/').filter(Boolean);

        switch (platform) {
            case 'Reddit': {
                // /r/subreddit/comments/id/title_slug
                const titleIndex = parts.findIndex(p => p === 'comments') + 2;
                if (titleIndex > 1 && parts[titleIndex]) {
                    return slugToTitle(parts[titleIndex]);
                }
                // fallback: subreddit name
                const rIndex = parts.indexOf('r');
                if (rIndex !== -1 && parts[rIndex + 1]) {
                    return `r/${parts[rIndex + 1]}`;
                }
                break;
            }
            case 'YouTube': {
                // youtube.com/watch?v=... → no slug title available
                // youtu.be/<id> → also no title
                return null;
            }
            case 'TikTok': {
                // /@username/video/id → use @username
                const atIndex = parts.findIndex(p => p.startsWith('@'));
                if (atIndex !== -1) return parts[atIndex];
                break;
            }
            case 'Instagram': {
                // /p/<code>/ or /reel/<code>/ — no useful title
                return null;
            }
            case 'Spotify': {
                // /track/<id> or /album/<id> or /playlist/<id>/<name>
                if (parts.length >= 2) {
                    const type = parts[parts.length - 2];
                    const name = parts[parts.length - 1];
                    if (['playlist', 'album', 'track', 'artist'].includes(type)) {
                        return slugToTitle(name);
                    }
                }
                break;
            }
            case 'Tumblr': {
                const postIndex = parts.indexOf('post');
                if (postIndex !== -1 && parts[postIndex + 2]) {
                    return slugToTitle(parts[postIndex + 2]);
                }
                if (parts[0] && !['dashboard', 'explore', 'search'].includes(parts[0])) {
                    return parts[0];
                }
                break;
            }
            case 'Twitch': {
                if (parts[0] === 'videos' && parts[1]) {
                    return `Twitch video ${parts[1]}`;
                }
                if (parts[0] && parts[0] !== 'directory') {
                    return parts[0];
                }
                break;
            }
            default: {
                // Generic: use the last meaningful path segment
                const lastSegment = parts[parts.length - 1];
                if (lastSegment && lastSegment.length > 3 && lastSegment.includes('-')) {
                    return slugToTitle(lastSegment);
                }
            }
        }
    } catch {
        // ignore invalid URL
    }
    return null;
}

/**
 * Converts a URL slug to a display title.
 * "my-cool-video-title" → "My Cool Video Title"
 */
function slugToTitle(slug: string): string {
    return slug
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
        .trim();
}

/**
 * Parses all shareable metadata from a URL in one call.
 * This is the primary entry point used by SaveSharedLinkModal.
 */
export function parseSharedLinkMetadata(rawUrl: string): SharedLinkMetadata {
    const url = rawUrl.trim();
    const platform = detectPlatform(url);
    const title = extractTitleFromUrl(url, platform);
    const domain = extractDomain(url);
    return { url, platform, title, domain };
}

/**
 * Returns the Ionicons icon name for a given platform.
 */
export function platformToIcon(platform: SharedLinkPlatform): string {
    switch (platform) {
        case 'YouTube': return 'logo-youtube';
        case 'Reddit': return 'logo-reddit';
        case 'TikTok': return 'musical-notes';
        case 'Instagram': return 'logo-instagram';
        case 'Spotify': return 'musical-note';
        case 'Twitter': return 'logo-twitter';
        case 'Tumblr': return 'logo-tumblr';
        case 'Twitch': return 'logo-twitch';
        default: return 'globe-outline';
    }
}

/**
 * Returns a brand color for a given platform (for the platform chip).
 */
export function platformToColor(platform: SharedLinkPlatform): string {
    switch (platform) {
        case 'YouTube': return '#FF0000';
        case 'Reddit': return '#FF4500';
        case 'TikTok': return '#69C9D0';
        case 'Instagram': return '#E1306C';
        case 'Spotify': return '#1DB954';
        case 'Twitter': return '#1DA1F2';
        case 'Tumblr': return '#36465D';
        case 'Twitch': return '#9146FF';
        default: return 'rgba(255,255,255,0.4)';
    }
}

/**
 * Two-stop gradient for a platform, used by text cards and the monogram
 * fallback so a link with no image still reads as *that platform* rather than
 * as a generic grey box.
 */
export function platformToGradient(platform: SharedLinkPlatform): [string, string] {
    switch (platform) {
        case 'YouTube': return ['#FF0000', '#8B0000'];
        case 'Reddit': return ['#FF4500', '#B22200'];
        case 'TikTok': return ['#69C9D0', '#EE1D52'];
        case 'Instagram': return ['#F09433', '#BC1888'];
        case 'Spotify': return ['#1DB954', '#0B6B2F'];
        case 'Twitter': return ['#1DA1F2', '#0B5C8F'];
        case 'Tumblr': return ['#36465D', '#1B2331'];
        case 'Twitch': return ['#9146FF', '#4B1D91'];
        default: return ['#4A5568', '#232A35'];
    }
}

/** Shape of a link's preview media, which drives how the card frames it. */
export type LinkAspect = 'portrait' | 'landscape' | 'square';

/**
 * The aspect a platform's media is shaped like.
 *
 * Keyed on the *class* of media rather than per-platform special cases, so a
 * new platform only needs to be slotted into one of three buckets. Portrait
 * media (TikTok, Reels, Shorts) is 9:16 and would letterbox badly in a 16:9
 * frame; the card fills the gap with a blurred copy of the image instead.
 */
export function platformAspect(
    platform: SharedLinkPlatform,
    mediaType?: string | null,
    url?: string | null,
): LinkAspect {
    // A YouTube Short is portrait despite YouTube being a landscape platform.
    if (platform === 'YouTube') {
        return url && /\/shorts\//i.test(url) ? 'portrait' : 'landscape';
    }
    if (platform === 'TikTok') return 'portrait';
    if (platform === 'Instagram') {
        return url && /\/(reel|reels)\//i.test(url) ? 'portrait' : 'square';
    }
    if (platform === 'Spotify') return 'square';
    if (mediaType === 'music' || mediaType === 'playlist' || mediaType === 'podcast') {
        return 'square';
    }
    if (platform === 'Twitch') return 'landscape';
    return 'landscape';
}

/** Numeric ratio for a given aspect, for `aspectRatio` styling. */
export function aspectRatioValue(aspect: LinkAspect): number {
    switch (aspect) {
        case 'portrait': return 3 / 4;   // framed shorter than true 9:16 so feed rows stay scannable
        case 'square': return 1;
        default: return 16 / 9;
    }
}

// ─────────────────────────────────────────────────────────────
// Deep Link / Share Extension Handler (scaffold)
// ─────────────────────────────────────────────────────────────

/**
 * Validates that a string is a usable URL for sharing.
 */
export function isValidShareUrl(input: string): boolean {
    try {
        const parsed = new URL(input.trim());
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * Extracts the first URL-like string from a share payload text.
 * Share extensions often send "Title - https://..." or just the URL.
 */
export function extractUrlFromSharePayload(text: string): string | null {
    const urlPattern = /https?:\/\/[^\s]+/i;
    const match = text.match(urlPattern);
    return match ? match[0] : null;
}

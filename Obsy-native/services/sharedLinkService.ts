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
        default: return 'rgba(255,255,255,0.4)';
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

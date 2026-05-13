/**
 * PlatformEmbed — Option A renderer for shared link previews.
 *
 * Renders the actual platform embed (Spotify player, YouTube video, TikTok
 * video, Instagram post, Twitter tweet) inside a WebView so users see the
 * real card each service ships. Lazy-mounts the WebView via
 * InteractionManager so initial list scroll isn't blocked.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * OPTION B FALLBACK (if Option A perf becomes a problem):
 * If many embeds in the Entries list make scroll janky on lower-end devices
 * or memory pressure builds, swap this for a lighter rendering path:
 *   1. Keep this component only for the CaptureDetail view.
 *   2. In the list (SharedLinkCard), render a static platform-themed card
 *      using thumbnails derived without WebView:
 *        - YouTube: https://img.youtube.com/vi/{id}/hqdefault.jpg
 *        - Spotify: use oEmbed (open.spotify.com/oembed?url=...) to fetch
 *                   thumbnail_url, cache once per entry.
 *        - TikTok / Instagram / Twitter: derive author / handle from URL,
 *          fall back to platform-themed cards (no scraping).
 *   3. Tapping a card opens the rich embed in the detail screen.
 * The SharedLinkCard already has the scaffolding for this — it currently
 * delegates rendering to PlatformEmbed but can easily be reverted to its
 * own thumbnail+text layout (see git history for the pre-embed version).
 * ─────────────────────────────────────────────────────────────────────────
 */

import React, { memo, useEffect, useMemo, useState } from 'react';
import {
    InteractionManager,
    StyleSheet,
    useWindowDimensions,
    View,
    ActivityIndicator,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/ui/ThemedText';
import {
    platformToColor,
    platformToIcon,
    type SharedLinkPlatform,
} from '@/services/sharedLinkService';

interface PlatformEmbedProps {
    url: string;
    platform: SharedLinkPlatform;
    isLight: boolean;
    /** Outer horizontal padding the parent applies; used to compute internal width. */
    horizontalPaddingTotal?: number;
}

type EmbedSource =
    | { kind: 'uri'; uri: string }
    | { kind: 'html'; html: string; baseUrl?: string };

interface EmbedConfig {
    source: EmbedSource;
    /** width / height; if absent, fixedHeight is used. */
    aspectRatio?: number;
    /** Absolute pixel height; takes precedence over aspectRatio when set. */
    fixedHeight?: number;
}

// ─── URL parsers ─────────────────────────────────────────────────────────
// These are exported so StaticLinkPreview (and any future callers) can reuse
// the same per-platform URL → identifier logic without duplicating it.

export function extractYouTubeId(url: string): string | null {
    try {
        const u = new URL(url);
        const host = u.hostname.replace(/^www\./, '');
        if (host === 'youtu.be') {
            const id = u.pathname.split('/').filter(Boolean)[0];
            return id || null;
        }
        if (host.endsWith('youtube.com')) {
            // /watch?v=ID
            const v = u.searchParams.get('v');
            if (v) return v;
            // /shorts/ID or /embed/ID or /live/ID
            const parts = u.pathname.split('/').filter(Boolean);
            if (parts.length >= 2 && ['shorts', 'embed', 'live'].includes(parts[0])) {
                return parts[1];
            }
        }
    } catch {
        // ignore
    }
    return null;
}

export function extractSpotifyEmbedPath(url: string): string | null {
    // Spotify: /track/{id}, /album/{id}, /playlist/{id}, /artist/{id}, /episode/{id}, /show/{id}
    try {
        const u = new URL(url);
        if (!/spotify\.com$/.test(u.hostname.replace(/^www\./, '').replace(/^open\./, ''))) {
            return null;
        }
        const parts = u.pathname.split('/').filter(Boolean);
        // Skip locale prefix like /intl-ja/
        const startIdx = parts[0]?.startsWith('intl-') ? 1 : 0;
        const type = parts[startIdx];
        const id = parts[startIdx + 1];
        if (!type || !id) return null;
        if (!['track', 'album', 'playlist', 'artist', 'episode', 'show'].includes(type)) return null;
        return `${type}/${id}`;
    } catch {
        return null;
    }
}

export function extractTikTokVideoId(url: string): string | null {
    try {
        const u = new URL(url);
        const parts = u.pathname.split('/').filter(Boolean);
        // /@user/video/ID
        const vIdx = parts.indexOf('video');
        if (vIdx !== -1 && parts[vIdx + 1]) return parts[vIdx + 1];
        // Short links (vm.tiktok.com/XYZ) require a redirect we can't follow client-side;
        // fall back to letting the WebView load the share URL directly.
    } catch {
        // ignore
    }
    return null;
}

export function extractInstagramCode(url: string): string | null {
    try {
        const u = new URL(url);
        const parts = u.pathname.split('/').filter(Boolean);
        const pIdx = parts.findIndex(p => p === 'p' || p === 'reel' || p === 'tv');
        if (pIdx !== -1 && parts[pIdx + 1]) return parts[pIdx + 1];
    } catch {
        // ignore
    }
    return null;
}

export function extractRedditPostPath(url: string): string | null {
    // Reddit URLs follow /r/{sub}/comments/{id}/{slug}/
    try {
        const u = new URL(url);
        if (!/reddit\.com$/.test(u.hostname.replace(/^www\./, '').replace(/^old\./, '').replace(/^new\./, ''))) {
            return null;
        }
        const parts = u.pathname.split('/').filter(Boolean);
        const cIdx = parts.indexOf('comments');
        if (cIdx === -1 || !parts[cIdx + 1]) return null;
        // Use /r/{sub}/comments/{id}/{slug} (slug optional) — drop everything else.
        const trimmed = parts.slice(0, cIdx + 3).join('/');
        return `/${trimmed}/`;
    } catch {
        return null;
    }
}

export function extractTweetId(url: string): string | null {
    try {
        const u = new URL(url);
        const host = u.hostname.replace(/^www\./, '');
        if (host !== 'twitter.com' && host !== 'x.com' && !host.endsWith('.x.com')) return null;
        const parts = u.pathname.split('/').filter(Boolean);
        const sIdx = parts.findIndex(p => p === 'status' || p === 'statuses');
        if (sIdx !== -1 && parts[sIdx + 1]) return parts[sIdx + 1].split('?')[0];
    } catch {
        // ignore
    }
    return null;
}

// ─── Embed config per platform ───────────────────────────────────────────

function buildEmbedConfig(
    platform: SharedLinkPlatform,
    url: string,
    isLight: boolean,
): EmbedConfig | null {
    switch (platform) {
        case 'YouTube': {
            const id = extractYouTubeId(url);
            if (!id) return null;
            return {
                source: { kind: 'uri', uri: `https://www.youtube.com/embed/${id}?playsinline=1&modestbranding=1&rel=0` },
                aspectRatio: 16 / 9,
            };
        }
        case 'Spotify': {
            const path = extractSpotifyEmbedPath(url);
            if (!path) return null;
            const theme = isLight ? '1' : '0';
            return {
                source: { kind: 'uri', uri: `https://open.spotify.com/embed/${path}?theme=${theme}` },
                fixedHeight: 352,
            };
        }
        case 'TikTok': {
            const id = extractTikTokVideoId(url);
            if (!id) return null;
            // The /embed/v2/ iframe URL sizes inconsistently in WebView; use
            // TikTok's official blockquote + embed.js script (same pattern as
            // Twitter) which handles its own responsive sizing.
            const html = `<!doctype html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>
  html,body{margin:0;padding:0;background:transparent;}
  body{display:flex;justify-content:center;}
  .tiktok-embed{max-width:100% !important;min-width:0 !important;margin:0 !important;}
</style>
</head><body>
<blockquote class="tiktok-embed" cite="${url.replace(/"/g, '%22')}" data-video-id="${id}">
  <section></section>
</blockquote>
<script async src="https://www.tiktok.com/embed.js"></script>
</body></html>`;
            return {
                source: { kind: 'html', html, baseUrl: 'https://www.tiktok.com' },
                fixedHeight: 740,
            };
        }
        case 'Reddit': {
            // Reddit's redditmedia.com supports embedded post views. Theme
            // follows the OS-level mode (dark/light) we already track.
            const path = extractRedditPostPath(url);
            if (!path) return null;
            const theme = isLight ? 'light' : 'dark';
            return {
                source: { kind: 'uri', uri: `https://www.redditmedia.com${path}?ref_source=embed&ref=share&embed=true&theme=${theme}` },
                fixedHeight: 560,
            };
        }
        case 'Instagram': {
            const code = extractInstagramCode(url);
            if (!code) return null;
            return {
                source: { kind: 'uri', uri: `https://www.instagram.com/p/${code}/embed/` },
                fixedHeight: 620,
            };
        }
        case 'Twitter': {
            const id = extractTweetId(url);
            if (!id) return null;
            // Tweets need widgets.js + a blockquote — there's no direct iframe URL.
            const theme = isLight ? 'light' : 'dark';
            const html = `<!doctype html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>
  html,body{margin:0;padding:0;background:transparent;}
  body{display:flex;justify-content:center;}
  .twitter-tweet{margin:0 !important;}
</style>
</head><body>
<blockquote class="twitter-tweet" data-theme="${theme}" data-dnt="true" data-conversation="none">
  <a href="${url.replace(/"/g, '%22')}"></a>
</blockquote>
<script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>
</body></html>`;
            return {
                source: { kind: 'html', html, baseUrl: 'https://twitter.com' },
                fixedHeight: 520,
            };
        }
        // Reddit & Web fall back to the parent's static card.
        default:
            return null;
    }
}

// ─── Component ───────────────────────────────────────────────────────────

export const PlatformEmbed = memo(function PlatformEmbed({
    url,
    platform,
    isLight,
    horizontalPaddingTotal = 0,
}: PlatformEmbedProps) {
    const { width: windowWidth } = useWindowDimensions();
    const [mounted, setMounted] = useState(false);
    const [errored, setErrored] = useState(false);

    const config = useMemo(
        () => buildEmbedConfig(platform, url, isLight),
        [platform, url, isLight],
    );

    // Defer WebView mount until interactions/animations settle so the
    // initial list render isn't blocked by spinning up a browser per card.
    useEffect(() => {
        const handle = InteractionManager.runAfterInteractions(() => {
            setMounted(true);
        });
        return () => handle.cancel();
    }, []);

    if (!config) return null;

    const width = Math.max(0, windowWidth - horizontalPaddingTotal);
    const height = config.fixedHeight
        ?? (config.aspectRatio ? Math.round(width / config.aspectRatio) : 200);

    const placeholderBg = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)';
    const placeholderBorder = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
    const platformColor = platformToColor(platform);

    return (
        <View
            style={[
                styles.container,
                {
                    width,
                    height,
                    backgroundColor: placeholderBg,
                    borderColor: placeholderBorder,
                },
            ]}
        >
            {!mounted || errored ? (
                <View style={styles.placeholder}>
                    <Ionicons
                        name={platformToIcon(platform) as any}
                        size={28}
                        color={platformColor}
                    />
                    {errored ? (
                        <ThemedText style={[styles.placeholderText, { color: platformColor }]}>
                            Couldn't load preview — tap to open
                        </ThemedText>
                    ) : (
                        <ActivityIndicator size="small" color={platformColor} style={{ marginTop: 8 }} />
                    )}
                </View>
            ) : (
                <WebView
                    style={styles.webview}
                    source={config.source.kind === 'uri'
                        ? { uri: config.source.uri }
                        : { html: config.source.html, baseUrl: config.source.baseUrl }}
                    allowsInlineMediaPlayback
                    mediaPlaybackRequiresUserAction
                    javaScriptEnabled
                    domStorageEnabled
                    setSupportMultipleWindows={false}
                    automaticallyAdjustContentInsets={false}
                    scrollEnabled={false}
                    nestedScrollEnabled={false}
                    androidLayerType="hardware"
                    onError={() => setErrored(true)}
                    onHttpError={() => setErrored(true)}
                    startInLoadingState
                    renderLoading={() => (
                        <View style={styles.loading}>
                            <ActivityIndicator size="small" color={platformColor} />
                        </View>
                    )}
                />
            )}
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        borderRadius: 14,
        borderWidth: 1,
        overflow: 'hidden',
    },
    webview: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    placeholder: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        padding: 16,
    },
    placeholderText: {
        fontSize: 12,
        fontWeight: '500',
        textAlign: 'center',
    },
    loading: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
    },
});

/**
 * Helper for callers (SharedLinkCard) to know whether to render PlatformEmbed
 * or fall back to the static card. Mirrors the platforms supported in
 * buildEmbedConfig — keep these in sync.
 */
export function isEmbeddablePlatform(platform: SharedLinkPlatform, url: string): boolean {
    switch (platform) {
        case 'YouTube':
            return !!extractYouTubeId(url);
        case 'Spotify':
            return !!extractSpotifyEmbedPath(url);
        case 'TikTok':
            return !!extractTikTokVideoId(url);
        case 'Instagram':
            return !!extractInstagramCode(url);
        case 'Twitter':
            return !!extractTweetId(url);
        case 'Reddit':
            return !!extractRedditPostPath(url);
        default:
            return false;
    }
}

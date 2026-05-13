/**
 * StaticLinkPreview — the always-on, scroll-friendly view of a shared link.
 *
 * Renders a platform-themed card per shared link without spinning up a
 * WebView, so the Entries list stays smooth even with many embed-capable
 * entries on screen. The caller (SharedLinkCard) can layer an inline
 * PlatformEmbed below this when the user taps the preview pill.
 *
 *  - YouTube → real thumbnail via img.youtube.com/vi/{id}/hqdefault.jpg
 *  - Spotify → green-tinted card with track/album/playlist name from slug
 *  - TikTok  → dark TikTok-themed card with @handle (from URL path)
 *  - Reddit  → orange themed card with r/sub and post slug
 *  - Instagram / Twitter → branded color block with code or @handle
 *  - Web / unknown → original thumbnail+icon fallback
 */

import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/ui/ThemedText';
import {
    platformToIcon,
    platformToColor,
    type SharedLinkPlatform,
} from '@/services/sharedLinkService';
import {
    extractYouTubeId,
    extractSpotifyEmbedPath,
    extractTikTokVideoId,
    extractInstagramCode,
    extractTweetId,
    extractRedditPostPath,
} from './PlatformEmbed';

interface StaticLinkPreviewProps {
    url: string;
    platform: SharedLinkPlatform;
    title: string | null;
    thumbnailUrl: string | null;
    isLight: boolean;
}

function slugToTitle(slug: string): string {
    return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
}

interface ParsedBits {
    headline?: string;        // big, primary text
    subline?: string;         // small secondary text
    badge?: string;           // small uppercase tag near the icon
    youtubeId?: string;
}

function parseForDisplay(platform: SharedLinkPlatform, url: string, title: string | null): ParsedBits {
    try {
        const u = new URL(url);
        const parts = u.pathname.split('/').filter(Boolean);

        switch (platform) {
            case 'YouTube': {
                const id = extractYouTubeId(url);
                return {
                    youtubeId: id ?? undefined,
                    headline: title ?? 'YouTube video',
                    subline: u.hostname.replace(/^www\./, ''),
                };
            }
            case 'Spotify': {
                const path = extractSpotifyEmbedPath(url);
                if (path) {
                    const [type, _id] = path.split('/');
                    // Try to find a human-readable name in the path
                    const start = parts[0]?.startsWith('intl-') ? 1 : 0;
                    const after = parts.slice(start + 2);
                    const slug = after[0] ?? '';
                    const headline = title || (slug ? slugToTitle(slug) : type.charAt(0).toUpperCase() + type.slice(1));
                    return {
                        badge: type.toUpperCase(),
                        headline,
                        subline: 'open.spotify.com',
                    };
                }
                return { headline: title ?? 'Spotify', subline: 'open.spotify.com' };
            }
            case 'TikTok': {
                const handle = parts.find(p => p.startsWith('@'));
                return {
                    badge: handle ?? 'TIKTOK',
                    headline: title ?? handle ?? 'TikTok video',
                    subline: 'tiktok.com',
                };
            }
            case 'Reddit': {
                const rIdx = parts.indexOf('r');
                const sub = rIdx !== -1 ? parts[rIdx + 1] : null;
                const cIdx = parts.indexOf('comments');
                const slug = cIdx !== -1 ? parts[cIdx + 2] : null;
                return {
                    badge: sub ? `r/${sub}` : 'REDDIT',
                    headline: title ?? (slug ? slugToTitle(slug) : 'Reddit thread'),
                    subline: 'reddit.com',
                };
            }
            case 'Instagram': {
                const code = extractInstagramCode(url);
                const kind = parts[0] === 'reel' ? 'Reel' : parts[0] === 'tv' ? 'IGTV' : 'Post';
                return {
                    badge: kind.toUpperCase(),
                    headline: title ?? (code ? `Instagram ${kind}` : 'Instagram'),
                    subline: 'instagram.com',
                };
            }
            case 'Twitter': {
                const handle = parts[0] ? `@${parts[0]}` : null;
                return {
                    badge: handle ?? 'TWEET',
                    headline: title ?? (handle ? `Tweet by ${handle}` : 'Tweet'),
                    subline: u.hostname.replace(/^www\./, ''),
                };
            }
            default: {
                return {
                    headline: title ?? u.hostname.replace(/^www\./, ''),
                    subline: u.hostname.replace(/^www\./, ''),
                };
            }
        }
    } catch {
        return { headline: title ?? url.slice(0, 60) };
    }
}

export const StaticLinkPreview = memo(function StaticLinkPreview({
    url,
    platform,
    title,
    thumbnailUrl,
    isLight,
}: StaticLinkPreviewProps) {
    const bits = useMemo(() => parseForDisplay(platform, url, title), [platform, url, title]);
    const platformColor = platformToColor(platform);
    const platformIcon = platformToIcon(platform);

    // ── YouTube: real thumbnail with play overlay ──────────────────────
    if (platform === 'YouTube' && bits.youtubeId) {
        return (
            <View style={[styles.youtubeFrame, { borderColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)' }]}>
                <Image
                    source={{ uri: `https://img.youtube.com/vi/${bits.youtubeId}/hqdefault.jpg` }}
                    style={styles.youtubeImage}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                />
                <View style={styles.playOverlay}>
                    <View style={styles.playButton}>
                        <Ionicons name="play" size={26} color="#fff" />
                    </View>
                </View>
                {bits.headline ? (
                    <View style={styles.youtubeCaption}>
                        <ThemedText numberOfLines={2} style={styles.youtubeCaptionText}>
                            {bits.headline}
                        </ThemedText>
                    </View>
                ) : null}
            </View>
        );
    }

    // ── Generic branded card for other platforms ───────────────────────
    const tint = platformColor + (isLight ? '14' : '22'); // 8% / 13% alpha
    const border = platformColor + '55';

    return (
        <View style={[styles.brandCard, { backgroundColor: tint, borderColor: border }]}>
            <View style={[styles.brandIconBubble, { backgroundColor: platformColor + 'EE' }]}>
                <Ionicons name={platformIcon as any} size={22} color="#fff" />
            </View>
            <View style={styles.brandTextArea}>
                <View style={styles.brandBadgeRow}>
                    {bits.badge ? (
                        <ThemedText style={[styles.brandBadge, { color: platformColor }]}>
                            {bits.badge}
                        </ThemedText>
                    ) : (
                        <ThemedText style={[styles.brandBadge, { color: platformColor }]}>
                            {platform.toUpperCase()}
                        </ThemedText>
                    )}
                </View>
                {bits.headline ? (
                    <ThemedText
                        numberOfLines={2}
                        style={[styles.brandHeadline, { color: isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.95)' }]}
                    >
                        {bits.headline}
                    </ThemedText>
                ) : null}
                {bits.subline ? (
                    <ThemedText
                        numberOfLines={1}
                        style={[styles.brandSubline, { color: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.5)' }]}
                    >
                        {bits.subline}
                    </ThemedText>
                ) : null}
            </View>
            {thumbnailUrl ? (
                <View style={styles.brandThumb}>
                    <Image
                        source={{ uri: thumbnailUrl }}
                        style={styles.brandThumbImage}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                    />
                </View>
            ) : null}
        </View>
    );
});

const styles = StyleSheet.create({
    // YouTube thumbnail block
    youtubeFrame: {
        borderRadius: 12,
        borderWidth: 1,
        overflow: 'hidden',
        aspectRatio: 16 / 9,
        position: 'relative',
    },
    youtubeImage: {
        width: '100%',
        height: '100%',
    },
    playOverlay: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
    },
    playButton: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: 'rgba(0,0,0,0.55)',
        alignItems: 'center',
        justifyContent: 'center',
        paddingLeft: 3,
    },
    youtubeCaption: {
        position: 'absolute',
        left: 0, right: 0, bottom: 0,
        padding: 10,
        backgroundColor: 'rgba(0,0,0,0.55)',
    },
    youtubeCaptionText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '500',
    },

    // Generic branded card (Spotify, TikTok, Reddit, Instagram, Twitter, Web)
    brandCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
    },
    brandIconBubble: {
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    brandTextArea: {
        flex: 1,
        gap: 2,
    },
    brandBadgeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    brandBadge: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
    },
    brandHeadline: {
        fontSize: 14,
        fontWeight: '600',
        lineHeight: 18,
    },
    brandSubline: {
        fontSize: 11,
    },
    brandThumb: {
        width: 56,
        height: 56,
        borderRadius: 10,
        overflow: 'hidden',
        flexShrink: 0,
    },
    brandThumbImage: {
        width: '100%',
        height: '100%',
    },
});

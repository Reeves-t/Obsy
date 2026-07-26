/**
 * StaticLinkPreview — the always-on, scroll-friendly view of a shared link.
 *
 * Renders every platform through one of three tiers, so a feed of saves from
 * eight different sites reads as one system while still being unmistakably
 * *that* platform. No WebView is involved; the Entries list stays smooth.
 *
 *  1. Image card    — a real preview image, framed by the aspect its platform
 *                     shoots in. Portrait media (TikTok, Reels, Shorts) sits on
 *                     a blurred copy of itself rather than letterboxing on black.
 *  2. Text card     — platform-tinted gradient carrying the post's own words.
 *                     X has no thumbnail in its oEmbed response at all, and text
 *                     posts on Reddit/Tumblr have nothing to show; quoting them
 *                     looks deliberate where a stretched avatar would not.
 *  3. Monogram card — nothing resolved: platform gradient, logo, domain. A
 *                     failed TikTok save still looks like a TikTok, not a grey box.
 *
 * The caller (SharedLinkCard) can layer an inline PlatformEmbed below this when
 * the user taps the preview pill.
 */

import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/ui/ThemedText';
import {
    platformToColor,
    platformToGradient,
    platformAspect,
    aspectRatioValue,
    type SharedLinkPlatform,
} from '@/services/sharedLinkService';
import { useLinkThumbnail } from '@/hooks/useLinkThumbnail';
import { extractYouTubeId, extractSpotifyEmbedPath, extractInstagramCode } from './PlatformEmbed';

interface StaticLinkPreviewProps {
    url: string;
    platform: SharedLinkPlatform;
    title: string | null;
    /** Source CDN thumbnail. May be an expiring signed URL — used only as fallback. */
    thumbnailUrl: string | null;
    /** Storage path of our re-hosted copy. Preferred over thumbnailUrl. */
    thumbnailPath?: string | null;
    /** The post's own words (caption / tweet body / selftext) — backs the text card. */
    text?: string | null;
    /** Resolved author: @handle, channel, artist, u/redditor. */
    author?: string | null;
    /** Resolved media type, used to pick the frame aspect for non-obvious platforms. */
    mediaType?: string | null;
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
                    const [type] = path.split('/');
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
                    badge: handle ?? 'POST',
                    headline: title ?? (handle ? `Post by ${handle}` : 'Post'),
                    subline: u.hostname.replace(/^www\./, ''),
                };
            }
            case 'Tumblr': {
                const postIndex = parts.indexOf('post');
                const blog = postIndex > 0 ? parts[postIndex - 1] : parts[0];
                const slug = postIndex !== -1 ? parts[postIndex + 2] : null;
                return {
                    badge: blog ?? 'TUMBLR',
                    headline: title ?? (slug ? slugToTitle(slug) : 'Tumblr post'),
                    subline: u.hostname.replace(/^www\./, ''),
                };
            }
            case 'Twitch': {
                const channel = parts[0] && parts[0] !== 'videos' ? parts[0] : null;
                return {
                    badge: channel ?? 'TWITCH',
                    headline: title ?? (channel ? `${channel} on Twitch` : 'Twitch video'),
                    subline: 'twitch.tv',
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

function PlatformPreviewIcon({ platform, size, color }: { platform: SharedLinkPlatform; size: number; color: string }) {
    switch (platform) {
        case 'YouTube': return <FontAwesome5 name="youtube" size={size} color={color} solid />;
        case 'Spotify': return <FontAwesome5 name="spotify" size={size} color={color} solid />;
        case 'TikTok': return <FontAwesome5 name="tiktok" size={size} color={color} solid />;
        case 'Instagram': return <FontAwesome5 name="instagram" size={size} color={color} solid />;
        case 'Twitter': return <FontAwesome5 name="twitter" size={size} color={color} solid />;
        case 'Reddit': return <FontAwesome5 name="reddit-alien" size={size} color={color} solid />;
        case 'Tumblr': return <FontAwesome5 name="tumblr" size={size} color={color} solid />;
        case 'Twitch': return <FontAwesome5 name="twitch" size={size} color={color} solid />;
        default: return <Ionicons name="globe-outline" size={size} color={color} />;
    }
}

/**
 * The one element every tier shares: a floating pill naming the source.
 * It sits on imagery, gradients and blur alike, so it carries its own scrim
 * rather than relying on the surface beneath it.
 */
function PlatformChip({ platform, label }: { platform: SharedLinkPlatform; label?: string | null }) {
    return (
        <View style={styles.chip}>
            <PlatformPreviewIcon platform={platform} size={11} color="#fff" />
            <ThemedText numberOfLines={1} style={styles.chipText}>
                {label || platform}
            </ThemedText>
        </View>
    );
}

export const StaticLinkPreview = memo(function StaticLinkPreview({
    url,
    platform,
    title,
    thumbnailUrl,
    thumbnailPath,
    text,
    author,
    mediaType,
    isLight,
}: StaticLinkPreviewProps) {
    const bits = useMemo(() => parseForDisplay(platform, url, title), [platform, url, title]);
    const platformColor = platformToColor(platform);
    const gradient = useMemo(() => platformToGradient(platform), [platform]);
    const aspect = useMemo(
        () => platformAspect(platform, mediaType, url),
        [platform, mediaType, url],
    );

    const stored = useLinkThumbnail(thumbnailPath, thumbnailUrl);
    // YouTube publishes a stable, non-expiring thumbnail by video id, so it
    // needs no re-host and works even for entries saved before digestion ran.
    const uri = stored ?? (bits.youtubeId ? `https://img.youtube.com/vi/${bits.youtubeId}/hqdefault.jpg` : null);

    const isVideo = mediaType === 'video' || platform === 'YouTube' || platform === 'TikTok' || platform === 'Twitch';
    const frameBorder = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';

    // ── Tier 1: image card ─────────────────────────────────────────────
    if (uri) {
        const isPortrait = aspect === 'portrait';
        return (
            <View style={[styles.mediaFrame, { aspectRatio: aspectRatioValue(aspect), borderColor: frameBorder }]}>
                {/* Portrait media is narrower than the frame; a blurred, darkened
                    copy fills the sides so the card never shows dead black bars. */}
                {isPortrait && (
                    <>
                        <Image
                            source={{ uri }}
                            style={StyleSheet.absoluteFill}
                            contentFit="cover"
                            blurRadius={28}
                            cachePolicy="memory-disk"
                        />
                        <View style={styles.blurScrim} />
                    </>
                )}

                <Image
                    source={{ uri }}
                    style={styles.mediaImage}
                    contentFit={isPortrait ? 'contain' : 'cover'}
                    cachePolicy="memory-disk"
                    transition={120}
                />

                <View style={styles.chipHolder}>
                    <PlatformChip platform={platform} label={bits.badge ?? platform} />
                </View>

                {isVideo && (
                    <View style={styles.playOverlay} pointerEvents="none">
                        <View style={styles.playButton}>
                            <Ionicons name="play" size={24} color="#fff" />
                        </View>
                    </View>
                )}

                {bits.headline ? (
                    <View style={styles.captionBar}>
                        <ThemedText numberOfLines={2} style={styles.captionText}>
                            {bits.headline}
                        </ThemedText>
                        {author ? (
                            <ThemedText numberOfLines={1} style={styles.captionAuthor}>
                                {author}
                            </ThemedText>
                        ) : null}
                    </View>
                ) : null}
            </View>
        );
    }

    // ── Tier 2: text card ──────────────────────────────────────────────
    const excerpt = text?.trim();
    if (excerpt) {
        return (
            <LinearGradient
                colors={gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.textCard, { borderColor: platformColor + '55' }]}
            >
                <PlatformChip platform={platform} label={bits.badge ?? platform} />
                <ThemedText numberOfLines={5} style={styles.quote}>
                    “{excerpt}”
                </ThemedText>
                {(author || bits.subline) ? (
                    <ThemedText numberOfLines={1} style={styles.textCardAuthor}>
                        {author ?? bits.subline}
                    </ThemedText>
                ) : null}
            </LinearGradient>
        );
    }

    // ── Tier 3: monogram fallback ──────────────────────────────────────
    return (
        <LinearGradient
            colors={gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.monogramCard, { borderColor: platformColor + '55' }]}
        >
            <View style={styles.monogramIcon}>
                <PlatformPreviewIcon platform={platform} size={26} color="#fff" />
            </View>
            <View style={styles.monogramText}>
                <ThemedText numberOfLines={2} style={styles.monogramHeadline}>
                    {bits.headline ?? platform}
                </ThemedText>
                {bits.subline ? (
                    <ThemedText numberOfLines={1} style={styles.monogramSubline}>
                        {bits.subline}
                    </ThemedText>
                ) : null}
            </View>
        </LinearGradient>
    );
});

const styles = StyleSheet.create({
    // ── Tier 1: image ──────────────────────────────────────────────────
    mediaFrame: {
        borderRadius: 12,
        borderWidth: 1,
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: '#000',
    },
    mediaImage: {
        width: '100%',
        height: '100%',
    },
    blurScrim: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.35)',
    },
    chipHolder: {
        position: 'absolute',
        top: 8,
        left: 8,
    },
    playOverlay: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
    },
    playButton: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: 'rgba(0,0,0,0.55)',
        alignItems: 'center',
        justifyContent: 'center',
        paddingLeft: 3,
    },
    captionBar: {
        position: 'absolute',
        left: 0, right: 0, bottom: 0,
        paddingHorizontal: 10,
        paddingVertical: 8,
        backgroundColor: 'rgba(0,0,0,0.55)',
        gap: 1,
    },
    captionText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '500',
        lineHeight: 17,
    },
    captionAuthor: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 11,
    },

    // ── Shared chip ────────────────────────────────────────────────────
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 11,
        backgroundColor: 'rgba(0,0,0,0.55)',
        alignSelf: 'flex-start',
        maxWidth: 180,
    },
    chipText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        flexShrink: 1,
    },

    // ── Tier 2: text card ──────────────────────────────────────────────
    textCard: {
        borderRadius: 12,
        borderWidth: 1,
        padding: 14,
        gap: 10,
        minHeight: 120,
        justifyContent: 'center',
    },
    quote: {
        color: '#fff',
        fontSize: 15,
        lineHeight: 21,
        fontWeight: '500',
    },
    textCardAuthor: {
        color: 'rgba(255,255,255,0.75)',
        fontSize: 11,
        fontWeight: '600',
    },

    // ── Tier 3: monogram ───────────────────────────────────────────────
    monogramCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
        minHeight: 76,
    },
    monogramIcon: {
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.25)',
        flexShrink: 0,
    },
    monogramText: {
        flex: 1,
        gap: 2,
    },
    monogramHeadline: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
        lineHeight: 18,
    },
    monogramSubline: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 11,
    },
});

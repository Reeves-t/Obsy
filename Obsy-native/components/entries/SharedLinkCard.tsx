import React, { memo, useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { ThemedText } from '@/components/ui/ThemedText';
import { Capture } from '@/types/capture';
import { useMoodResolver } from '@/hooks/useMoodResolver';
import { platformToIcon, platformToColor } from '@/services/sharedLinkService';
import type { SharedLinkPlatform } from '@/services/sharedLinkService';
import { PlatformEmbed, isEmbeddablePlatform } from './PlatformEmbed';

/**
 * SharedLinkCard renders an entry whose source is a shared link.
 *
 * Rendering modes (Option A — see PlatformEmbed.tsx for the Option B note):
 *  - Embeddable platform (YouTube, Spotify, TikTok, Instagram, Twitter) with
 *    a parseable URL → render the real platform embed via PlatformEmbed,
 *    with a compact footer below it (mood + note + time).
 *  - Anything else (Reddit, Web, or parsing failed) → fall back to the
 *    original lightweight card layout with a thumbnail/icon.
 *
 * The list (`gallery.tsx`) uses `paddingHorizontal: 16` on the FlatList
 * contentContainer; the embed receives `horizontalPaddingTotal={32}` so it
 * can size itself to fill the row width.
 */

interface SharedLinkCardProps {
    capture: Capture;
    textColor: string;
    textSecondary: string;
    textTertiary: string;
    isLight: boolean;
    onPress?: (id: string) => void;
}

export const SharedLinkCard = memo(function SharedLinkCard({
    capture,
    textColor,
    textSecondary,
    textTertiary,
    isLight,
    onPress,
}: SharedLinkCardProps) {
    const { getMoodDisplay } = useMoodResolver();
    const moodDisplay = getMoodDisplay(capture.mood_id, capture.mood_name_snapshot);
    const date = new Date(capture.created_at);

    const platform = (capture.shared_link_platform ?? 'Web') as SharedLinkPlatform;
    const platformIcon = platformToIcon(platform);
    const platformColor = platformToColor(platform);
    const title = capture.shared_link_title;
    const url = capture.shared_link_url ?? '';
    const thumbnail = capture.shared_link_thumbnail_url;

    const cardBg = isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)';
    const cardBorder = isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.08)';

    const handlePress = useCallback(() => {
        if (onPress) {
            onPress(capture.id);
        } else if (url) {
            Linking.openURL(url).catch(() => {});
        }
    }, [capture.id, url, onPress]);

    const handleLinkTap = useCallback(() => {
        if (url) Linking.openURL(url).catch(() => {});
    }, [url]);

    const displayUrl = (() => {
        try {
            const parsed = new URL(url);
            return parsed.hostname.replace(/^www\./, '') + (parsed.pathname !== '/' ? parsed.pathname.slice(0, 40) : '');
        } catch {
            return url.slice(0, 50);
        }
    })();

    const embeddable = url ? isEmbeddablePlatform(platform, url) : false;

    // ── Embedded variant ────────────────────────────────────────────────
    if (embeddable) {
        return (
            <View style={[styles.embedCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                <PlatformEmbed
                    url={url}
                    platform={platform}
                    isLight={isLight}
                    horizontalPaddingTotal={32}
                />
                <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={handlePress}
                    style={styles.embedFooter}
                >
                    <View style={styles.platformRow}>
                        <Ionicons name={platformIcon as any} size={11} color={platformColor} />
                        <ThemedText style={[styles.platformLabel, { color: platformColor }]}>
                            {platform}
                        </ThemedText>
                        <ThemedText
                            numberOfLines={1}
                            style={[styles.embedDomain, { color: textTertiary }]}
                            onPress={handleLinkTap}
                        >
                            · {displayUrl}
                        </ThemedText>
                    </View>

                    {capture.note && capture.note.trim().length > 0 && (
                        <ThemedText numberOfLines={2} style={[styles.note, { color: textSecondary }]}>
                            {capture.note}
                        </ThemedText>
                    )}

                    <View style={styles.metaRow}>
                        {moodDisplay && (
                            <View style={[
                                styles.moodPill,
                                { borderLeftColor: moodDisplay.color, borderLeftWidth: 2 },
                                isLight ? styles.pillLight : styles.pillDark,
                            ]}>
                                <ThemedText style={[styles.moodText, { color: textSecondary }]}>
                                    {moodDisplay.name}
                                </ThemedText>
                            </View>
                        )}
                        <ThemedText style={[styles.timeText, { color: textTertiary }]}>
                            {format(date, 'h:mm a')} · {format(date, 'MMM d')}
                        </ThemedText>
                    </View>
                </TouchableOpacity>
            </View>
        );
    }

    // ── Fallback static card (Reddit / Web / unparseable URLs) ──────────
    return (
        <TouchableOpacity
            activeOpacity={0.8}
            onPress={handlePress}
            style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}
        >
            <View style={styles.content}>
                <View style={styles.textArea}>
                    <View style={styles.platformRow}>
                        <Ionicons
                            name={platformIcon as any}
                            size={11}
                            color={platformColor}
                        />
                        <ThemedText style={[styles.platformLabel, { color: platformColor }]}>
                            {platform}
                        </ThemedText>
                    </View>

                    {title ? (
                        <ThemedText numberOfLines={2} style={[styles.title, { color: textColor }]}>
                            {title}
                        </ThemedText>
                    ) : (
                        <ThemedText numberOfLines={2} style={[styles.urlFallback, { color: textSecondary }]}>
                            {displayUrl}
                        </ThemedText>
                    )}

                    {title && (
                        <TouchableOpacity onPress={handleLinkTap} activeOpacity={0.7}>
                            <ThemedText numberOfLines={1} style={[styles.displayUrl, { color: textTertiary }]}>
                                {displayUrl}
                            </ThemedText>
                        </TouchableOpacity>
                    )}

                    {capture.note && capture.note.trim().length > 0 && (
                        <ThemedText numberOfLines={2} style={[styles.note, { color: textSecondary }]}>
                            {capture.note}
                        </ThemedText>
                    )}

                    <View style={styles.metaRow}>
                        {moodDisplay && (
                            <View style={[
                                styles.moodPill,
                                { borderLeftColor: moodDisplay.color, borderLeftWidth: 2 },
                                isLight ? styles.pillLight : styles.pillDark,
                            ]}>
                                <ThemedText style={[styles.moodText, { color: textSecondary }]}>
                                    {moodDisplay.name}
                                </ThemedText>
                            </View>
                        )}
                        <ThemedText style={[styles.timeText, { color: textTertiary }]}>
                            {format(date, 'h:mm a')} · {format(date, 'MMM d')}
                        </ThemedText>
                    </View>
                </View>

                {thumbnail ? (
                    <View style={styles.thumbnailContainer}>
                        <Image
                            source={{ uri: thumbnail }}
                            style={styles.thumbnail}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                        />
                    </View>
                ) : (
                    <View style={[styles.thumbnailPlaceholder, { borderColor: cardBorder }]}>
                        <Ionicons name="link-outline" size={22} color={textTertiary} />
                    </View>
                )}
            </View>
        </TouchableOpacity>
    );
});

const styles = StyleSheet.create({
    // Fallback (non-embed) card
    card: {
        marginBottom: 12,
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
    },
    content: {
        flexDirection: 'row',
        gap: 12,
        alignItems: 'flex-start',
    },
    textArea: {
        flex: 1,
        gap: 6,
    },

    // Embedded card
    embedCard: {
        marginBottom: 12,
        borderRadius: 14,
        borderWidth: 1,
        overflow: 'hidden',
    },
    embedFooter: {
        padding: 12,
        gap: 6,
    },
    embedDomain: {
        fontSize: 11,
        flexShrink: 1,
    },

    // Shared
    platformRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    platformLabel: {
        fontSize: 10,
        fontWeight: '600',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
    },
    title: {
        fontSize: 14,
        fontWeight: '500',
        lineHeight: 20,
    },
    urlFallback: {
        fontSize: 13,
        lineHeight: 18,
    },
    displayUrl: {
        fontSize: 11,
        opacity: 0.6,
    },
    note: {
        fontSize: 13,
        lineHeight: 18,
        fontStyle: 'italic',
        opacity: 0.8,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        marginTop: 2,
    },
    moodPill: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
    },
    pillDark: {
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    pillLight: {
        backgroundColor: 'rgba(0,0,0,0.04)',
    },
    moodText: {
        fontSize: 10,
        fontWeight: '500',
    },
    timeText: {
        fontSize: 11,
    },
    thumbnailContainer: {
        width: 64,
        height: 64,
        borderRadius: 10,
        overflow: 'hidden',
        flexShrink: 0,
    },
    thumbnail: {
        width: '100%',
        height: '100%',
    },
    thumbnailPlaceholder: {
        width: 64,
        height: 64,
        borderRadius: 10,
        borderWidth: 1,
        flexShrink: 0,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.03)',
    },
});

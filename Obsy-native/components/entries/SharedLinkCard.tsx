import React, { memo, useCallback, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { ThemedText } from '@/components/ui/ThemedText';
import { Capture } from '@/types/capture';
import { useMoodResolver } from '@/hooks/useMoodResolver';
import { detectPlatform, platformToColor } from '@/services/sharedLinkService';
import type { SharedLinkPlatform } from '@/services/sharedLinkService';
import { PlatformEmbed, isEmbeddablePlatform } from './PlatformEmbed';
import { StaticLinkPreview } from './StaticLinkPreview';

/**
 * SharedLinkCard — hybrid renderer for a shared-link entry.
 *
 * Default state: a lightweight, scroll-friendly StaticLinkPreview (per-platform
 * branded card or YouTube thumbnail), plus the entry's metadata (mood + note +
 * time). For platforms with a real embed (YouTube / Spotify / TikTok / Reddit /
 * Instagram / Twitter) a "Tap to preview" pill appears below the static card —
 * tapping it mounts the actual platform embed inline via PlatformEmbed (the
 * WebView spins up only on demand, keeping the list smooth).
 *
 * The pill flips to "Hide preview" when expanded. The mood pill, note, and
 * timestamp stay visible in both states.
 *
 * The list (`gallery.tsx`) uses `paddingHorizontal: 16` on the FlatList
 * contentContainer; PlatformEmbed receives `horizontalPaddingTotal={32}` so
 * it can size itself to fill the row width when expanded.
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
    textSecondary,
    textTertiary,
    isLight,
    onPress,
}: SharedLinkCardProps) {
    const { getMoodDisplay } = useMoodResolver();
    const moodDisplay = getMoodDisplay(capture.mood_id, capture.mood_name_snapshot);
    const date = new Date(capture.created_at);

    const title = capture.shared_link_title ?? null;
    const url = capture.shared_link_url ?? '';
    const thumbnail = capture.shared_link_thumbnail_url ?? null;
    const savedPlatform = (capture.shared_link_platform ?? 'Web') as SharedLinkPlatform;
    const platform = savedPlatform === 'Web' && url ? detectPlatform(url) : savedPlatform;

    const cardBg = isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)';
    const cardBorder = isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.08)';
    const platformColor = platformToColor(platform);

    const [expanded, setExpanded] = useState(false);
    const embeddable = !!url && isEmbeddablePlatform(platform, url);

    const handlePress = useCallback(() => {
        if (onPress) {
            onPress(capture.id);
        } else if (url) {
            Linking.openURL(url).catch(() => {});
        }
    }, [capture.id, url, onPress]);

    const handleTogglePreview = useCallback(() => {
        setExpanded(prev => !prev);
    }, []);

    const displayUrl = (() => {
        try {
            const parsed = new URL(url);
            return parsed.hostname.replace(/^www\./, '') + (parsed.pathname !== '/' ? parsed.pathname.slice(0, 40) : '');
        } catch {
            return url.slice(0, 50);
        }
    })();

    return (
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            {/* ── Static preview (always shown) ─────────────────────────── */}
            <TouchableOpacity activeOpacity={0.85} onPress={handlePress}>
                <StaticLinkPreview
                    url={url}
                    platform={platform}
                    title={title}
                    thumbnailUrl={thumbnail}
                    isLight={isLight}
                />
            </TouchableOpacity>

            {/* ── Tap-to-preview pill + inline embed ───────────────────── */}
            {embeddable && (
                <View style={styles.previewArea}>
                    <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={handleTogglePreview}
                        style={[
                            styles.previewPill,
                            {
                                backgroundColor: platformColor + (isLight ? '1F' : '2A'),
                                borderColor: platformColor + '66',
                            },
                        ]}
                    >
                        <Ionicons
                            name={expanded ? 'chevron-up' : 'play-circle-outline'}
                            size={14}
                            color={platformColor}
                        />
                        <ThemedText style={[styles.previewPillText, { color: platformColor }]}>
                            {expanded ? 'Hide preview' : 'Tap to preview'}
                        </ThemedText>
                    </TouchableOpacity>

                    {expanded && (
                        <View style={styles.embedHolder}>
                            <PlatformEmbed
                                url={url}
                                platform={platform}
                                isLight={isLight}
                                horizontalPaddingTotal={32 + 24} // FlatList padding (32) + card inner padding (12 each side)
                            />
                        </View>
                    )}
                </View>
            )}

            {/* ── Metadata: AI digest + note + mood + time ─────────────── */}
            <View style={styles.footer}>
                {capture.shared_link_digest && capture.shared_link_digest.trim().length > 0 && (
                    <ThemedText numberOfLines={3} style={[styles.digest, { color: textSecondary }]}>
                        {capture.shared_link_digest}
                    </ThemedText>
                )}
                {capture.note && capture.note.trim().length > 0 && (
                    <ThemedText numberOfLines={3} style={[styles.note, { color: textSecondary }]}>
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
                    <ThemedText
                        numberOfLines={1}
                        style={[styles.domainText, { color: textTertiary }]}
                    >
                        {displayUrl}
                    </ThemedText>
                    <ThemedText style={[styles.timeText, { color: textTertiary }]}>
                        {format(date, 'h:mm a')} · {format(date, 'MMM d')}
                    </ThemedText>
                </View>
            </View>
        </View>
    );
});

const styles = StyleSheet.create({
    card: {
        marginBottom: 12,
        padding: 12,
        borderRadius: 14,
        borderWidth: 1,
        gap: 10,
    },

    // Preview pill + expanded embed area
    previewArea: {
        gap: 10,
    },
    previewPill: {
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 14,
        borderWidth: 1,
    },
    previewPillText: {
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 0.3,
    },
    embedHolder: {
        // PlatformEmbed manages its own border/radius/height.
    },

    // Footer (mood + url + time)
    footer: {
        gap: 6,
    },
    note: {
        fontSize: 13,
        lineHeight: 18,
        fontStyle: 'italic',
        opacity: 0.85,
    },
    digest: {
        fontSize: 13,
        lineHeight: 18,
        opacity: 0.95,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
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
    domainText: {
        fontSize: 11,
        flexShrink: 1,
        opacity: 0.6,
    },
    timeText: {
        fontSize: 11,
        marginLeft: 'auto',
    },
});

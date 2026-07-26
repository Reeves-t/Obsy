/**
 * SharedLinkRow — one line in the Shared Links inbox.
 *
 * Shows only what was captured without asking anything of the user at save
 * time: thumbnail, title, where it came from, and when it was saved. That is
 * the whole contract of the quick-save flow, so the row never renders a mood or
 * an empty placeholder where one would go.
 *
 * The thumbnail slot degrades the same way the full cards do — re-hosted image,
 * then the source URL, then the platform mark on its brand gradient — so a
 * queue of mixed sources still reads as one list.
 */

import React, { memo } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { formatDistanceToNowStrict } from 'date-fns';
import { ThemedText } from '@/components/ui/ThemedText';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { useLinkThumbnail } from '@/hooks/useLinkThumbnail';
import type { Capture } from '@/types/capture';
import {
    detectPlatform,
    platformToGradient,
    type SharedLinkPlatform,
} from '@/services/sharedLinkService';

function PlatformMark({ platform, size }: { platform: SharedLinkPlatform; size: number }) {
    const color = '#fff';
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

interface SharedLinkRowProps {
    capture: Capture;
    onPress?: () => void;
    /** Renders the row flat, for use inside an already-carded surface. */
    plain?: boolean;
}

export const SharedLinkRow = memo(function SharedLinkRow({
    capture,
    onPress,
    plain = false,
}: SharedLinkRowProps) {
    const { colors, isLight } = useObsyTheme();

    const url = capture.shared_link_url ?? '';
    const saved = (capture.shared_link_platform ?? 'Web') as SharedLinkPlatform;
    const platform = saved === 'Web' && url ? detectPlatform(url) : saved;
    const gradient = platformToGradient(platform);

    const thumbnail = useLinkThumbnail(
        capture.shared_link_thumbnail_path,
        capture.shared_link_thumbnail_url,
    );

    const title = capture.shared_link_title?.trim()
        || capture.shared_link_text?.trim()
        || url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)
        || 'Link';

    // "2h", "3d" — compact enough to sit next to the source without wrapping.
    let age = '';
    try {
        age = formatDistanceToNowStrict(new Date(capture.created_at))
            .replace(' seconds', 's').replace(' second', 's')
            .replace(' minutes', 'm').replace(' minute', 'm')
            .replace(' hours', 'h').replace(' hour', 'h')
            .replace(' days', 'd').replace(' day', 'd')
            .replace(' months', 'mo').replace(' month', 'mo')
            .replace(' years', 'y').replace(' year', 'y');
    } catch {
        age = '';
    }

    return (
        <TouchableOpacity
            activeOpacity={onPress ? 0.75 : 1}
            onPress={onPress}
            disabled={!onPress}
            style={[
                styles.row,
                !plain && {
                    backgroundColor: isLight ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.05)',
                    borderColor: colors.cardBorder,
                    borderWidth: 1,
                },
            ]}
        >
            <View style={styles.thumb}>
                {thumbnail ? (
                    <Image
                        source={{ uri: thumbnail }}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        recyclingKey={`row-${capture.id}`}
                    />
                ) : (
                    <LinearGradient
                        colors={gradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[StyleSheet.absoluteFill, styles.thumbFallback]}
                    >
                        <PlatformMark platform={platform} size={18} />
                    </LinearGradient>
                )}
            </View>

            <View style={styles.body}>
                <ThemedText numberOfLines={2} style={[styles.title, { color: colors.text }]}>
                    {title}
                </ThemedText>
                <View style={styles.metaRow}>
                    <ThemedText style={[styles.meta, { color: colors.textTertiary }]}>
                        {platform}
                    </ThemedText>
                    {age ? (
                        <>
                            <ThemedText style={[styles.meta, { color: colors.textTertiary }]}>·</ThemedText>
                            <ThemedText style={[styles.meta, { color: colors.textTertiary }]}>
                                {age}
                            </ThemedText>
                        </>
                    ) : null}
                    {capture.note?.trim() ? (
                        <Ionicons
                            name="chatbubble-ellipses-outline"
                            size={11}
                            color={colors.textTertiary}
                            style={styles.noteIcon}
                        />
                    ) : null}
                </View>
            </View>

            {onPress ? (
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            ) : null}
        </TouchableOpacity>
    );
});

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 10,
        borderRadius: 14,
    },
    thumb: {
        width: 48,
        height: 48,
        borderRadius: 10,
        overflow: 'hidden',
        backgroundColor: '#000',
        flexShrink: 0,
    },
    thumbFallback: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    body: {
        flex: 1,
        gap: 3,
    },
    title: {
        fontSize: 13,
        fontWeight: '600',
        lineHeight: 17,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    meta: {
        fontSize: 11,
    },
    noteIcon: {
        marginLeft: 2,
    },
});

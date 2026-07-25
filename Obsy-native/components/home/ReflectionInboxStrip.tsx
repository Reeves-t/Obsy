/**
 * ReflectionInboxStrip — the nudge for shared links saved but not reflected on.
 *
 * Deliberately quiet: a single tappable pill that appears only when there is a
 * backlog and disappears the moment it is cleared. No badge, no count on the
 * tab bar, no notification. The strip itself is the reminder — a journal that
 * nags is one people stop opening.
 */

import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ThemedText } from '@/components/ui/ThemedText';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { useCaptureStore } from '@/lib/captureStore';
import { isUnreflected } from '@/types/capture';
import {
    detectPlatform,
    platformToColor,
    type SharedLinkPlatform,
} from '@/services/sharedLinkService';

/** Platform dots shown alongside the count, newest saves first. */
const MAX_DOTS = 4;

export function ReflectionInboxStrip() {
    const router = useRouter();
    const { colors, isLight } = useObsyTheme();
    const captures = useCaptureStore(state => state.captures);

    const pending = useMemo(
        () => captures
            .filter(isUnreflected)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
        [captures],
    );

    if (pending.length === 0) return null;

    const dots = pending.slice(0, MAX_DOTS).map(c => {
        const saved = (c.shared_link_platform ?? 'Web') as SharedLinkPlatform;
        const platform = saved === 'Web' && c.shared_link_url
            ? detectPlatform(c.shared_link_url)
            : saved;
        return { id: c.id, color: platformToColor(platform) };
    });

    const label = pending.length === 1
        ? '1 save waiting for you'
        : `${pending.length} saves waiting for you`;

    return (
        <Animated.View entering={FadeIn.duration(400)} style={styles.wrapper}>
            <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => router.push('/reflect')}
                style={[
                    styles.pill,
                    {
                        backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)',
                        borderColor: colors.cardBorder,
                    },
                ]}
            >
                <View style={styles.dots}>
                    {dots.map((d, i) => (
                        <View
                            key={d.id}
                            style={[
                                styles.dot,
                                {
                                    backgroundColor: d.color,
                                    borderColor: colors.background,
                                    marginLeft: i === 0 ? 0 : -6,
                                },
                            ]}
                        />
                    ))}
                </View>

                <ThemedText numberOfLines={1} style={[styles.label, { color: colors.text }]}>
                    {label}
                </ThemedText>

                <Ionicons name="chevron-forward" size={15} color={colors.textSecondary} />
            </TouchableOpacity>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        alignItems: 'center',
    },
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 22,
        borderWidth: 1,
        maxWidth: '88%',
    },
    dots: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    dot: {
        width: 16,
        height: 16,
        borderRadius: 8,
        borderWidth: 1.5,
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        flexShrink: 1,
    },
});

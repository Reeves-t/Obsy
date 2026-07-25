/**
 * SharedLinksInbox — the queue of things saved mid-scroll, sitting at the
 * bottom of Home.
 *
 * Saving is frictionless; processing is intentional. This is the second half:
 * a plain list of what was shared into Obsy, waiting to be dealt with when the
 * user actually has attention for it. Each row carries only what was captured
 * without asking anything of them — title, source, thumbnail, when it was
 * saved — so the queue is scannable at a glance.
 *
 * Nothing here is a badge or a nag. The list is present when there is something
 * in it and absent when there is not.
 */

import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ThemedText } from '@/components/ui/ThemedText';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { useCaptureStore } from '@/lib/captureStore';
import { isPendingSharedLink } from '@/types/capture';
import { SharedLinkRow } from '@/components/entries/SharedLinkRow';

/** Rows shown inline before the list defers to the full inbox screen. */
const PREVIEW_COUNT = 3;

export function SharedLinksInbox() {
    const router = useRouter();
    const { colors } = useObsyTheme();
    const captures = useCaptureStore(state => state.captures);

    const queued = useMemo(
        () => captures
            .filter(isPendingSharedLink)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
        [captures],
    );

    if (queued.length === 0) return null;

    const preview = queued.slice(0, PREVIEW_COUNT);
    const overflow = queued.length - preview.length;

    return (
        <Animated.View entering={FadeIn.duration(400)} style={styles.container}>
            <TouchableOpacity
                style={styles.header}
                activeOpacity={0.7}
                onPress={() => router.push('/shared-links')}
            >
                <ThemedText style={[styles.headerTitle, { color: colors.text }]}>
                    Shared Links
                </ThemedText>
                <View style={styles.headerRight}>
                    <ThemedText style={[styles.count, { color: colors.textSecondary }]}>
                        {queued.length} waiting
                    </ThemedText>
                    <Ionicons name="chevron-forward" size={15} color={colors.textSecondary} />
                </View>
            </TouchableOpacity>

            <View style={styles.list}>
                {preview.map(capture => (
                    <SharedLinkRow
                        key={capture.id}
                        capture={capture}
                        onPress={() => router.push({
                            pathname: '/shared-links',
                            params: { focus: capture.id },
                        })}
                    />
                ))}
            </View>

            {overflow > 0 && (
                <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => router.push('/shared-links')}
                    style={styles.more}
                >
                    <ThemedText style={[styles.moreText, { color: colors.textTertiary }]}>
                        {overflow === 1 ? '1 more' : `${overflow} more`}
                    </ThemedText>
                </TouchableOpacity>
            )}
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 16,
        gap: 8,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 4,
    },
    headerTitle: {
        fontSize: 15,
        fontWeight: '700',
        letterSpacing: 0.2,
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    count: {
        fontSize: 12,
        fontWeight: '600',
    },
    list: {
        gap: 8,
    },
    more: {
        alignItems: 'center',
        paddingVertical: 6,
    },
    moreText: {
        fontSize: 12,
        fontWeight: '600',
    },
});

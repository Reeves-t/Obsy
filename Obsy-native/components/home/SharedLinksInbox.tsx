/**
 * SharedLinksInbox — the queue of things saved mid-scroll, sitting under the
 * composer on Home.
 *
 * Saving is frictionless; processing is intentional. This is the second half:
 * what was shared into Obsy, waiting to be dealt with when the user actually
 * has attention for it. It borrows the Recent Memories strip wholesale — same
 * tile, same size, same rhythm — because these *are* memories, just ones that
 * have not been given a feeling yet. Making them look like a foreign widget
 * would imply they are a different kind of thing.
 *
 * Each tile carries the day it was saved, which is not decoration: logging a
 * link keeps its original `created_at`, so a TikTok saved on Tuesday lands in
 * Tuesday's mood history even if it is logged on Friday. The date is what tells
 * the user which day they are actually writing to.
 *
 * Two actions, both explicit:
 *   Log    — mood picker + optional note, then save (the /reflect flow)
 *   Delete — it was never worth keeping; remove it entirely
 *
 * Nothing here is a badge or a nag. The strip is present when there is
 * something in it and absent when there is not.
 */

import React, { useCallback, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, FlatList, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { isToday, isYesterday, format } from 'date-fns';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ThemedText } from '@/components/ui/ThemedText';
import { EntryGridTile } from '@/components/entries/EntryGridTile';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { useCaptureStore } from '@/lib/captureStore';
import { isPendingSharedLink, type Capture } from '@/types/capture';

/** Matches the Recent Memories strip exactly — the two read as one system. */
const TILE_SIZE = 108;

/** Tiles shown inline before the strip defers to the full inbox screen. */
const PREVIEW_COUNT = 8;

/**
 * The day this save will be filed under, said the way a person would.
 *
 * Deliberately a day and not a "3d ago" distance: the point is which day the
 * entry belongs to once logged, and a relative distance actively obscures that.
 */
function savedDayLabel(createdAt: string): string {
    const d = new Date(createdAt);
    if (Number.isNaN(d.getTime())) return '';
    if (isToday(d)) return `Today · ${format(d, 'h:mm a')}`;
    if (isYesterday(d)) return `Yesterday · ${format(d, 'h:mm a')}`;
    return format(d, 'MMM d · h:mm a');
}

interface QueuedTileProps {
    capture: Capture;
    isLight: boolean;
    onLog: (id: string) => void;
    onDelete: (capture: Capture) => void;
    onOpen: (id: string) => void;
}

const QueuedTile = React.memo(function QueuedTile({
    capture,
    isLight,
    onLog,
    onDelete,
    onOpen,
}: QueuedTileProps) {
    const { colors } = useObsyTheme();

    return (
        <Animated.View entering={FadeIn.duration(320)} style={styles.tileColumn}>
            <EntryGridTile
                capture={capture}
                size={TILE_SIZE}
                onPress={onOpen}
                isLight={isLight}
            />

            <ThemedText
                numberOfLines={1}
                style={[styles.savedAt, { color: colors.textTertiary }]}
            >
                {savedDayLabel(capture.created_at)}
            </ThemedText>

            <View style={styles.actionRow}>
                <TouchableOpacity
                    onPress={() => onLog(capture.id)}
                    activeOpacity={0.75}
                    style={[styles.logButton, { backgroundColor: colors.text }]}
                >
                    <ThemedText style={[styles.logLabel, { color: colors.background }]}>
                        Log
                    </ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={() => onDelete(capture)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                    style={[styles.deleteButton, { borderColor: colors.glassBorder }]}
                >
                    <Ionicons name="trash-outline" size={14} color={colors.textSecondary} />
                </TouchableOpacity>
            </View>
        </Animated.View>
    );
});

export function SharedLinksInbox() {
    const router = useRouter();
    const { colors, isLight } = useObsyTheme();
    const captures = useCaptureStore(state => state.captures);
    const deleteCapture = useCaptureStore(state => state.deleteCapture);

    const queued = useMemo(
        () => captures
            .filter(isPendingSharedLink)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
        [captures],
    );

    // Opens the mood + note flow on this specific link rather than the top of
    // the backlog, so tapping Log on a tile is about that tile.
    const handleLog = useCallback((id: string) => {
        router.push({ pathname: '/reflect', params: { focus: id } });
    }, [router]);

    const handleOpen = useCallback((id: string) => {
        router.push({ pathname: '/capture/[id]', params: { id } });
    }, [router]);

    const handleDelete = useCallback((capture: Capture) => {
        const what = capture.shared_link_title?.trim() || 'this link';
        Alert.alert(
            'Delete saved link?',
            `"${what}" will be removed. This cannot be undone.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => { deleteCapture(capture.id).catch(() => {}); },
                },
            ],
        );
    }, [deleteCapture]);

    const renderItem = useCallback(
        ({ item }: { item: Capture }) => (
            <QueuedTile
                capture={item}
                isLight={isLight}
                onLog={handleLog}
                onDelete={handleDelete}
                onOpen={handleOpen}
            />
        ),
        [isLight, handleLog, handleDelete, handleOpen],
    );

    if (queued.length === 0) return null;

    const preview = queued.slice(0, PREVIEW_COUNT);

    return (
        <View style={styles.container}>
            <View style={styles.headerRow}>
                <ThemedText style={[styles.sectionLabel, { color: colors.textTertiary }]}>
                    SHARED LINKS
                </ThemedText>
                <TouchableOpacity
                    onPress={() => router.push('/shared-links')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                    <ThemedText style={[styles.seeAll, { color: colors.textSecondary }]}>
                        {queued.length} waiting
                    </ThemedText>
                </TouchableOpacity>
            </View>

            <FlatList
                horizontal
                data={preview}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.listContent}
                // Home is inside a vertical ScrollView; the strip scrolls on its own axis.
                nestedScrollEnabled
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginTop: 28,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    sectionLabel: {
        fontFamily: 'SpaceMono',
        fontSize: 11,
        letterSpacing: 1.2,
        textTransform: 'uppercase',
    },
    seeAll: {
        fontSize: 12.5,
        fontWeight: '600',
    },
    listContent: {
        gap: 10,
        paddingRight: 8,
    },
    tileColumn: {
        width: TILE_SIZE,
    },
    savedAt: {
        marginTop: 6,
        fontSize: 10.5,
        letterSpacing: 0.1,
    },
    actionRow: {
        marginTop: 6,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    logButton: {
        flex: 1,
        height: 26,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    logLabel: {
        fontSize: 11.5,
        fontWeight: '700',
        letterSpacing: 0.2,
    },
    deleteButton: {
        width: 26,
        height: 26,
        borderRadius: 8,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
});

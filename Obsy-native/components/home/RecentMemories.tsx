import React, { useCallback } from 'react';
import { FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ThemedText } from '@/components/ui/ThemedText';
import { EntryGridTile } from '@/components/entries/EntryGridTile';
import { useObsyTheme } from '@/contexts/ThemeContext';
import type { Capture } from '@/types/capture';

const TILE_SIZE = 108;

interface RecentMemoriesProps {
    captures: Capture[];
    /** True once the initial fetch has resolved — gates the empty state so it never flashes. */
    hasFetched: boolean;
}

/** Horizontal strip of the latest entries under the home composer. */
export function RecentMemories({ captures, hasFetched }: RecentMemoriesProps) {
    const router = useRouter();
    const { colors, isLight } = useObsyTheme();

    const handleOpen = useCallback(
        (id: string) => {
            router.push(`/capture/${id}` as never);
        },
        [router]
    );

    const renderItem = useCallback(
        ({ item }: { item: Capture }) => (
            <Animated.View entering={FadeIn.duration(320)}>
                <EntryGridTile capture={item} size={TILE_SIZE} onPress={handleOpen} isLight={isLight} />
            </Animated.View>
        ),
        [handleOpen, isLight]
    );

    if (!hasFetched) return null;

    if (captures.length === 0) {
        return (
            <View style={styles.container}>
                <ThemedText style={[styles.sectionLabel, { color: colors.textTertiary }]}>
                    RECENT MEMORIES
                </ThemedText>
                <View style={[styles.emptyCard, { borderColor: colors.glassBorder }]}>
                    <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>
                        Capture your first moment
                    </ThemedText>
                    <ThemedText style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                        A photo, a note, your voice, or a mood — your day begins here.
                    </ThemedText>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.headerRow}>
                <ThemedText style={[styles.sectionLabel, { color: colors.textTertiary }]}>
                    RECENT MEMORIES
                </ThemedText>
                <TouchableOpacity
                    onPress={() => router.navigate('/(tabs)/gallery' as never)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                    <ThemedText style={[styles.seeAll, { color: colors.textSecondary }]}>
                        See all
                    </ThemedText>
                </TouchableOpacity>
            </View>

            <FlatList
                horizontal
                data={captures}
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
    emptyCard: {
        marginTop: 12,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderRadius: 16,
        paddingVertical: 26,
        paddingHorizontal: 20,
        alignItems: 'center',
    },
    emptyTitle: {
        fontSize: 16,
        fontWeight: '600',
        letterSpacing: -0.3,
        textAlign: 'center',
        marginBottom: 6,
    },
    emptySubtitle: {
        fontSize: 13.5,
        lineHeight: 20,
        textAlign: 'center',
    },
});

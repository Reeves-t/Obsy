/**
 * Shared Links — the full inbox.
 *
 * Everything shared into Obsy, in two sections: what is still queued, and what
 * has already been dealt with. Processing is a deliberate act here, unlike the
 * save that got it into the list, so each queued item offers the three real
 * decisions: keep it, reflect on it, or discard it.
 *
 * "Keep" exists on purpose. Plenty of saves are useful without being emotional,
 * and forcing a mood onto them would make the queue something users avoid
 * rather than clear.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    SectionList,
    Alert,
    Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ThemedText } from '@/components/ui/ThemedText';
import { ScreenWrapper, DEFAULT_TAB_BAR_HEIGHT } from '@/components/ScreenWrapper';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { useCaptureStore } from '@/lib/captureStore';
import { useCustomMoodStore } from '@/lib/customMoodStore';
import { MoodSelectionModal } from '@/components/capture/MoodSelectionModal';
import { SharedLinkRow } from '@/components/entries/SharedLinkRow';
import { MOODS } from '@/constants/Moods';
import { moodCache } from '@/lib/moodCache';
import { isPendingSharedLink, type Capture } from '@/types/capture';

export default function SharedLinksScreen() {
    const router = useRouter();
    const { colors } = useObsyTheme();
    const { captures, keepSharedLink, reflectSharedLink, deleteCapture } = useCaptureStore();
    const { getMoodById } = useCustomMoodStore();
    const params = useLocalSearchParams<{ focus?: string }>();

    // Expanding a row reveals its actions; only one is open at a time so the
    // list stays scannable.
    const [expandedId, setExpandedId] = useState<string | null>(
        typeof params.focus === 'string' ? params.focus : null,
    );
    const [moodTargetId, setMoodTargetId] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const { queued, processed } = useMemo(() => {
        const links = captures.filter(c => c.source_type === 'shared_link');
        const byNewest = (a: Capture, b: Capture) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        return {
            queued: links.filter(isPendingSharedLink).sort(byNewest),
            processed: links.filter(c => !isPendingSharedLink(c)).sort(byNewest),
        };
    }, [captures]);

    const sections = useMemo(() => {
        const out: { title: string; subtitle: string | null; data: Capture[] }[] = [];
        if (queued.length) {
            out.push({
                title: 'Waiting',
                subtitle: 'Saved while you were scrolling',
                data: queued,
            });
        }
        if (processed.length) {
            out.push({ title: 'Processed', subtitle: null, data: processed });
        }
        return out;
    }, [queued, processed]);

    const handleKeep = useCallback(async (id: string) => {
        setBusyId(id);
        try {
            await keepSharedLink(id);
            Haptics.selectionAsync().catch(() => {});
            setExpandedId(null);
        } catch {
            Alert.alert('Could not update', 'That didn’t save. Try again in a moment.');
        } finally {
            setBusyId(null);
        }
    }, [keepSharedLink]);

    const handleDiscard = useCallback((id: string) => {
        Alert.alert(
            'Discard this link?',
            'It will be removed from Obsy. This cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Discard',
                    style: 'destructive',
                    onPress: async () => {
                        setBusyId(id);
                        try {
                            await deleteCapture(id);
                            setExpandedId(null);
                        } catch {
                            Alert.alert('Could not discard', 'That didn’t work. Try again in a moment.');
                        } finally {
                            setBusyId(null);
                        }
                    },
                },
            ],
        );
    }, [deleteCapture]);

    const handleMoodSelected = useCallback(async (moodId: string) => {
        const targetId = moodTargetId;
        setMoodTargetId(null);
        if (!targetId) return;

        const moodName = getMoodById(moodId)?.name
            ?? MOODS.find(m => m.id === moodId)?.label
            ?? moodCache.getAllMoods().find(m => m.id === moodId)?.name
            ?? moodId;

        setBusyId(targetId);
        try {
            await reflectSharedLink(targetId, moodId, moodName, null, null);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            setExpandedId(null);
        } catch {
            Alert.alert('Could not save', 'That reflection didn’t save. Try again in a moment.');
        } finally {
            setBusyId(null);
        }
    }, [moodTargetId, getMoodById, reflectSharedLink]);

    const renderItem = useCallback(({ item }: { item: Capture }) => {
        const isPending = isPendingSharedLink(item);
        const expanded = expandedId === item.id;
        const busy = busyId === item.id;

        return (
            <View style={styles.itemWrap}>
                <SharedLinkRow
                    capture={item}
                    onPress={() => setExpandedId(expanded ? null : item.id)}
                />

                {expanded && (
                    <View style={styles.actions}>
                        <ActionButton
                            icon="open-outline"
                            label="Open"
                            color={colors.textSecondary}
                            disabled={busy}
                            onPress={() => {
                                const url = item.shared_link_url;
                                if (url) Linking.openURL(url).catch(() => {});
                            }}
                        />

                        {isPending && (
                            <>
                                <ActionButton
                                    icon="bookmark-outline"
                                    label="Keep"
                                    color={colors.textSecondary}
                                    disabled={busy}
                                    onPress={() => handleKeep(item.id)}
                                />
                                <ActionButton
                                    icon="heart-outline"
                                    label="Reflect"
                                    color={colors.text}
                                    disabled={busy}
                                    onPress={() => setMoodTargetId(item.id)}
                                />
                            </>
                        )}

                        <ActionButton
                            icon="trash-outline"
                            label="Discard"
                            color="#ff5a5a"
                            disabled={busy}
                            onPress={() => handleDiscard(item.id)}
                        />
                    </View>
                )}
            </View>
        );
    }, [expandedId, busyId, colors, handleKeep, handleDiscard]);

    return (
        <ScreenWrapper edges={['top', 'left', 'right']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
                    <Ionicons name="chevron-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <ThemedText style={[styles.headerTitle, { color: colors.text }]}>
                    Shared Links
                </ThemedText>
                <View style={styles.headerSpacer} />
            </View>

            <SectionList
                sections={sections}
                keyExtractor={item => item.id}
                renderItem={renderItem}
                stickySectionHeadersEnabled={false}
                contentContainerStyle={[
                    styles.listContent,
                    { paddingBottom: DEFAULT_TAB_BAR_HEIGHT + 40 },
                ]}
                renderSectionHeader={({ section }) => (
                    <View style={styles.sectionHeader}>
                        <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>
                            {section.title}
                        </ThemedText>
                        {section.subtitle ? (
                            <ThemedText style={[styles.sectionSubtitle, { color: colors.textTertiary }]}>
                                {section.subtitle}
                            </ThemedText>
                        ) : null}
                    </View>
                )}
                ListEmptyComponent={
                    <View style={styles.empty}>
                        <Ionicons name="share-outline" size={32} color={colors.textTertiary} />
                        <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>
                            Nothing shared yet
                        </ThemedText>
                        <ThemedText style={[styles.emptyBody, { color: colors.textSecondary }]}>
                            Share a post or page to Obsy and it will wait here until
                            you have a moment for it.
                        </ThemedText>
                    </View>
                }
            />

            <MoodSelectionModal
                visible={!!moodTargetId}
                selectedMood={null}
                onSelect={handleMoodSelected}
                onClose={() => setMoodTargetId(null)}
            />
        </ScreenWrapper>
    );
}

function ActionButton({
    icon,
    label,
    color,
    onPress,
    disabled,
}: {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    label: string;
    color: string;
    onPress: () => void;
    disabled?: boolean;
}) {
    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={disabled}
            style={[styles.actionButton, disabled && styles.actionDisabled]}
            activeOpacity={0.7}
        >
            <Ionicons name={icon} size={15} color={color} />
            <ThemedText style={[styles.actionLabel, { color }]}>{label}</ThemedText>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '700',
    },
    headerSpacer: {
        width: 24,
    },
    listContent: {
        paddingHorizontal: 16,
        gap: 8,
    },
    sectionHeader: {
        paddingTop: 16,
        paddingBottom: 8,
        gap: 2,
    },
    sectionTitle: {
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: 0.3,
        textTransform: 'uppercase',
    },
    sectionSubtitle: {
        fontSize: 12,
    },
    itemWrap: {
        gap: 6,
        marginBottom: 8,
    },
    actions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        paddingLeft: 4,
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 11,
        paddingVertical: 7,
        borderRadius: 12,
        backgroundColor: 'rgba(128,128,128,0.12)',
    },
    actionDisabled: {
        opacity: 0.45,
    },
    actionLabel: {
        fontSize: 12,
        fontWeight: '600',
    },
    empty: {
        alignItems: 'center',
        gap: 10,
        paddingTop: 80,
        paddingHorizontal: 32,
    },
    emptyTitle: {
        fontSize: 16,
        fontWeight: '700',
    },
    emptyBody: {
        fontSize: 13,
        textAlign: 'center',
        lineHeight: 19,
    },
});

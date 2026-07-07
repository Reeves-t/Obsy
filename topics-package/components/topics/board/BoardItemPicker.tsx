import React, { useMemo } from 'react';
import {
    Modal,
    StyleSheet,
    View,
    Text,
    Pressable,
    ScrollView,
    Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCaptureStore } from '@/lib/captureStore';
import { useTopicStore } from '@/lib/topicStore';
import { TopicEntryTile, TopicEntryItem } from '@/components/topics/TopicEntryTile';
import { AmbientBackground } from '@/components/ui/AmbientBackground';

const SCREEN_W = Dimensions.get('window').width;
const GRID_PADDING = 18;
const TILE_GAP = 10;
const TILE_SIZE = (SCREEN_W - GRID_PADDING * 2 - TILE_GAP) / 2;

export type BoardPickerMode = 'entry' | 'insight';

// The picker only ever surfaces captures or topic notes/insights (never file
// attachments), so we narrow the union for clean type-narrowing below.
type PickItem = Extract<TopicEntryItem, { kind: 'capture' | 'note' | 'insight' | 'missing_gaps' }>;

interface BoardItemPickerProps {
    visible: boolean;
    mode: BoardPickerMode;
    topicId: string;
    onClose: () => void;
    onPick: (item: TopicEntryItem) => void;
}

/**
 * A picker for dropping an existing topic capture (entry) or saved note/insight
 * onto the board. Reuses TopicEntryTile so the tiles match the Entries screen.
 */
export function BoardItemPicker({ visible, mode, topicId, onClose, onPick }: BoardItemPickerProps) {
    const insets = useSafeAreaInsets();
    const captures = useCaptureStore((s) => s.captures);
    const topicNotes = useTopicStore((s) => s.topicNotes);

    const items: PickItem[] = useMemo(() => {
        if (mode === 'entry') {
            return captures
                .filter((c) => c.tags?.includes(`topic:${topicId}`))
                .map((capture) => ({ kind: 'capture', capture }) as PickItem);
        }
        // insight mode: notes / insights / gaps saved against the topic
        return topicNotes
            .filter((n) => n.topicId === topicId)
            .map((note) => {
                const kind =
                    note.kind === 'insight'
                        ? 'insight'
                        : note.kind === 'missing_gaps'
                            ? 'missing_gaps'
                            : 'note';
                return { kind, note } as PickItem;
            });
    }, [mode, captures, topicNotes, topicId]);

    const title = mode === 'entry' ? 'Add a Topic Entry' : 'Add a Saved Insight';
    const emptyText =
        mode === 'entry'
            ? 'No captures in this topic yet.'
            : 'No saved notes or insights yet.';

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
            <View style={styles.root}>
                <AmbientBackground screenName="topics" />
                <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
                    <Text style={styles.topTitle}>{title}</Text>
                    <Pressable onPress={onClose} hitSlop={12}>
                        <Text style={styles.cancelBtn}>Done</Text>
                    </Pressable>
                </View>

                {items.length === 0 ? (
                    <View style={styles.emptyWrap}>
                        <Text style={styles.emptyText}>{emptyText}</Text>
                    </View>
                ) : (
                    <ScrollView
                        contentContainerStyle={styles.grid}
                        showsVerticalScrollIndicator={false}
                    >
                        {items.map((item, i) => (
                            <TopicEntryTile
                                key={item.kind === 'capture' ? item.capture.id : item.note.id + i}
                                item={item}
                                size={TILE_SIZE}
                                onPress={(picked) => {
                                    onPick(picked);
                                    onClose();
                                }}
                            />
                        ))}
                    </ScrollView>
                )}
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 18,
        paddingBottom: 12,
    },
    topTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: '#fff',
    },
    cancelBtn: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.7)',
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: TILE_GAP,
        paddingHorizontal: GRID_PADDING,
        paddingBottom: 40,
    },
    emptyWrap: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
    },
    emptyText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.5)',
        textAlign: 'center',
    },
});

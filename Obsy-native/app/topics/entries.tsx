import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
    StyleSheet,
    View,
    Text,
    Pressable,
    ScrollView,
    Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { useCaptureStore } from '@/lib/captureStore';
import { useTopicStore } from '@/lib/topicStore';
import { useTopicAttachmentStore } from '@/lib/topicAttachmentStore';
import {
    TopicEntryTile,
    TopicEntryItem,
    TOPIC_ENTRY_TYPE_LABELS,
} from '@/components/topics/TopicEntryTile';
import { TopicNoteViewerModal } from '@/components/topics/TopicNoteViewerModal';
import { TopicAttachmentViewerModal } from '@/components/topics/TopicAttachmentViewerModal';

const SCREEN_W = Dimensions.get('window').width;
const GRID_PADDING = 18;
const TILE_GAP = 10;
const TILE_SIZE = (SCREEN_W - GRID_PADDING * 2 - TILE_GAP) / 2;

type FilterKey = 'all' | TopicEntryItem['kind'];

const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'capture', label: 'Captures' },
    { key: 'attachment', label: 'Files' },
    { key: 'note', label: 'Notes' },
    { key: 'insight', label: 'Insights' },
    { key: 'missing_gaps', label: 'Gaps' },
];

const GROUP_ORDER: TopicEntryItem['kind'][] = ['capture', 'attachment', 'note', 'insight', 'missing_gaps'];

export default function TopicEntriesScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { topicId, topicTitle } = useLocalSearchParams<{
        topicId: string;
        topicTitle: string;
    }>();

    const captures = useCaptureStore(s => s.captures);
    const topicNotes = useTopicStore(s => s.topicNotes);
    const topic = useTopicStore(s => s.topics.find(t => t.id === topicId));
    const attachments = useTopicAttachmentStore(s => s.attachments);
    const loadAttachmentsForTopic = useTopicAttachmentStore(s => s.loadForTopic);

    const [filter, setFilter] = useState<FilterKey>('all');
    const [viewingNoteId, setViewingNoteId] = useState<string | null>(null);
    const [viewingAttachmentId, setViewingAttachmentId] = useState<string | null>(null);

    // Refresh attachments from the server whenever this screen mounts or topic changes.
    useEffect(() => {
        if (topicId) loadAttachmentsForTopic(topicId);
    }, [topicId, loadAttachmentsForTopic]);

    // Build unified entry list for this topic.
    const allItems: TopicEntryItem[] = useMemo(() => {
        if (!topicId) return [];

        const captureItems: TopicEntryItem[] = captures
            .filter(c => c.tags?.includes(`topic:${topicId}`))
            .map(c => ({ kind: 'capture' as const, capture: c }));

        const noteItems: TopicEntryItem[] = topicNotes
            .filter(n => n.topicId === topicId)
            .map(n => {
                const kind = (n.kind ?? 'note') as 'note' | 'insight' | 'missing_gaps';
                return { kind, note: n };
            });

        const attachmentItems: TopicEntryItem[] = attachments
            .filter(a => a.topic_id === topicId && !a.deleted_at)
            .map(a => ({ kind: 'attachment' as const, attachment: a }));

        const getDate = (i: TopicEntryItem): string =>
            i.kind === 'capture' ? i.capture.created_at
                : i.kind === 'attachment' ? i.attachment.created_at
                    : i.note.createdAt;

        return [...captureItems, ...noteItems, ...attachmentItems].sort(
            (a, b) => new Date(getDate(b)).getTime() - new Date(getDate(a)).getTime(),
        );
    }, [topicId, captures, topicNotes, attachments]);

    // Filter + group by kind for display.
    const grouped = useMemo(() => {
        const filtered = filter === 'all' ? allItems : allItems.filter(i => i.kind === filter);
        const groups: Record<TopicEntryItem['kind'], TopicEntryItem[]> = {
            capture: [],
            attachment: [],
            note: [],
            insight: [],
            missing_gaps: [],
        };
        for (const item of filtered) {
            groups[item.kind].push(item);
        }
        return groups;
    }, [allItems, filter]);

    const totalCount = allItems.length;

    const viewingNote = useMemo(() => {
        if (!viewingNoteId) return null;
        return topicNotes.find(n => n.id === viewingNoteId) ?? null;
    }, [viewingNoteId, topicNotes]);

    const viewingAttachment = useMemo(() => {
        if (!viewingAttachmentId) return null;
        return attachments.find(a => a.id === viewingAttachmentId) ?? null;
    }, [viewingAttachmentId, attachments]);

    const handleTilePress = useCallback(
        (item: TopicEntryItem) => {
            if (item.kind === 'capture') {
                router.push(`/capture/${item.capture.id}`);
                return;
            }
            if (item.kind === 'attachment') {
                setViewingAttachmentId(item.attachment.id);
                return;
            }
            setViewingNoteId(item.note.id);
        },
        [router],
    );

    const displayTitle = topicTitle || topic?.title || 'Topic';
    const filterCounts = useMemo<Record<FilterKey, number>>(
        () => ({
            all: allItems.length,
            capture: allItems.filter(i => i.kind === 'capture').length,
            attachment: allItems.filter(i => i.kind === 'attachment').length,
            note: allItems.filter(i => i.kind === 'note').length,
            insight: allItems.filter(i => i.kind === 'insight').length,
            missing_gaps: allItems.filter(i => i.kind === 'missing_gaps').length,
        }),
        [allItems],
    );

    return (
        <View style={[styles.root, { paddingTop: insets.top }]}>
            {/* Header */}
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
                    <ChevronLeft size={24} color="#e4e4ed" />
                </Pressable>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerEyebrow}>ENTRIES</Text>
                    <Text style={styles.headerTitle} numberOfLines={1}>
                        {displayTitle}
                    </Text>
                </View>
                <View style={styles.headerRight} />
            </View>

            {/* Filter chips */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterRow}
                style={styles.filterScroll}
            >
                {FILTERS.map(f => {
                    const active = filter === f.key;
                    const count = filterCounts[f.key];
                    return (
                        <Pressable
                            key={f.key}
                            onPress={() => setFilter(f.key)}
                            style={[styles.chip, active && styles.chipActive]}
                        >
                            <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                                {f.label}
                            </Text>
                            <Text style={[styles.chipCount, active && styles.chipCountActive]}>
                                {count}
                            </Text>
                        </Pressable>
                    );
                })}
            </ScrollView>

            {/* Body */}
            {totalCount === 0 ? (
                <View style={styles.emptyWrap}>
                    <Text style={styles.emptyTitle}>No entries yet</Text>
                    <Text style={styles.emptyBody}>
                        Captures, notes, and AI analyses linked to this topic will appear here.
                    </Text>
                </View>
            ) : (
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {GROUP_ORDER.map(kind => {
                        const items = grouped[kind];
                        if (items.length === 0) return null;
                        return (
                            <View key={kind} style={styles.group}>
                                <View style={styles.groupHeaderRow}>
                                    <Text style={styles.groupHeader}>
                                        {TOPIC_ENTRY_TYPE_LABELS[kind]}
                                    </Text>
                                    <Text style={styles.groupCount}>{items.length}</Text>
                                </View>
                                <View style={styles.grid}>
                                    {items.map(item => {
                                        const key =
                                            item.kind === 'capture' ? item.capture.id
                                                : item.kind === 'attachment' ? item.attachment.id
                                                    : item.note.id;
                                        return (
                                            <TopicEntryTile
                                                key={key}
                                                item={item}
                                                size={TILE_SIZE}
                                                onPress={handleTilePress}
                                            />
                                        );
                                    })}
                                </View>
                            </View>
                        );
                    })}
                </ScrollView>
            )}

            <TopicNoteViewerModal
                note={viewingNote}
                onClose={() => setViewingNoteId(null)}
            />

            <TopicAttachmentViewerModal
                attachment={viewingAttachment}
                onClose={() => setViewingAttachmentId(null)}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: '#06060a',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    backBtn: {
        padding: 4,
        width: 40,
    },
    headerCenter: {
        flex: 1,
        alignItems: 'center',
    },
    headerEyebrow: {
        fontSize: 10,
        fontWeight: '600',
        letterSpacing: 1.4,
        color: 'rgba(255,255,255,0.35)',
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
        letterSpacing: -0.2,
        marginTop: 2,
        maxWidth: 220,
    },
    headerRight: {
        width: 40,
    },
    filterScroll: {
        maxHeight: 48,
        flexGrow: 0,
    },
    filterRow: {
        paddingHorizontal: 16,
        paddingTop: 4,
        paddingBottom: 12,
        gap: 8,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    chipActive: {
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderColor: 'rgba(255,255,255,0.95)',
    },
    chipLabel: {
        fontSize: 12.5,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.7)',
    },
    chipLabelActive: {
        color: '#0b0c10',
    },
    chipCount: {
        fontSize: 11,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.35)',
    },
    chipCountActive: {
        color: 'rgba(11,12,16,0.55)',
    },
    scrollContent: {
        paddingHorizontal: GRID_PADDING,
        paddingBottom: 40,
        gap: 24,
    },
    group: {
        gap: 10,
    },
    groupHeaderRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        marginBottom: 2,
    },
    groupHeader: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1.0,
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.55)',
    },
    groupCount: {
        fontSize: 11,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.35)',
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: TILE_GAP,
    },
    emptyWrap: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 36,
        gap: 8,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.85)',
        letterSpacing: -0.2,
    },
    emptyBody: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.45)',
        textAlign: 'center',
        lineHeight: 20,
    },
});

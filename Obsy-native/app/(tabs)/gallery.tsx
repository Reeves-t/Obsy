import React, { useEffect, useMemo, useState, useCallback, memo } from 'react';
import { StyleSheet, View, FlatList, TouchableOpacity, Dimensions, Modal, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { DEFAULT_TAB_BAR_HEIGHT, ScreenWrapper } from '@/components/ScreenWrapper';
import { ThemedText } from '@/components/ui/ThemedText';
import { useCaptureStore, Capture } from '@/lib/captureStore';
import { useAuth } from '@/contexts/AuthContext';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useMoodResolver } from '@/hooks/useMoodResolver';
import { SharedLinkCard } from '@/components/entries/SharedLinkCard';

const { width } = Dimensions.get('window');

// ─── Filter types ────────────────────────────────────────────────────────────

type EntryFilter = 'all' | 'captures' | 'journals' | 'mic' | 'shared_links';
type ViewMode = 'timeline' | 'grid';

const FILTER_OPTIONS: { key: EntryFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'captures', label: 'Captures' },
    { key: 'journals', label: 'Journals' },
    { key: 'mic', label: 'Mic' },
    { key: 'shared_links', label: 'Shared Links' },
];

// ─── Timeline / List item shapes ─────────────────────────────────────────────

type TimelineItem =
    | { type: 'header'; title: string; id: string }
    | { type: 'row'; captures: Capture[]; id: string };

type ListItem =
    | { type: 'header'; title: string; id: string }
    | { type: 'entry'; capture: Capture; id: string };

// ─── Sub-components ───────────────────────────────────────────────────────────

const TimelineHeader = memo(function TimelineHeader({
    title,
    isLight,
    textColor,
}: { title: string; isLight: boolean; textColor: string }) {
    return (
        <View style={styles.dateHeader}>
            <ThemedText style={[styles.dateHeaderText, { color: textColor }]}>{title}</ThemedText>
            <View style={[
                styles.dateHeaderLine,
                { backgroundColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)' },
            ]} />
        </View>
    );
});

const TimelineCaptureItem = memo(function TimelineCaptureItem({
    capture,
    onPress,
    isLight,
    textTertiary,
    textSecondary,
}: {
    capture: Capture;
    onPress: (id: string) => void;
    isLight: boolean;
    textTertiary: string;
    textSecondary: string;
}) {
    const { getMoodDisplay } = useMoodResolver();
    const moodDisplay = getMoodDisplay(capture.mood_id, capture.mood_name_snapshot);
    const date = new Date(capture.created_at);
    const pillBgStyle = isLight ? styles.pillLight : undefined;
    const handlePress = useCallback(() => onPress(capture.id), [capture.id, onPress]);

    return (
        <TouchableOpacity activeOpacity={0.8} onPress={handlePress} style={styles.timelineItem}>
            <View style={styles.imageContainer}>
                <Image
                    source={{ uri: capture.image_url }}
                    style={styles.image}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={capture.id}
                />
            </View>
            <View style={styles.metaRow}>
                <ThemedText style={[styles.timeText, { color: textTertiary }]}>
                    {format(date, 'h:mm a')}
                </ThemedText>
                <View style={styles.metaRight}>
                    {moodDisplay && (
                        <View style={[styles.pill, pillBgStyle, { borderLeftColor: moodDisplay.color, borderLeftWidth: 2 }]}>
                            <ThemedText style={[styles.pillText, { color: textSecondary }]}>{moodDisplay.name}</ThemedText>
                        </View>
                    )}
                    {capture.note && capture.note.trim() !== '' && (
                        <View style={[styles.pill, pillBgStyle]}>
                            <ThemedText style={[styles.pillText, { color: textSecondary }]}>Journal</ThemedText>
                        </View>
                    )}
                </View>
            </View>
        </TouchableOpacity>
    );
});

const TimelineRow = memo(function TimelineRow({
    captures,
    onPress,
    isLight,
    textTertiary,
    textSecondary,
}: {
    captures: Capture[];
    onPress: (id: string) => void;
    isLight: boolean;
    textTertiary: string;
    textSecondary: string;
}) {
    return (
        <View style={styles.timelineRow}>
            {captures.map(capture => (
                <TimelineCaptureItem
                    key={capture.id}
                    capture={capture}
                    onPress={onPress}
                    isLight={isLight}
                    textTertiary={textTertiary}
                    textSecondary={textSecondary}
                />
            ))}
            {captures.length === 1 && <View style={styles.timelineItem} />}
        </View>
    );
});

const GridItem = memo(function GridItem({
    capture,
    onPress,
}: { capture: Capture; onPress: (id: string) => void }) {
    const handlePress = useCallback(() => onPress(capture.id), [capture.id, onPress]);
    return (
        <TouchableOpacity activeOpacity={0.8} onPress={handlePress} style={styles.gridItem}>
            <View style={styles.gridImageContainer}>
                <Image
                    source={{ uri: capture.image_url }}
                    style={styles.image}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={capture.id}
                />
            </View>
        </TouchableOpacity>
    );
});

const JournalEntryCard = memo(function JournalEntryCard({
    capture,
    onPress,
    textColor,
    textSecondary,
    textTertiary,
    isLight,
}: {
    capture: Capture;
    onPress: (id: string) => void;
    textColor: string;
    textSecondary: string;
    textTertiary: string;
    isLight: boolean;
}) {
    const date = new Date(capture.created_at);
    const isVoice = capture.source_type === 'voice';
    const isJournal = capture.source_type === 'journal';
    const handlePress = useCallback(() => onPress(capture.id), [capture.id, onPress]);
    const cardBg = isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)';
    const cardBorder = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';

    return (
        <TouchableOpacity
            activeOpacity={0.8}
            onPress={handlePress}
            style={[styles.journalCard, { backgroundColor: cardBg, borderColor: cardBorder }]}
        >
            <View style={styles.journalCardContent}>
                <View style={styles.journalCardTextArea}>
                    {(isVoice || isJournal) && (
                        <View style={styles.sourceTypeRow}>
                            <Ionicons name={isVoice ? 'mic' : 'pencil'} size={11} color={textTertiary} />
                            <ThemedText style={[styles.sourceTypeLabel, { color: textTertiary }]}>
                                {isVoice ? 'Voice' : 'Journal'}
                            </ThemedText>
                        </View>
                    )}
                    <ThemedText numberOfLines={3} style={[styles.journalCardNote, { color: textColor }]}>
                        {capture.note}
                    </ThemedText>
                    <ThemedText style={[styles.journalCardMeta, { color: textTertiary }]}>
                        {format(date, 'h:mm a')} · {format(date, 'MMM d, yyyy')}
                    </ThemedText>
                </View>
                {capture.image_url && capture.source_type !== 'journal' && capture.source_type !== 'voice' && (
                    <View style={styles.journalCardThumbnailContainer}>
                        <Image
                            source={{ uri: capture.image_url }}
                            style={styles.journalCardThumbnail}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                            recyclingKey={capture.id}
                        />
                    </View>
                )}
            </View>
        </TouchableOpacity>
    );
});

// ─── Filter Dropdown ──────────────────────────────────────────────────────────

function FilterDropdown({
    value,
    onChange,
    isLight,
    textColor,
    textSecondary,
    textTertiary,
}: {
    value: EntryFilter;
    onChange: (f: EntryFilter) => void;
    isLight: boolean;
    textColor: string;
    textSecondary: string;
    textTertiary: string;
}) {
    const [open, setOpen] = useState(false);
    const label = FILTER_OPTIONS.find(o => o.key === value)?.label ?? 'All';
    const toggleBg = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.07)';
    const menuBg = isLight ? '#F5F5F5' : '#161719';

    return (
        <View>
            <TouchableOpacity
                onPress={() => setOpen(v => !v)}
                style={[styles.filterTrigger, { backgroundColor: toggleBg }]}
                activeOpacity={0.8}
            >
                <ThemedText style={[styles.filterTriggerText, { color: textSecondary }]}>{label}</ThemedText>
                <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={13} color={textTertiary} />
            </TouchableOpacity>

            <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
                <TouchableOpacity style={styles.dropdownOverlay} activeOpacity={1} onPress={() => setOpen(false)}>
                    <View style={[styles.dropdownMenu, { backgroundColor: menuBg }]}>
                        {FILTER_OPTIONS.map(opt => (
                            <TouchableOpacity
                                key={opt.key}
                                onPress={() => { onChange(opt.key); setOpen(false); }}
                                style={[
                                    styles.dropdownItem,
                                    value === opt.key && styles.dropdownItemActive,
                                ]}
                            >
                                {value === opt.key && (
                                    <Ionicons name="checkmark" size={14} color={textColor} style={styles.dropdownCheck} />
                                )}
                                <ThemedText style={[
                                    styles.dropdownItemText,
                                    { color: value === opt.key ? textColor : textSecondary },
                                ]}>
                                    {opt.label}
                                </ThemedText>
                            </TouchableOpacity>
                        ))}
                    </View>
                </TouchableOpacity>
            </Modal>
        </View>
    );
}

// ─── Main Entries Screen ──────────────────────────────────────────────────────

export default function GalleryScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const { captures, fetchCaptures, loading } = useCaptureStore();
    const { colors, isLight } = useObsyTheme();
    const [viewMode, setViewMode] = useState<ViewMode>('timeline');
    const [filter, setFilter] = useState<EntryFilter>('all');

    const onBgText = colors.text;
    const onBgTextSecondary = colors.textSecondary;
    const onBgTextTertiary = colors.textTertiary;
    const toggleBg = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
    const toggleBorder = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
    const toggleActiveBg = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
    const iconActive = onBgText;
    const iconInactive = onBgTextTertiary;

    useEffect(() => { fetchCaptures(user); }, [user]);

    // ── Filtered captures per selected filter ──

    const filteredCaptures = useMemo(() => {
        switch (filter) {
            case 'captures':
                return captures.filter(c => c.image_url && c.source_type !== 'journal' && c.source_type !== 'voice' && c.source_type !== 'shared_link');
            case 'journals':
                return captures.filter(c => c.source_type === 'journal' || (c.note && c.note.trim().length > 0 && !c.image_url && c.source_type !== 'voice' && c.source_type !== 'shared_link'));
            case 'mic':
                return captures.filter(c => c.source_type === 'voice');
            case 'shared_links':
                return captures.filter(c => c.source_type === 'shared_link');
            case 'all':
            default:
                return captures;
        }
    }, [captures, filter]);

    // ── Photo-only captures (for captures tab timeline/grid) ──

    const photoCaptures = useMemo(() =>
        filteredCaptures.filter(c =>
            c.image_url &&
            c.source_type !== 'journal' &&
            c.source_type !== 'voice' &&
            c.source_type !== 'shared_link'
        ),
    [filteredCaptures]);

    // ── Timeline grouping ──

    const capturesByDate = useMemo(() => {
        const groups: Record<string, Capture[]> = {};
        photoCaptures.forEach(c => {
            const date = format(new Date(c.created_at), 'yyyy-MM-dd');
            if (!groups[date]) groups[date] = [];
            groups[date].push(c);
        });
        return groups;
    }, [photoCaptures]);

    const sortedDates = useMemo(() =>
        Object.keys(capturesByDate).sort((a, b) => new Date(b).getTime() - new Date(a).getTime()),
    [capturesByDate]);

    const timelineData = useMemo((): TimelineItem[] => {
        const data: TimelineItem[] = [];
        sortedDates.forEach(date => {
            data.push({
                type: 'header',
                title: format(new Date(date + 'T12:00:00'), 'EEEE, MMM d').toUpperCase(),
                id: `header-${date}`,
            });
            const dateCaptures = capturesByDate[date];
            for (let i = 0; i < dateCaptures.length; i += 2) {
                data.push({ type: 'row', captures: dateCaptures.slice(i, i + 2), id: `row-${date}-${i}` });
            }
        });
        return data;
    }, [sortedDates, capturesByDate]);

    // ── List view grouping (journals, mic, shared links, all) ──

    const listData = useMemo((): ListItem[] => {
        if (filter === 'captures') return []; // handled by timeline/grid
        const sorted = [...filteredCaptures].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        const groups: Record<string, Capture[]> = {};
        sorted.forEach(c => {
            const date = format(new Date(c.created_at), 'yyyy-MM-dd');
            if (!groups[date]) groups[date] = [];
            groups[date].push(c);
        });
        const data: ListItem[] = [];
        Object.keys(groups).sort((a, b) => new Date(b).getTime() - new Date(a).getTime()).forEach(date => {
            data.push({
                type: 'header',
                title: format(new Date(date + 'T12:00:00'), 'EEEE, MMM d').toUpperCase(),
                id: `lh-${date}`,
            });
            groups[date].forEach(c => data.push({ type: 'entry', capture: c, id: `le-${c.id}` }));
        });
        return data;
    }, [filteredCaptures, filter]);

    // ── Navigation ──

    const handleCapturePress = useCallback((captureId: string) => {
        router.push(`/capture/${captureId}`);
    }, [router]);

    // ── Render functions ──

    const renderTimelineItem = useCallback(({ item }: { item: TimelineItem }) => {
        if (item.type === 'header') {
            return <TimelineHeader title={item.title} isLight={isLight} textColor={onBgTextTertiary} />;
        }
        return (
            <TimelineRow
                captures={item.captures}
                onPress={handleCapturePress}
                isLight={isLight}
                textTertiary={onBgTextTertiary}
                textSecondary={onBgTextSecondary}
            />
        );
    }, [isLight, onBgTextTertiary, onBgTextSecondary, handleCapturePress]);

    const renderGridItem = useCallback(({ item }: { item: Capture }) => (
        <GridItem capture={item} onPress={handleCapturePress} />
    ), [handleCapturePress]);

    const renderListItem = useCallback(({ item }: { item: ListItem }) => {
        if (item.type === 'header') {
            return <TimelineHeader title={item.title} isLight={isLight} textColor={onBgTextTertiary} />;
        }
        const capture = item.capture;

        if (capture.source_type === 'shared_link') {
            return (
                <SharedLinkCard
                    capture={capture}
                    textColor={onBgText}
                    textSecondary={onBgTextSecondary}
                    textTertiary={onBgTextTertiary}
                    isLight={isLight}
                />
            );
        }

        return (
            <JournalEntryCard
                capture={capture}
                onPress={handleCapturePress}
                textColor={onBgText}
                textSecondary={onBgTextSecondary}
                textTertiary={onBgTextTertiary}
                isLight={isLight}
            />
        );
    }, [isLight, onBgText, onBgTextSecondary, onBgTextTertiary, handleCapturePress]);

    // ── Empty states ──

    const emptyLabel = useMemo(() => {
        switch (filter) {
            case 'captures': return { main: 'No captures yet.', sub: 'Start capturing your moments!' };
            case 'journals': return { main: 'No journal entries yet.', sub: 'Start writing your thoughts!' };
            case 'mic': return { main: 'No voice entries yet.', sub: 'Tap the mic to record your thoughts.' };
            case 'shared_links': return { main: 'No shared links yet.', sub: 'Share a post, article, song, or video into Obsy and attach a mood to it.' };
            default: return { main: 'Nothing here yet.', sub: 'Capture a moment, write, or share a link.' };
        }
    }, [filter]);

    const renderEmpty = useCallback(() =>
        !loading ? (
            <View style={styles.emptyState}>
                <ThemedText style={[styles.emptyText, { color: onBgTextSecondary }]}>{emptyLabel.main}</ThemedText>
                <ThemedText style={[styles.emptySubtext, { color: onBgTextTertiary }]}>{emptyLabel.sub}</ThemedText>
            </View>
        ) : null,
    [loading, emptyLabel, onBgTextSecondary, onBgTextTertiary]);

    // ── Decide which view to show ──
    const showGrid = filter === 'captures' && viewMode === 'grid';
    const showTimeline = filter === 'captures' && viewMode === 'timeline';
    const showList = filter !== 'captures';

    return (
        <ScreenWrapper screenName="gallery" hideFloatingBackground bottomInset={DEFAULT_TAB_BAR_HEIGHT}>
            {/* Header */}
            <View style={styles.header}>
                <ThemedText type="title" style={{ color: onBgText }}>Entries</ThemedText>
                <View style={styles.headerRight}>
                    <TouchableOpacity onPress={() => fetchCaptures(user)} style={styles.refreshButton}>
                        <Ionicons name="refresh" size={18} color={onBgTextSecondary} />
                    </TouchableOpacity>

                    {/* Filter dropdown */}
                    <FilterDropdown
                        value={filter}
                        onChange={setFilter}
                        isLight={isLight}
                        textColor={onBgText}
                        textSecondary={onBgTextSecondary}
                        textTertiary={onBgTextTertiary}
                    />

                    {/* Stack/grid toggle — only visible when Captures filter is active */}
                    {filter === 'captures' && (
                        <View style={[styles.viewToggle, { backgroundColor: toggleBg, borderColor: toggleBorder }]}>
                            <TouchableOpacity
                                onPress={() => setViewMode('timeline')}
                                style={[styles.toggleButton, viewMode === 'timeline' && [styles.toggleButtonActive, { backgroundColor: toggleActiveBg }]]}
                            >
                                <Ionicons name="list" size={16} color={viewMode === 'timeline' ? iconActive : iconInactive} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => setViewMode('grid')}
                                style={[styles.toggleButton, viewMode === 'grid' && [styles.toggleButtonActive, { backgroundColor: toggleActiveBg }]]}
                            >
                                <Ionicons name="grid" size={16} color={viewMode === 'grid' ? iconActive : iconInactive} />
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </View>

            {/* Content */}
            {showTimeline && (
                <FlatList
                    key="timeline"
                    data={timelineData}
                    renderItem={renderTimelineItem}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={renderEmpty}
                    removeClippedSubviews
                    windowSize={7}
                    initialNumToRender={10}
                    maxToRenderPerBatch={5}
                />
            )}
            {showGrid && (
                <FlatList
                    key="grid"
                    data={photoCaptures}
                    renderItem={renderGridItem}
                    keyExtractor={item => item.id}
                    numColumns={3}
                    contentContainerStyle={styles.gridContent}
                    columnWrapperStyle={styles.gridRow}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={renderEmpty}
                    removeClippedSubviews
                    windowSize={7}
                    initialNumToRender={15}
                    maxToRenderPerBatch={6}
                />
            )}
            {showList && (
                <FlatList
                    key={`list-${filter}`}
                    data={listData}
                    renderItem={renderListItem}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={renderEmpty}
                    removeClippedSubviews
                    windowSize={7}
                    initialNumToRender={10}
                    maxToRenderPerBatch={5}
                />
            )}
        </ScreenWrapper>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 20,
        backgroundColor: 'transparent',
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    refreshButton: {
        padding: 8,
    },
    // Filter dropdown trigger
    filterTrigger: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 20,
    },
    filterTriggerText: {
        fontSize: 13,
        fontWeight: '500',
    },
    // Dropdown overlay + menu
    dropdownOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'flex-start',
        alignItems: 'flex-end',
        paddingTop: 110,
        paddingRight: 20,
    },
    dropdownMenu: {
        borderRadius: 14,
        paddingVertical: 6,
        minWidth: 160,
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 12,
    },
    dropdownItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 11,
        gap: 8,
    },
    dropdownItemActive: {
        // no background fill; checkmark indicates selection
    },
    dropdownCheck: {
        // already indented via gap
    },
    dropdownItemText: {
        fontSize: 14,
        fontWeight: '400',
    },
    // View toggle (stack/grid)
    viewToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 20,
        padding: 4,
        borderWidth: 1,
    },
    toggleButton: {
        padding: 8,
        borderRadius: 16,
    },
    toggleButtonActive: {
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    // List/grid layouts
    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 100,
    },
    gridContent: {
        paddingHorizontal: 16,
        paddingBottom: 100,
    },
    gridRow: {
        gap: 8,
        marginBottom: 8,
    },
    // Date header
    dateHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginTop: 24,
        marginBottom: 16,
    },
    dateHeaderText: {
        fontSize: 12,
        fontWeight: '500',
        letterSpacing: 1,
    },
    dateHeaderLine: {
        flex: 1,
        height: 1,
    },
    // Timeline items
    timelineRow: {
        flexDirection: 'row',
        gap: 16,
        marginBottom: 16,
    },
    timelineItem: {
        flex: 1,
    },
    imageContainer: {
        aspectRatio: 1,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#000',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    image: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    metaRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 4,
        paddingTop: 8,
    },
    metaRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    timeText: {
        fontSize: 11,
        fontWeight: '500',
    },
    pill: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
    },
    pillLight: {
        backgroundColor: 'rgba(0,0,0,0.05)',
    },
    pillText: {
        fontSize: 10,
    },
    // Grid items
    gridItem: {
        flex: 1,
        maxWidth: (width - 32 - 16) / 3,
    },
    gridImageContainer: {
        aspectRatio: 1,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: '#000',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    // Journal cards
    journalCard: {
        marginBottom: 12,
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
    },
    journalCardContent: {
        flexDirection: 'row',
        gap: 12,
    },
    journalCardTextArea: {
        flex: 1,
        gap: 8,
    },
    journalCardNote: {
        fontSize: 15,
        lineHeight: 22,
    },
    journalCardMeta: {
        fontSize: 12,
    },
    journalCardThumbnailContainer: {
        width: 60,
        height: 60,
        borderRadius: 8,
        overflow: 'hidden',
        opacity: 0.7,
    },
    journalCardThumbnail: {
        width: '100%',
        height: '100%',
    },
    sourceTypeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginBottom: 2,
    },
    sourceTypeLabel: {
        fontSize: 11,
        fontWeight: '500',
        opacity: 0.6,
        letterSpacing: 0.5,
    },
    // Empty state
    emptyState: {
        padding: 40,
        alignItems: 'center',
        gap: 8,
    },
    emptyText: {
        fontSize: 16,
    },
    emptySubtext: {
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
        paddingHorizontal: 20,
    },
});

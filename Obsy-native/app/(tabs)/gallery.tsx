import React, { useEffect, useMemo, useState, useCallback, memo } from 'react';
import { StyleSheet, View, FlatList, TouchableOpacity, Dimensions, Modal } from 'react-native';
import { Image } from 'expo-image';
import { DEFAULT_TAB_BAR_HEIGHT, ScreenWrapper } from '@/components/ScreenWrapper';
import { ThemedText } from '@/components/ui/ThemedText';
import { useCaptureStore, Capture } from '@/lib/captureStore';
import { useAuth } from '@/contexts/AuthContext';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { SharedLinkCard } from '@/components/entries/SharedLinkCard';
import { EntryGridTile } from '@/components/entries/EntryGridTile';

const { width } = Dimensions.get('window');

// ─── Filter types ────────────────────────────────────────────────────────────

type EntryFilter = 'all' | 'captures' | 'journals' | 'mic' | 'shared_links';
type ViewMode = 'grid' | 'list';

// Grid layout: 3 columns, 16px horizontal padding, 8px gap between tiles
const GRID_H_PADDING = 16;
const GRID_GAP = 8;
const GRID_COLS = 3;
const GRID_TILE_SIZE = Math.floor((width - GRID_H_PADDING * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS);

const FILTER_OPTIONS: { key: EntryFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'captures', label: 'Captures' },
    { key: 'journals', label: 'Journals' },
    { key: 'mic', label: 'Mic' },
    { key: 'shared_links', label: 'Shared Links' },
];

// ─── Grid / List item shapes ─────────────────────────────────────────────────

type GridItemData =
    | { type: 'header'; title: string; id: string }
    | { type: 'row'; captures: Capture[]; id: string };

type ListItem =
    | { type: 'header'; title: string; id: string }
    | { type: 'entry'; capture: Capture; id: string };

// ─── Sub-components ───────────────────────────────────────────────────────────

const DateHeader = memo(function DateHeader({
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

const GridRow = memo(function GridRow({
    captures,
    onPress,
    isLight,
}: {
    captures: Capture[];
    onPress: (id: string) => void;
    isLight: boolean;
}) {
    return (
        <View style={styles.gridRow}>
            {captures.map(capture => (
                <EntryGridTile
                    key={capture.id}
                    capture={capture}
                    size={GRID_TILE_SIZE}
                    onPress={onPress}
                    isLight={isLight}
                />
            ))}
            {/* Pad row with empty slots to keep last row aligned to columns */}
            {captures.length < GRID_COLS &&
                Array.from({ length: GRID_COLS - captures.length }).map((_, i) => (
                    <View key={`pad-${i}`} style={{ width: GRID_TILE_SIZE, height: GRID_TILE_SIZE }} />
                ))}
        </View>
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
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
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

    // ── Date grouping (used by both grid and list views) ──

    const groupedByDate = useMemo(() => {
        const sorted = [...filteredCaptures].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        const groups: Record<string, Capture[]> = {};
        sorted.forEach(c => {
            const date = format(new Date(c.created_at), 'yyyy-MM-dd');
            if (!groups[date]) groups[date] = [];
            groups[date].push(c);
        });
        const dates = Object.keys(groups).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
        return { groups, dates };
    }, [filteredCaptures]);

    // ── Grid view data (3-per-row tiles, all entry types) ──

    const gridData = useMemo((): GridItemData[] => {
        const data: GridItemData[] = [];
        groupedByDate.dates.forEach(date => {
            data.push({
                type: 'header',
                title: format(new Date(date + 'T12:00:00'), 'EEEE, MMM d').toUpperCase(),
                id: `gh-${date}`,
            });
            const dateCaptures = groupedByDate.groups[date];
            for (let i = 0; i < dateCaptures.length; i += GRID_COLS) {
                data.push({
                    type: 'row',
                    captures: dateCaptures.slice(i, i + GRID_COLS),
                    id: `gr-${date}-${i}`,
                });
            }
        });
        return data;
    }, [groupedByDate]);

    // ── List view data (full-length cards, all entry types) ──

    const listData = useMemo((): ListItem[] => {
        const data: ListItem[] = [];
        groupedByDate.dates.forEach(date => {
            data.push({
                type: 'header',
                title: format(new Date(date + 'T12:00:00'), 'EEEE, MMM d').toUpperCase(),
                id: `lh-${date}`,
            });
            groupedByDate.groups[date].forEach(c => data.push({ type: 'entry', capture: c, id: `le-${c.id}` }));
        });
        return data;
    }, [groupedByDate]);

    // ── Navigation ──

    const handleCapturePress = useCallback((captureId: string) => {
        router.push(`/capture/${captureId}`);
    }, [router]);

    // ── Render functions ──

    const renderGridItem = useCallback(({ item }: { item: GridItemData }) => {
        if (item.type === 'header') {
            return <DateHeader title={item.title} isLight={isLight} textColor={onBgTextTertiary} />;
        }
        return (
            <GridRow
                captures={item.captures}
                onPress={handleCapturePress}
                isLight={isLight}
            />
        );
    }, [isLight, onBgTextTertiary, handleCapturePress]);

    const renderListItem = useCallback(({ item }: { item: ListItem }) => {
        if (item.type === 'header') {
            return <DateHeader title={item.title} isLight={isLight} textColor={onBgTextTertiary} />;
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
    const showGrid = viewMode === 'grid';
    const showList = viewMode === 'list';

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

                    {/* Grid/list view toggle — visible for all filters */}
                    <View style={[styles.viewToggle, { backgroundColor: toggleBg, borderColor: toggleBorder }]}>
                        <TouchableOpacity
                            onPress={() => setViewMode('grid')}
                            style={[styles.toggleButton, viewMode === 'grid' && [styles.toggleButtonActive, { backgroundColor: toggleActiveBg }]]}
                        >
                            <Ionicons name="grid" size={16} color={viewMode === 'grid' ? iconActive : iconInactive} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => setViewMode('list')}
                            style={[styles.toggleButton, viewMode === 'list' && [styles.toggleButtonActive, { backgroundColor: toggleActiveBg }]]}
                        >
                            <Ionicons name="list" size={16} color={viewMode === 'list' ? iconActive : iconInactive} />
                        </TouchableOpacity>
                    </View>
                </View>
            </View>

            {/* Content */}
            {showGrid && (
                <FlatList
                    key={`grid-${filter}`}
                    data={gridData}
                    renderItem={renderGridItem}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.gridContent}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={renderEmpty}
                    removeClippedSubviews
                    windowSize={7}
                    initialNumToRender={12}
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
        paddingHorizontal: GRID_H_PADDING,
        paddingBottom: 100,
    },
    gridRow: {
        flexDirection: 'row',
        gap: GRID_GAP,
        marginBottom: GRID_GAP,
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

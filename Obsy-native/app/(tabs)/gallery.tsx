import React, { useEffect, useMemo, useState, useCallback, memo } from 'react';
import { StyleSheet, View, FlatList, TouchableOpacity, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ThemedText } from '@/components/ui/ThemedText';
import { useCaptureStore, Capture } from '@/lib/captureStore';
import { useAuth } from '@/contexts/AuthContext';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { useRouter } from 'expo-router';
import Colors from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { MOODS } from '@/constants/Moods';

import { useMoodResolver } from '@/hooks/useMoodResolver';

const { width } = Dimensions.get('window');

type ViewMode = 'timeline' | 'grid';
type ContentType = 'photos' | 'journals';

// Type for timeline data that includes headers
type TimelineItem =
    | { type: 'header'; title: string; id: string }
    | { type: 'row'; captures: Capture[]; id: string };

// Type for journal list data that includes headers
type JournalListItem =
    | { type: 'header'; title: string; id: string }
    | { type: 'entry'; capture: Capture; id: string };

// ... (constants 31-35)

// Memoized Timeline Header component
interface TimelineHeaderProps {
    title: string;
    isLight: boolean;
    textColor: string;
}

const TimelineHeader = memo(function TimelineHeader({ title, isLight, textColor }: TimelineHeaderProps) {
    return (
        <View style={styles.dateHeader}>
            <ThemedText style={[styles.dateHeaderText, { color: textColor }]}>{title}</ThemedText>
            <View style={[
                styles.dateHeaderLine,
                { backgroundColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)' }
            ]} />
        </View>
    );
});

// Memoized Timeline Capture Item component
interface TimelineCaptureItemProps {
    capture: Capture;
    onPress: (id: string) => void;
    isLight: boolean;
    textTertiary: string;
    textSecondary: string;
}

const TimelineCaptureItem = memo(function TimelineCaptureItem({
    capture,
    onPress,
    isLight,
    textTertiary,
    textSecondary
}: TimelineCaptureItemProps) {
    const { getMoodDisplay } = useMoodResolver();
    const moodDisplay = getMoodDisplay(capture.mood_id, capture.mood_name_snapshot);
    const date = new Date(capture.created_at);
    const pillBgStyle = isLight ? styles.pillLight : undefined;

    const handlePress = useCallback(() => {
        onPress(capture.id);
    }, [capture.id, onPress]);

    return (
        <TouchableOpacity
            activeOpacity={0.8}
            onPress={handlePress}
            style={styles.timelineItem}
        >
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

// Memoized Timeline Row component
interface TimelineRowProps {
    captures: Capture[];
    onPress: (id: string) => void;
    isLight: boolean;
    textTertiary: string;
    textSecondary: string;
}

const TimelineRow = memo(function TimelineRow({
    captures,
    onPress,
    isLight,
    textTertiary,
    textSecondary
}: TimelineRowProps) {
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

// Memoized Grid Item component
interface GridItemProps {
    capture: Capture;
    onPress: (id: string) => void;
}

const GridItem = memo(function GridItem({ capture, onPress }: GridItemProps) {
    const handlePress = useCallback(() => {
        onPress(capture.id);
    }, [capture.id, onPress]);

    return (
        <TouchableOpacity
            activeOpacity={0.8}
            onPress={handlePress}
            style={styles.gridItem}
        >
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

// Memoized Journal Entry Card component
interface JournalEntryCardProps {
    capture: Capture;
    onPress: (id: string) => void;
    textColor: string;
    textSecondary: string;
    textTertiary: string;
    isLight: boolean;
}

const JournalEntryCard = memo(function JournalEntryCard({
    capture,
    onPress,
    textColor,
    textSecondary,
    textTertiary,
    isLight,
}: JournalEntryCardProps) {
    const date = new Date(capture.created_at);

    const handlePress = useCallback(() => {
        onPress(capture.id);
    }, [capture.id, onPress]);

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
                    <ThemedText numberOfLines={3} style={[styles.journalCardNote, { color: textColor }]}>
                        {capture.note}
                    </ThemedText>
                    <ThemedText style={[styles.journalCardMeta, { color: textTertiary }]}>
                        {format(date, 'h:mm a')} · {format(date, 'MMM d, yyyy')}
                    </ThemedText>
                </View>
                {capture.image_url && (
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

export default function GalleryScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const { captures, fetchCaptures, loading } = useCaptureStore();
    const { colors, isLight } = useObsyTheme();
    const [viewMode, setViewMode] = useState<ViewMode>('timeline');
    const [contentType, setContentType] = useState<ContentType>('photos');

    // Theme-aware on-background colors
    const onBgText = colors.text;
    const onBgTextSecondary = colors.textSecondary;
    const onBgTextTertiary = colors.textTertiary;

    useEffect(() => {
        fetchCaptures(user);
    }, [user]);

    // Group captures by date for timeline view
    const capturesByDate = useMemo(() => {
        const groups: Record<string, Capture[]> = {};
        captures.forEach(capture => {
            const date = format(new Date(capture.created_at), 'yyyy-MM-dd');
            if (!groups[date]) {
                groups[date] = [];
            }
            groups[date].push(capture);
        });
        return groups;
    }, [captures]);

    // Sorted dates descending
    const sortedDates = useMemo(() => {
        return Object.keys(capturesByDate).sort((a, b) =>
            new Date(b).getTime() - new Date(a).getTime()
        );
    }, [capturesByDate]);

    // Build timeline data with headers and rows of 2 captures each
    const timelineData = useMemo(() => {
        const data: TimelineItem[] = [];
        sortedDates.forEach(date => {
            // Add header
            data.push({
                type: 'header',
                title: format(new Date(date), 'EEEE, MMM d').toUpperCase(),
                id: `header-${date}`
            });
            // Add rows of 2 captures each
            const dateCaptures = capturesByDate[date];
            for (let i = 0; i < dateCaptures.length; i += 2) {
                data.push({
                    type: 'row',
                    captures: dateCaptures.slice(i, i + 2),
                    id: `row-${date}-${i}`
                });
            }
        });
        return data;
    }, [sortedDates, capturesByDate]);

    // Filter captures with notes (journal entries)
    const journalEntries = useMemo(() => {
        return captures
            .filter(c => c.note && c.note.trim().length > 0)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }, [captures]);

    // Group journal entries by date
    const journalsByDate = useMemo(() => {
        const groups: Record<string, Capture[]> = {};
        journalEntries.forEach(capture => {
            const date = format(new Date(capture.created_at), 'yyyy-MM-dd');
            if (!groups[date]) groups[date] = [];
            groups[date].push(capture);
        });
        return groups;
    }, [journalEntries]);

    // Build journal list data with headers and entries
    const journalListData = useMemo(() => {
        const data: JournalListItem[] = [];
        const sortedJournalDates = Object.keys(journalsByDate).sort((a, b) =>
            new Date(b).getTime() - new Date(a).getTime()
        );
        sortedJournalDates.forEach(date => {
            // Add header
            data.push({
                type: 'header',
                title: format(new Date(date), 'EEEE, MMM d').toUpperCase(),
                id: `journal-header-${date}`
            });
            // Add entries
            journalsByDate[date].forEach(capture => {
                data.push({
                    type: 'entry',
                    capture,
                    id: `journal-entry-${capture.id}`
                });
            });
        });
        return data;
    }, [journalsByDate]);

    // Stable callback for navigation
    const handleCapturePress = useCallback((captureId: string) => {
        router.push(`/capture/${captureId}`);
    }, [router]);

    // Memoized render function for timeline items
    const renderTimelineItem = useCallback(({ item }: { item: TimelineItem }) => {
        if (item.type === 'header') {
            return (
                <TimelineHeader
                    title={item.title}
                    isLight={isLight}
                    textColor={onBgTextTertiary}
                />
            );
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

    // Memoized render function for grid items
    const renderGridItem = useCallback(({ item }: { item: Capture }) => {
        return (
            <GridItem capture={item} onPress={handleCapturePress} />
        );
    }, [handleCapturePress]);

    // NOTE: getItemLayout removed for timeline - mixed item heights (headers vs rows)
    // cause incorrect scroll positions. FlatList will dynamically measure items.

    // NOTE: getItemLayout removed for grid - row-based calculation was incorrect.
    // FlatList handles numColumns grids better with dynamic measurement.

    // Memoized render function for journal items
    const renderJournalItem = useCallback(({ item }: { item: JournalListItem }) => {
        if (item.type === 'header') {
            return (
                <TimelineHeader
                    title={item.title}
                    isLight={isLight}
                    textColor={onBgTextTertiary}
                />
            );
        }

        return (
            <JournalEntryCard
                capture={item.capture}
                onPress={handleCapturePress}
                textColor={onBgText}
                textSecondary={onBgTextSecondary}
                textTertiary={onBgTextTertiary}
                isLight={isLight}
            />
        );
    }, [isLight, onBgText, onBgTextSecondary, onBgTextTertiary, handleCapturePress]);

    // NOTE: getItemLayout removed for journals - mixed item heights cause scroll issues.

    const renderEmptyState = () => (
        !loading ? (
            <View style={styles.emptyState}>
                <ThemedText style={[styles.emptyText, { color: onBgTextSecondary }]}>No captures yet.</ThemedText>
                <ThemedText style={[styles.emptySubtext, { color: onBgTextTertiary }]}>Start capturing your moments!</ThemedText>
            </View>
        ) : null
    );

    const renderJournalsEmptyState = () => (
        !loading ? (
            <View style={styles.emptyState}>
                <ThemedText style={[styles.emptyText, { color: onBgTextSecondary }]}>No journal entries yet.</ThemedText>
                <ThemedText style={[styles.emptySubtext, { color: onBgTextTertiary }]}>Start writing your thoughts!</ThemedText>
            </View>
        ) : null
    );

    // Theme-aware toggle container colors
    const toggleBg = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
    const toggleBorder = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
    const toggleActiveBg = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
    const iconActive = onBgText;
    const iconInactive = onBgTextTertiary;

    return (
        <ScreenWrapper screenName="gallery" hideFloatingBackground>
            {/* Header */}
            <View style={styles.header}>
                <ThemedText type="title" style={{ color: onBgText }}>Gallery</ThemedText>
                <View style={styles.headerRight}>
                    <TouchableOpacity onPress={() => fetchCaptures(user)} style={styles.refreshButton}>
                        <Ionicons name="refresh" size={18} color={onBgTextSecondary} />
                    </TouchableOpacity>
                    {/* Primary toggle: Photos / Journals */}
                    <View style={[styles.contentToggle, { backgroundColor: toggleBg, borderColor: toggleBorder }]}>
                        <TouchableOpacity
                            onPress={() => setContentType('photos')}
                            style={[
                                styles.contentToggleButton,
                                contentType === 'photos' && [styles.toggleButtonActive, { backgroundColor: toggleActiveBg }]
                            ]}
                        >
                            <ThemedText style={[
                                styles.contentToggleText,
                                { color: contentType === 'photos' ? iconActive : iconInactive }
                            ]}>Photos</ThemedText>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => setContentType('journals')}
                            style={[
                                styles.contentToggleButton,
                                contentType === 'journals' && [styles.toggleButtonActive, { backgroundColor: toggleActiveBg }]
                            ]}
                        >
                            <ThemedText style={[
                                styles.contentToggleText,
                                { color: contentType === 'journals' ? iconActive : iconInactive }
                            ]}>Journals</ThemedText>
                        </TouchableOpacity>
                    </View>
                    {/* Secondary toggle: Timeline / Grid (only for Photos) */}
                    {contentType === 'photos' && (
                        <View style={[styles.viewToggle, { backgroundColor: toggleBg, borderColor: toggleBorder }]}>
                            <TouchableOpacity
                                onPress={() => setViewMode('timeline')}
                                style={[
                                    styles.toggleButton,
                                    viewMode === 'timeline' && [styles.toggleButtonActive, { backgroundColor: toggleActiveBg }]
                                ]}
                            >
                                <Ionicons
                                    name="list"
                                    size={16}
                                    color={viewMode === 'timeline' ? iconActive : iconInactive}
                                />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => setViewMode('grid')}
                                style={[
                                    styles.toggleButton,
                                    viewMode === 'grid' && [styles.toggleButtonActive, { backgroundColor: toggleActiveBg }]
                                ]}
                            >
                                <Ionicons
                                    name="grid"
                                    size={16}
                                    color={viewMode === 'grid' ? iconActive : iconInactive}
                                />
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </View>

            {contentType === 'photos' ? (
                viewMode === 'timeline' ? (
                    <FlatList
                        key="timeline"
                        data={timelineData}
                        renderItem={renderTimelineItem}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                        ListEmptyComponent={renderEmptyState}
                        // Performance optimizations
                        removeClippedSubviews={true}
                        windowSize={7}
                        initialNumToRender={10}
                        maxToRenderPerBatch={5}
                    />
                ) : (
                    <FlatList
                        key="grid"
                        data={captures}
                        renderItem={renderGridItem}
                        keyExtractor={(item) => item.id}
                        numColumns={3}
                        contentContainerStyle={styles.gridContent}
                        columnWrapperStyle={styles.gridRow}
                        showsVerticalScrollIndicator={false}
                        ListEmptyComponent={renderEmptyState}
                        // Performance optimizations
                        removeClippedSubviews={true}
                        windowSize={7}
                        initialNumToRender={15}
                        maxToRenderPerBatch={6}
                    />
                )
            ) : (
                <FlatList
                    key="journals"
                    data={journalListData}
                    renderItem={renderJournalItem}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={renderJournalsEmptyState}
                    // Performance optimizations
                    removeClippedSubviews={true}
                    windowSize={7}
                    initialNumToRender={10}
                    maxToRenderPerBatch={5}
                />
            )}
        </ScreenWrapper>
    );
}

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
        gap: 12,
    },
    refreshButton: {
        padding: 8,
    },
    viewToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 20,
        padding: 4,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    toggleButton: {
        padding: 8,
        borderRadius: 16,
    },
    toggleButtonActive: {
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
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
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: 1,
    },
    dateHeaderLine: {
        flex: 1,
        height: 1,
    },
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
        color: 'rgba(255,255,255,0.5)',
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
        color: 'rgba(255,255,255,0.6)',
    },
    gridItem: {
        flex: 1,
        maxWidth: (width - 32 - 16) / 3, // Account for padding and gaps
    },
    gridImageContainer: {
        aspectRatio: 1,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: '#000',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    emptyState: {
        padding: 40,
        alignItems: 'center',
        gap: 8,
    },
    emptyText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 16,
    },
    emptySubtext: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 14,
    },
    // Content toggle styles (Photos/Journals)
    contentToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 20,
        padding: 4,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    contentToggleButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
    },
    contentToggleText: {
        fontSize: 13,
        fontWeight: '500',
    },
    // Journal card styles
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
});

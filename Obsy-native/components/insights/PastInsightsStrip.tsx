import React, { useMemo, useRef, useCallback, useEffect, memo } from "react";
import { Image, FlatList, StyleSheet, TouchableOpacity, View, ViewToken } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { GlassCard } from "@/components/ui/GlassCard";
import { ThemedText } from "@/components/ui/ThemedText";
import Colors from "@/constants/Colors";
import { DailyInsightSnapshot } from "@/lib/insightsAnalytics";
import { Capture } from "@/lib/captureStore";
import { InsightHistory } from "@/services/insightHistory";

interface PastInsightsStripProps {
    days: DailyInsightSnapshot[];
    selectedDate: string | null;
    onSelectDay: (day: DailyInsightSnapshot) => void;
    captures: Capture[];
    selectedInsight: InsightHistory | null;
    flat?: boolean;
}

// Brand colors for selected card rotation: Green, Blue, Purple, Orange
const BRAND_COLORS = [
    Colors.highlight.emerald, // Green - #10B981
    Colors.highlight.blue,    // Blue - #60A5FA
    Colors.highlight.purple,  // Purple - #A855F7
    Colors.highlight.orange,  // Orange - #F97316
];

// Card dimensions for getItemLayout
const CARD_WIDTH_SELECTED = 80;
const CARD_WIDTH_UNSELECTED = 64;
const CARD_GAP = 10;
// Use unselected width for layout since most cards are unselected
const ITEM_WIDTH = CARD_WIDTH_UNSELECTED + CARD_GAP;

export const PastInsightsStrip = memo(function PastInsightsStrip({
    days,
    selectedDate,
    onSelectDay,
    captures,
    selectedInsight,
    flat = false,
}: PastInsightsStripProps) {
    const router = useRouter();
    const flatListRef = useRef<FlatList>(null);
    const previousSelectedDate = useRef<string | null>(null);

    // Process days: limit to 7 days and order oldest first (chronological)
    // Today is at the END (last index) so swiping LEFT goes to older days
    const processedDays = useMemo(() => {
        // Sort days by date ascending (oldest first, newest/today last)
        const sorted = [...days].sort((a, b) =>
            new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        return sorted.slice(-7); // Take last 7 days (most recent 7)
    }, [days]);

    const selectedCaptures = useMemo(() => {
        if (!selectedDate) return [];
        if (selectedInsight?.capture_ids?.length) {
            return captures.filter((c) => selectedInsight.capture_ids?.includes(c.id));
        }
        return captures.filter((c) => c.created_at.startsWith(selectedDate));
    }, [captures, selectedDate, selectedInsight]);

    const visibleCaptures = selectedCaptures.slice(0, 8);
    const extraCount = selectedCaptures.length - visibleCaptures.length;

    // Get the brand color for selected card based on index
    const getSelectedColor = (index: number) => {
        return BRAND_COLORS[index % BRAND_COLORS.length];
    };

    // Handle capture image press - navigate to capture detail modal
    const handleCapturePress = (captureId: string) => {
        router.push(`/capture/${captureId}`);
    };

    // Trigger light haptic on selection change (only when date actually changes)
    useEffect(() => {
        if (selectedDate && selectedDate !== previousSelectedDate.current) {
            // Only trigger haptic if this isn't the initial selection
            if (previousSelectedDate.current !== null) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
            previousSelectedDate.current = selectedDate;
        }
    }, [selectedDate]);

    // Handle viewable items change for snapping behavior
    const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
        if (viewableItems.length > 0) {
            // Find the most centered viewable item
            const centeredItem = viewableItems.find(item => item.isViewable);
            if (centeredItem?.item && centeredItem.item.date !== selectedDate) {
                onSelectDay(centeredItem.item);
            }
        }
    }, [onSelectDay, selectedDate]);

    const viewabilityConfig = useRef({
        itemVisiblePercentThreshold: 60,
        minimumViewTime: 100,
    }).current;

    // getItemLayout for FlatList (required for initialScrollIndex)
    const getItemLayout = useCallback((data: ArrayLike<DailyInsightSnapshot> | null | undefined, index: number) => ({
        length: ITEM_WIDTH,
        offset: ITEM_WIDTH * index,
        index,
    }), []);

    // Initial scroll index is the last item (today)
    const initialScrollIndex = processedDays.length > 0 ? processedDays.length - 1 : 0;

    // Render a single day card
    const renderDayCard = useCallback(({ item, index }: { item: DailyInsightSnapshot; index: number }) => {
        const dateObj = new Date(item.date);
        const isSelected = selectedDate === item.date;
        const selectedColor = getSelectedColor(index);

        // Format: Month (Dec), Weekday (Tue), Day (23)
        const monthAbbr = dateObj.toLocaleDateString(undefined, { month: "short" });
        const weekday = dateObj.toLocaleDateString(undefined, { weekday: "short" });
        const dayNum = dateObj.getDate();

        return (
            <TouchableOpacity
                style={[
                    styles.dayCard,
                    isSelected ? styles.dayCardSelected : styles.dayCardUnselected,
                    isSelected && { backgroundColor: selectedColor },
                ]}
                onPress={() => onSelectDay(item)}
                activeOpacity={0.8}
            >
                {/* Line 1: Month abbreviation */}
                <ThemedText
                    style={[
                        styles.monthText,
                        isSelected ? styles.monthTextSelected : styles.monthTextUnselected
                    ]}
                >
                    {monthAbbr}
                </ThemedText>
                {/* Line 2: Weekday */}
                <ThemedText
                    style={[
                        styles.dayName,
                        isSelected ? styles.dayNameSelected : styles.dayNameUnselected
                    ]}
                >
                    {weekday}
                </ThemedText>
                {/* Line 3: Day number */}
                <ThemedText
                    style={[
                        styles.dayNumber,
                        isSelected ? styles.dayNumberSelected : styles.dayNumberUnselected
                    ]}
                >
                    {dayNum}
                </ThemedText>
            </TouchableOpacity>
        );
    }, [selectedDate, onSelectDay, getSelectedColor]);

    const keyExtractor = useCallback((item: DailyInsightSnapshot) => item.date, []);

    const content = (
        <View style={[styles.cardPadding, flat && styles.flatPadding]}>
            <ThemedText type="defaultSemiBold" style={styles.title}>
                Past Insights
            </ThemedText>

            <FlatList
                ref={flatListRef}
                data={processedDays}
                renderItem={renderDayCard}
                keyExtractor={keyExtractor}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.dayStrip}
                initialScrollIndex={initialScrollIndex}
                getItemLayout={getItemLayout}
                snapToInterval={ITEM_WIDTH}
                decelerationRate="fast"
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={viewabilityConfig}
            />

            {selectedDate && (
                <View style={styles.captureSection}>
                    <ThemedText style={styles.captureTitle}>
                        Captures from this day ({selectedCaptures.length})
                    </ThemedText>
                    <View style={styles.captureGrid}>
                        {visibleCaptures.map((cap, idx) => (
                            <TouchableOpacity
                                key={cap.id}
                                style={styles.captureItem}
                                onPress={() => handleCapturePress(cap.id)}
                                activeOpacity={0.8}
                            >
                                <Image source={{ uri: cap.image_url }} style={styles.captureImage} />
                                {idx === visibleCaptures.length - 1 && extraCount > 0 && (
                                    <View style={styles.moreOverlay}>
                                        <ThemedText style={styles.moreText}>+{extraCount} more</ThemedText>
                                    </View>
                                )}
                            </TouchableOpacity>
                        ))}
                        {visibleCaptures.length === 0 && (
                            <ThemedText style={styles.emptyText}>No captures stored for this day.</ThemedText>
                        )}
                    </View>
                </View>
            )}
        </View>
    );

    if (flat) return content;

    return (
        <GlassCard noPadding>
            {content}
        </GlassCard>
    );
});

const styles = StyleSheet.create({
    cardPadding: {
        padding: 24,
        gap: 16,
    },
    flatPadding: {
        paddingHorizontal: 0,
        paddingVertical: 12,
    },
    title: {
        color: Colors.obsy.silver,
    },
    dayStrip: {
        gap: CARD_GAP,
        alignItems: "center", // Center cards vertically for size difference
        paddingRight: 20, // Extra padding on right so Today has space
    },
    // Base day card styles
    dayCard: {
        borderRadius: 16,
        paddingVertical: 8,
        paddingHorizontal: 10,
        justifyContent: "center",
        alignItems: "center",
        gap: 2,
    },
    // Selected card: larger and prominent
    dayCardSelected: {
        minWidth: CARD_WIDTH_SELECTED,
        height: 95,
        borderWidth: 0,
    },
    // Unselected card: smaller and dimmed
    dayCardUnselected: {
        minWidth: CARD_WIDTH_UNSELECTED,
        height: 78,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.1)",
        backgroundColor: "rgba(255,255,255,0.04)",
        opacity: 0.7,
    },
    // Month text styles (Line 1: "Dec")
    monthText: {
        fontSize: 10,
        fontWeight: "600",
        textTransform: "uppercase",
        letterSpacing: 0.5,
    },
    monthTextSelected: {
        color: "#0f0f0f",
    },
    monthTextUnselected: {
        color: "rgba(255,255,255,0.5)",
    },
    // Day name (weekday) styles (Line 2: "Tue")
    dayName: {
        fontSize: 11,
        fontWeight: "500",
    },
    dayNameSelected: {
        color: "#0f0f0f",
    },
    dayNameUnselected: {
        color: "rgba(255,255,255,0.6)",
    },
    // Day number styles (Line 3: "23")
    dayNumber: {
        fontWeight: "700",
    },
    dayNumberSelected: {
        fontSize: 20,
        color: "#0f0f0f",
    },
    dayNumberUnselected: {
        fontSize: 16,
        color: "rgba(255,255,255,0.85)",
    },
    // Captures section
    captureSection: {
        gap: 12,
    },
    captureTitle: {
        color: "rgba(255,255,255,0.7)",
        fontSize: 13,
    },
    captureGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    captureItem: {
        width: "23%",
        aspectRatio: 1,
        borderRadius: 10,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        position: "relative",
    },
    captureImage: {
        width: "100%",
        height: "100%",
    },
    moreOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0,0,0,0.55)",
        alignItems: "center",
        justifyContent: "center",
    },
    moreText: {
        color: "#fff",
        fontWeight: "700",
    },
    emptyText: {
        color: "rgba(255,255,255,0.5)",
        fontSize: 13,
    },
});

import React, { useState, useCallback } from 'react';
import { StyleSheet, View, TouchableOpacity, useWindowDimensions, PixelRatio } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ui/ThemedText';
import { DayPixelGrid } from '@/components/dailyPixels/DayPixelGrid';
import { PixelPalette } from '@/components/dailyPixels/PixelPalette';
import { MonthPixelGrid } from '@/components/dailyPixels/MonthPixelGrid';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { format, isSameDay, parseISO } from 'date-fns';

type ViewMode = 'day' | 'month';

const PALETTE_WIDTH = 70;
const GRID_PALETTE_GAP = 16;
const TAB_BAR_HEIGHT = 50;
const SECTION_VERTICAL_PADDING = 40;
const CONTAINER_PADDING = 16;
const SAFETY_BUFFER = 10;

export const DailyMonthlyPixelsSection: React.FC = () => {
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const { isLight } = useObsyTheme();

    const [viewMode, setViewMode] = useState<ViewMode>('day');

    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Active date for the day editor (defaults to today, changes when tapping a month cell)
    const [activeDate, setActiveDate] = useState(todayKey);
    const isToday = activeDate === todayKey;

    // Month navigation state
    const [selectedMonth, setSelectedMonth] = useState(today.getMonth()); // 0-indexed
    const [selectedYear, setSelectedYear] = useState(today.getFullYear());

    // Don't allow going before January of the current year
    const canGoBack = !(selectedYear === today.getFullYear() && selectedMonth === 0);

    // Don't allow going past the current month
    const canGoForward = selectedYear < today.getFullYear()
        || (selectedYear === today.getFullYear() && selectedMonth < today.getMonth());

    const goToPrevMonth = useCallback(() => {
        if (!canGoBack) return;
        if (selectedMonth === 0) {
            setSelectedMonth(11);
            setSelectedYear(y => y - 1);
        } else {
            setSelectedMonth(m => m - 1);
        }
    }, [selectedMonth, canGoBack]);

    const goToNextMonth = useCallback(() => {
        if (!canGoForward) return;
        if (selectedMonth === 11) {
            setSelectedMonth(0);
            setSelectedYear(y => y + 1);
        } else {
            setSelectedMonth(m => m + 1);
        }
    }, [selectedMonth, canGoForward]);

    const availableHeight = PixelRatio.roundToNearestPixel(
        windowHeight - insets.top - insets.bottom - TAB_BAR_HEIGHT - SECTION_VERTICAL_PADDING - CONTAINER_PADDING - SAFETY_BUFFER
    );

    const contentWidth = windowWidth - 40;
    const dayGridWidth = Math.min(contentWidth - PALETTE_WIDTH - GRID_PALETTE_GAP - 20, 300); // 20 for vertical label

    const activeBg = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)';
    const inactiveBg = 'transparent';
    const activeText = isLight ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.8)';
    const inactiveText = isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)';
    const mutedColor = isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)';
    const pillBorder = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';

    const monthName = format(new Date(selectedYear, selectedMonth, 1), 'MMMM yyyy');

    // When tapping a day in month view, switch to the day editor with that date
    const handleDayPress = (dateKey: string) => {
        setActiveDate(dateKey);
        setViewMode('day');
    };

    // Day view label: "Today" or the formatted date
    const dayLabel = isToday ? 'Today' : format(parseISO(activeDate), 'MMM d');

    return (
        <View style={[styles.container, { height: availableHeight }]}>
            {/* Toggle */}
            <View style={[styles.toggle, { borderColor: pillBorder }]}>
                <TouchableOpacity
                    onPress={() => setViewMode('day')}
                    style={[styles.toggleOption, { backgroundColor: viewMode === 'day' ? activeBg : inactiveBg }]}
                >
                    <ThemedText style={[styles.toggleText, { color: viewMode === 'day' ? activeText : inactiveText }]}>
                        Day
                    </ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={() => setViewMode('month')}
                    style={[styles.toggleOption, { backgroundColor: viewMode === 'month' ? activeBg : inactiveBg }]}
                >
                    <ThemedText style={[styles.toggleText, { color: viewMode === 'month' ? activeText : inactiveText }]}>
                        Month
                    </ThemedText>
                </TouchableOpacity>
            </View>

            {/* Content */}
            <View style={styles.content}>
                {viewMode === 'day' ? (
                    <GestureHandlerRootView style={styles.dayLayout}>
                        {/* Vertical date label */}
                        <View style={styles.verticalLabelContainer}>
                            <ThemedText style={[styles.verticalLabel, { color: mutedColor }]}>
                                {dayLabel}
                            </ThemedText>
                        </View>

                        {/* Canvas */}
                        <DayPixelGrid date={activeDate} gridWidth={dayGridWidth} />

                        {/* Palette */}
                        <View style={{ width: PALETTE_WIDTH }}>
                            <PixelPalette maxHeight={dayGridWidth} />
                        </View>
                    </GestureHandlerRootView>
                ) : (
                    <View style={styles.monthLayout}>
                        <View style={styles.monthNav}>
                            <TouchableOpacity
                                onPress={goToPrevMonth}
                                style={styles.monthNavBtn}
                                disabled={!canGoBack}
                            >
                                <Ionicons name="chevron-back" size={20} color={canGoBack ? activeText : mutedColor} />
                            </TouchableOpacity>
                            <ThemedText style={[styles.monthHeader, { color: activeText }]}>
                                {monthName}
                            </ThemedText>
                            <TouchableOpacity
                                onPress={goToNextMonth}
                                style={styles.monthNavBtn}
                                disabled={!canGoForward}
                            >
                                <Ionicons name="chevron-forward" size={20} color={canGoForward ? activeText : mutedColor} />
                            </TouchableOpacity>
                        </View>
                        <MonthPixelGrid
                            year={selectedYear}
                            month={selectedMonth}
                            gridWidth={contentWidth}
                            onDayPress={handleDayPress}
                        />
                    </View>
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
    },
    toggle: {
        flexDirection: 'row',
        borderRadius: 20,
        borderWidth: 1,
        padding: 2,
        marginBottom: 20,
    },
    toggleOption: {
        paddingVertical: 6,
        paddingHorizontal: 20,
        borderRadius: 18,
    },
    toggleText: {
        fontSize: 13,
        fontWeight: '600',
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    dayLayout: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: GRID_PALETTE_GAP,
        paddingTop: 8,
    },
    verticalLabelContainer: {
        width: 20,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 40,
    },
    verticalLabel: {
        fontSize: 10,
        fontWeight: '600',
        letterSpacing: 2,
        textTransform: 'uppercase',
        transform: [{ rotate: '-90deg' }],
        width: 60,
    },
    monthLayout: {
        alignItems: 'center',
        gap: 16,
    },
    monthNav: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    monthNavBtn: {
        padding: 4,
    },
    monthHeader: {
        fontSize: 16,
        fontWeight: '600',
        minWidth: 140,
        textAlign: 'center',
    },
});

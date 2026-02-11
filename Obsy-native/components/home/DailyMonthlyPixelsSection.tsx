import React, { useState, useMemo } from 'react';
import { StyleSheet, View, TouchableOpacity, useWindowDimensions, PixelRatio } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ui/ThemedText';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { DayPixelGrid } from '@/components/dailyPixels/DayPixelGrid';
import { MonthPixelGrid } from '@/components/dailyPixels/MonthPixelGrid';
import { PixelPalette } from '@/components/dailyPixels/PixelPalette';
import { DayPixelModal } from '@/components/dailyPixels/DayPixelModal';
import { useYearInPixelsStore } from '@/lib/yearInPixelsStore';
import { format } from 'date-fns';

type ViewMode = 'day' | 'month';

const PALETTE_WIDTH = 70;
const GRID_PALETTE_GAP = 16;

export const DailyMonthlyPixelsSection: React.FC = () => {
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const { isLight, isDark, colors } = useObsyTheme();
    const { clearGrid } = useYearInPixelsStore();

    const [viewMode, setViewMode] = useState<ViewMode>('day');
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [modalVisible, setModalVisible] = useState(false);

    const today = useMemo(() => new Date(), []);
    const todayKey = useMemo(() => format(today, 'yyyy-MM-dd'), [today]);

    // Layout calculations
    const TAB_BAR_HEIGHT = 50;
    const SECTION_PADDING = 40;
    const CONTAINER_PADDING = 8;
    const SAFETY = 10;
    const availableHeight = PixelRatio.roundToNearestPixel(
        windowHeight - insets.top - insets.bottom - TAB_BAR_HEIGHT - SECTION_PADDING - CONTAINER_PADDING - SAFETY
    );

    const contentWidth = Math.min(windowWidth - 40, 420);

    // Day view: grid takes remaining width after palette
    const dayGridWidth = Math.min(contentWidth - PALETTE_WIDTH - GRID_PALETTE_GAP, 300);

    // Month view: uses full content width
    const monthGridWidth = contentWidth;

    const mutedText = isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)';
    const toggleBg = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)';
    const toggleActiveBg = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';

    const handleMonthDayPress = (dateKey: string) => {
        setSelectedDate(dateKey);
        setModalVisible(true);
    };

    return (
        <View style={[styles.container, { height: availableHeight }]}>
            {/* Toggle */}
            <View style={styles.toggleRow}>
                <View style={[styles.toggleContainer, { backgroundColor: toggleBg }]}>
                    <TouchableOpacity
                        style={[styles.toggleButton, viewMode === 'day' && { backgroundColor: toggleActiveBg }]}
                        onPress={() => setViewMode('day')}
                        activeOpacity={0.7}
                    >
                        <ThemedText style={[
                            styles.toggleText,
                            { color: viewMode === 'day' ? colors.text : mutedText },
                        ]}>
                            Day
                        </ThemedText>
                    </TouchableOpacity>

                    <ThemedText style={[styles.toggleDivider, { color: mutedText }]}>·</ThemedText>

                    <TouchableOpacity
                        style={[styles.toggleButton, viewMode === 'month' && { backgroundColor: toggleActiveBg }]}
                        onPress={() => setViewMode('month')}
                        activeOpacity={0.7}
                    >
                        <ThemedText style={[
                            styles.toggleText,
                            { color: viewMode === 'month' ? colors.text : mutedText },
                        ]}>
                            Month
                        </ThemedText>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Content */}
            <View style={styles.contentArea}>
                {viewMode === 'day' ? (
                    <View style={styles.dayLayout}>
                        {/* Vertical label */}
                        <View style={styles.verticalLabelContainer}>
                            <ThemedText style={[styles.verticalLabel, { color: mutedText }]}>
                                Today
                            </ThemedText>
                        </View>

                        {/* Grid */}
                        <DayPixelGrid date={todayKey} gridWidth={dayGridWidth} />

                        {/* Palette */}
                        <View style={[styles.paletteContainer, { width: PALETTE_WIDTH }]}>
                            <PixelPalette maxHeight={dayGridWidth} />
                        </View>
                    </View>
                ) : (
                    <View style={styles.monthLayout}>
                        {/* Month header */}
                        <ThemedText style={[styles.monthTitle, { color: mutedText }]}>
                            {format(today, 'MMMM yyyy')}
                        </ThemedText>

                        <MonthPixelGrid
                            year={today.getFullYear()}
                            month={today.getMonth()}
                            gridWidth={monthGridWidth}
                            onDayPress={handleMonthDayPress}
                        />
                    </View>
                )}
            </View>

            {/* Day hint - only in day view */}
            {viewMode === 'day' && (
                <ThemedText style={[styles.hint, { color: mutedText }]}>
                    Tap to paint · Long-press to erase
                </ThemedText>
            )}

            {/* Modal for month-view day editing */}
            {selectedDate && (
                <DayPixelModal
                    visible={modalVisible}
                    date={selectedDate}
                    onClose={() => setModalVisible(false)}
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        paddingTop: 4,
        paddingBottom: 4,
    },
    toggleRow: {
        marginBottom: 24,
    },
    toggleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 20,
        paddingHorizontal: 4,
        paddingVertical: 4,
    },
    toggleButton: {
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 16,
    },
    toggleText: {
        fontSize: 13,
        fontWeight: '600',
        letterSpacing: 0.5,
    },
    toggleDivider: {
        fontSize: 14,
        marginHorizontal: 2,
    },
    contentArea: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    dayLayout: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: GRID_PALETTE_GAP,
    },
    verticalLabelContainer: {
        width: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    verticalLabel: {
        fontSize: 10,
        fontWeight: '600',
        letterSpacing: 2,
        textTransform: 'uppercase',
        transform: [{ rotate: '-90deg' }],
        width: 60,
    },
    paletteContainer: {
        justifyContent: 'center',
    },
    monthLayout: {
        alignItems: 'center',
        gap: 16,
    },
    monthTitle: {
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 1.5,
        textTransform: 'uppercase',
    },
    hint: {
        fontSize: 10,
        marginTop: 16,
    },
});

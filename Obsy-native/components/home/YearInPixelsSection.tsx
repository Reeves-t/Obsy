import React, { useState } from 'react';
import { StyleSheet, View, useWindowDimensions, PixelRatio, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ui/ThemedText';
import { PixelGrid } from '@/components/yearInPixels/PixelGrid';
import { LegendPanel } from '@/components/yearInPixels/LegendPanel';
import { YearInPixelsInfoModal } from '@/components/yearInPixels/YearInPixelsInfoModal';
import { useObsyTheme } from '@/contexts/ThemeContext';

// Fixed canvas constants
const CANVAS_MAX_WIDTH = 420;
const LEGEND_WIDTH = 80;
const GRID_LEGEND_GAP = 16;
const VERTICAL_LABEL_WIDTH = 20;

export const YearInPixelsSection: React.FC = () => {
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const { isLight } = useObsyTheme();

    const [infoVisible, setInfoVisible] = useState(false);

    // Calculate available height:
    // - Start with window height
    // - Subtract safe area insets (notch, home indicator)
    // - Subtract tab bar (~50px)
    // - Subtract parent section padding (padding: 20 = 40px vertical)
    // - Subtract our own container padding (8px)
    // - Add safety buffer for any rounding issues
    const TAB_BAR_HEIGHT = 50;
    const SECTION_VERTICAL_PADDING = 40; // parent's padding: 20 on top + bottom
    const CONTAINER_PADDING = 8; // our paddingTop + paddingBottom
    const SAFETY_BUFFER = 10;
    const availableHeight = PixelRatio.roundToNearestPixel(
        windowHeight - insets.top - insets.bottom - TAB_BAR_HEIGHT - SECTION_VERTICAL_PADDING - CONTAINER_PADDING - SAFETY_BUFFER
    );

    // Calculate canvas width
    const canvasWidth = Math.min(windowWidth - 40, CANVAS_MAX_WIDTH);
    const gridWidth = canvasWidth - LEGEND_WIDTH - GRID_LEGEND_GAP - VERTICAL_LABEL_WIDTH;

    return (
        <View style={styles.container}>
            {/* Fixed-width canvas centered on screen */}
            <View style={[styles.canvas, { width: canvasWidth, height: availableHeight }]}>
                {/* Three-column layout: Vertical Label (left) + Grid (center) + Legend (right) */}
                <View style={styles.contentRow}>
                    {/* Vertical "Year in Pixels" label - readable when phone is rotated */}
                    <View style={[styles.verticalLabelContainer, { width: VERTICAL_LABEL_WIDTH }]}>
                        <ThemedText style={[styles.verticalLabel, { color: isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)' }]}>Year in Pixels</ThemedText>
                    </View>

                    <View style={[styles.gridContainer, { width: gridWidth }]}>
                        <PixelGrid availableHeight={availableHeight} />
                    </View>
                    <View style={[styles.legendContainer, { width: LEGEND_WIDTH }]}>
                        <View style={styles.legendHeader}>
                            <TouchableOpacity style={styles.infoButton} onPress={() => setInfoVisible(true)}>
                                <Ionicons name="information-circle-outline" size={20} color={isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)'} />
                            </TouchableOpacity>
                        </View>
                        <LegendPanel panelHeight={availableHeight - 30} />
                    </View>
                </View>
            </View>

            <YearInPixelsInfoModal
                visible={infoVisible}
                onClose={() => setInfoVisible(false)}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center', // Center the canvas horizontally
        paddingTop: 4,
        paddingBottom: 4,
    },
    canvas: {
        // Height set inline based on available space
    },
    contentRow: {
        flex: 1,
        flexDirection: 'row',
        gap: 8,
    },
    verticalLabelContainer: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    verticalLabel: {
        fontSize: 10,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 2,
        textTransform: 'uppercase',
        transform: [{ rotate: '-90deg' }],
        width: 120, // Enough width for the rotated text
    },
    gridContainer: {
        flex: 1,
    },
    legendContainer: {
        // Height fills parent via flex
    },
    legendHeader: {
        height: 30,
        width: '100%',
        alignItems: 'flex-end',
        justifyContent: 'center',
        paddingRight: 4,
    },
    infoButton: {
        padding: 4,
    },
});

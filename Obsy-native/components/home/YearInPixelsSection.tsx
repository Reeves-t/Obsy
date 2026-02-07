import React, { useState, useRef, useCallback } from 'react';
import { StyleSheet, View, useWindowDimensions, PixelRatio, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ui/ThemedText';
import { PixelGrid } from '@/components/yearInPixels/PixelGrid';
import { LegendPanel } from '@/components/yearInPixels/LegendPanel';
import { ExpandedDayCanvas } from '@/components/yearInPixels/ExpandedDayCanvas';
import { YearInPixelsInfoModal } from '@/components/yearInPixels/YearInPixelsInfoModal';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';

// Fixed canvas constants
const CANVAS_MAX_WIDTH = 420;
const LEGEND_WIDTH = 80;
const GRID_LEGEND_GAP = 16;
const VERTICAL_LABEL_WIDTH = 20;

export const YearInPixelsSection: React.FC = () => {
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const insets = useSafeAreaInsets();

    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [infoVisible, setInfoVisible] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    const viewShotRef = useRef<ViewShot>(null);

    const handleDayPress = (date: string) => {
        setSelectedDate(date);
        setModalVisible(true);
    };

    const handleExport = useCallback(async () => {
        if (isExporting || !viewShotRef.current?.capture) return;
        setIsExporting(true);

        try {
            const uri = await viewShotRef.current.capture();

            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(uri, {
                    mimeType: 'image/png',
                    dialogTitle: 'Save Year in Pixels',
                });
            } else {
                // Fallback: save to camera roll
                const { status } = await MediaLibrary.requestPermissionsAsync();
                if (status === 'granted') {
                    await MediaLibrary.saveToLibraryAsync(uri);
                    Alert.alert('Saved', 'Year in Pixels saved to your photo library.');
                } else {
                    Alert.alert('Permission Required', 'Please allow photo library access to save.');
                }
            }
        } catch (e: any) {
            console.error('[YearInPixels] Export failed:', e);
            Alert.alert('Export Failed', 'Could not capture the grid. Please try again.');
        } finally {
            setIsExporting(false);
        }
    }, [isExporting]);

    // Calculate available height
    const TAB_BAR_HEIGHT = 50;
    const SECTION_VERTICAL_PADDING = 40;
    const CONTAINER_PADDING = 8;
    const SAFETY_BUFFER = 10;
    const EXPORT_BUTTON_HEIGHT = 44; // Reserve space for export button
    const availableHeight = PixelRatio.roundToNearestPixel(
        windowHeight - insets.top - insets.bottom - TAB_BAR_HEIGHT - SECTION_VERTICAL_PADDING - CONTAINER_PADDING - SAFETY_BUFFER - EXPORT_BUTTON_HEIGHT
    );

    // Calculate canvas width
    const canvasWidth = Math.min(windowWidth - 40, CANVAS_MAX_WIDTH);
    const gridWidth = canvasWidth - LEGEND_WIDTH - GRID_LEGEND_GAP - VERTICAL_LABEL_WIDTH;

    return (
        <View style={styles.container}>
            {/* Capturable area: grid + legend together */}
            <ViewShot
                ref={viewShotRef}
                options={{ format: 'png', quality: 1, result: 'tmpfile' }}
                style={[styles.canvas, { width: canvasWidth, height: availableHeight }]}
            >
                {/* Three-column layout: Vertical Label (left) + Grid (center) + Legend (right) */}
                <View style={styles.contentRow}>
                    {/* Vertical "Year in Pixels" label */}
                    <View style={[styles.verticalLabelContainer, { width: VERTICAL_LABEL_WIDTH }]}>
                        <ThemedText style={styles.verticalLabel}>Year in Pixels</ThemedText>
                    </View>

                    <View style={[styles.gridContainer, { width: gridWidth }]}>
                        <PixelGrid onDayPress={handleDayPress} availableHeight={availableHeight} />
                    </View>
                    <View style={[styles.legendContainer, { width: LEGEND_WIDTH }]}>
                        <View style={styles.legendHeader}>
                            <TouchableOpacity style={styles.infoButton} onPress={() => setInfoVisible(true)}>
                                <Ionicons name="information-circle-outline" size={20} color="rgba(255,255,255,0.4)" />
                            </TouchableOpacity>
                        </View>
                        <LegendPanel panelHeight={availableHeight - 30} />
                    </View>
                </View>
            </ViewShot>

            {/* Export/Share button */}
            <TouchableOpacity
                style={styles.exportButton}
                onPress={handleExport}
                disabled={isExporting}
                activeOpacity={0.7}
            >
                <Ionicons
                    name={isExporting ? "hourglass-outline" : "share-outline"}
                    size={16}
                    color="rgba(255,255,255,0.5)"
                />
                <ThemedText style={styles.exportText}>
                    {isExporting ? 'Exporting…' : 'Save Image'}
                </ThemedText>
            </TouchableOpacity>

            {selectedDate && (
                <ExpandedDayCanvas
                    visible={modalVisible}
                    date={selectedDate}
                    onClose={() => setModalVisible(false)}
                />
            )}

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
        alignItems: 'center',
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
        width: 120,
    },
    gridContainer: {
        flex: 1,
    },
    legendContainer: {
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
    exportButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        marginTop: 8,
    },
    exportText: {
        fontSize: 12,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.5)',
    },
});

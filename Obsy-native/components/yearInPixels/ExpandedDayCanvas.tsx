import React, { useState, useRef, useCallback } from 'react';
import { StyleSheet, View, TouchableOpacity, Modal, Dimensions, Platform, ScrollView } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Svg, Path } from 'react-native-svg';
import { PanGestureHandler, GestureHandlerRootView, State } from 'react-native-gesture-handler';
import { ThemedText } from '@/components/ui/ThemedText';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { useYearInPixelsStore, StrokeData } from '@/lib/yearInPixelsStore';
import { useCaptureStore } from '@/lib/captureStore';
import { getLocalDayKey } from '@/lib/utils';
import { Image } from 'expo-image';
import Colors from '@/constants/Colors';
import { GlassCard } from '@/components/ui/GlassCard';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CANVAS_SIZE = SCREEN_WIDTH - 40;

interface ExpandedDayCanvasProps {
    visible: boolean;
    date: string;
    onClose: () => void;
}

export const ExpandedDayCanvas: React.FC<ExpandedDayCanvasProps> = ({ visible, date, onClose }) => {
    const { colors, isDark } = useObsyTheme();
    const { pixels, legend, activeColorId, setActiveColorId, addStroke, setStrokes, setPixelPhoto } = useYearInPixelsStore();
    const { captures } = useCaptureStore();

    const currentPixel = pixels[date];
    const strokes = currentPixel?.strokes || [];
    const baseColor = currentPixel?.color;

    // The brush color is the active color from the store
    const legendItem = legend.find(l => l.id === activeColorId);
    const activeColor = legendItem?.color || '#7B68EE';

    const [currentPath, setCurrentPath] = useState<string | null>(null);
    const [brushSize, setBrushSize] = useState(8);
    const [isErasing, setIsErasing] = useState(false);

    // Derived date display
    const dateObj = new Date(date + 'T12:00:00'); // Ensure local time
    const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

    const onGestureEvent = (event: any) => {
        const { x, y } = event.nativeEvent;
        if (x < 0 || x > CANVAS_SIZE || y < 0 || y > CANVAS_SIZE) return;

        if (!currentPath) {
            setCurrentPath(`M${x},${y}`);
        } else {
            setCurrentPath(`${currentPath} L${x},${y}`);
        }
    };

    const onHandlerStateChange = (event: any) => {
        if (event.nativeEvent.state === State.END) {
            if (currentPath) {
                addStroke(date, {
                    path: currentPath,
                    color: isErasing ? 'transparent' : activeColor,
                    strokeWidth: brushSize,
                    timestamp: Date.now(),
                });
                setCurrentPath(null);
            }
        }
    };

    const handleUndo = () => {
        if (strokes.length > 0) {
            setStrokes(date, strokes.slice(0, -1));
        }
    };

    const handleReset = () => {
        setStrokes(date, []);
    };

    const dayCaptures = captures.filter(c => getLocalDayKey(new Date(c.created_at)) === date);
    const selectedPhotoUri = currentPixel?.photoUri;

    return (
        <Modal visible={visible} animationType="fade" transparent>
            <GestureHandlerRootView style={[styles.modalOverlay, { backgroundColor: isDark ? 'rgba(0,0,0,0.95)' : 'rgba(255,255,255,0.95)' }]}>
                <View style={styles.container}>
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <Ionicons name="close" size={28} color={colors.text} />
                        </TouchableOpacity>
                        <View style={styles.titleContainer}>
                            <ThemedText style={styles.dateText}>{formattedDate}</ThemedText>
                            <ThemedText style={styles.yearText}>{dateObj.getFullYear()}</ThemedText>
                        </View>
                        <View style={styles.headerRight} />
                    </View>

                    {/* Canvas Area */}
                    <View style={[
                        styles.canvasContainer,
                        { backgroundColor: baseColor || (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)') }
                    ]}>
                        <PanGestureHandler
                            onGestureEvent={onGestureEvent}
                            onHandlerStateChange={onHandlerStateChange}
                        >
                            <View style={styles.canvas}>
                                <Svg width={CANVAS_SIZE} height={CANVAS_SIZE} style={styles.svg}>
                                    {strokes.map((stroke, index) => (
                                        <Path
                                            key={index}
                                            d={stroke.path}
                                            stroke={stroke.color === 'transparent' ? (baseColor || (isDark ? 'black' : 'white')) : stroke.color}
                                            strokeWidth={stroke.strokeWidth}
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            fill="none"
                                        />
                                    ))}
                                    {currentPath && (
                                        <Path
                                            d={currentPath}
                                            stroke={isErasing ? (isDark ? 'grey' : 'lightgrey') : activeColor}
                                            strokeWidth={brushSize}
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            fill="none"
                                        />
                                    )}
                                </Svg>
                            </View>
                        </PanGestureHandler>
                    </View>

                    {/* Palette Area */}
                    <View style={styles.paletteContainer}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.paletteList}>
                            {legend.map((item) => (
                                <TouchableOpacity
                                    key={item.id}
                                    style={[
                                        styles.paletteItem,
                                        activeColorId === item.id && !isErasing && styles.activePaletteItem
                                    ]}
                                    onPress={() => {
                                        setActiveColorId(item.id);
                                        setIsErasing(false);
                                    }}
                                >
                                    <View style={[styles.paletteColor, { backgroundColor: item.color }]} />
                                    {activeColorId === item.id && !isErasing && (
                                        <View style={styles.paletteActiveRing} />
                                    )}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>

                    {/* Toolbar */}
                    <View style={styles.toolbar}>
                        <GlassCard variant="simple" style={styles.tools}>
                            {/* Brush Settings */}
                            <View style={styles.toolGroup}>
                                <TouchableOpacity
                                    style={[styles.toolButton, !isErasing && styles.activeTool]}
                                    onPress={() => setIsErasing(false)}
                                >
                                    <MaterialCommunityIcons name="brush" size={20} color={!isErasing ? '#fff' : colors.textSecondary} />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.toolButton, isErasing && styles.activeTool]}
                                    onPress={() => setIsErasing(true)}
                                >
                                    <MaterialCommunityIcons name="eraser" size={20} color={isErasing ? '#fff' : colors.textSecondary} />
                                </TouchableOpacity>
                            </View>

                            <View style={styles.divider} />

                            {/* Actions */}
                            <View style={styles.toolGroup}>
                                <TouchableOpacity style={styles.toolButton} onPress={handleUndo}>
                                    <Ionicons name="arrow-undo" size={20} color={colors.textSecondary} />
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.toolButton} onPress={handleReset}>
                                    <Ionicons name="trash" size={20} color={colors.textSecondary} />
                                </TouchableOpacity>
                            </View>

                            <View style={styles.divider} />

                            {/* Sizes */}
                            <View style={styles.toolGroup}>
                                {[4, 8, 16].map(size => (
                                    <TouchableOpacity
                                        key={size}
                                        style={styles.sizeButton}
                                        onPress={() => setBrushSize(size)}
                                    >
                                        <View style={[
                                            styles.sizeDot,
                                            { width: size, height: size, borderRadius: size / 2, backgroundColor: brushSize === size ? colors.text : colors.textTertiary }
                                        ]} />
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </GlassCard>
                    </View>

                    {/* Photo Selection Area (if captures exist) */}
                    {dayCaptures.length > 0 && (
                        <View style={styles.photoPickerContainer}>
                            <ThemedText style={styles.photoPickerTitle}>Feature a photo</ThemedText>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoList}>
                                {dayCaptures.map((cap) => (
                                    <TouchableOpacity
                                        key={cap.id}
                                        onPress={() => setPixelPhoto(date, cap.image_url)}
                                        style={[
                                            styles.photoThumbnailWrapper,
                                            selectedPhotoUri === cap.image_url && { borderColor: '#4a9eff', borderWidth: 2 }
                                        ]}
                                    >
                                        <Image
                                            source={{ uri: cap.image_url }}
                                            style={styles.photoThumbnail}
                                            contentFit="cover"
                                        />
                                        {selectedPhotoUri === cap.image_url && (
                                            <View style={styles.selectedCheck}>
                                                <Ionicons name="checkmark-circle" size={14} color="#4a9eff" />
                                            </View>
                                        )}
                                    </TouchableOpacity>
                                ))}
                                <TouchableOpacity
                                    onPress={() => setPixelPhoto(date, undefined)}
                                    style={[styles.photoThumbnailWrapper, !selectedPhotoUri && styles.noneThumbnail]}
                                >
                                    <Ionicons name="close" size={20} color={colors.textTertiary} />
                                    <ThemedText style={styles.noneText}>None</ThemedText>
                                </TouchableOpacity>
                            </ScrollView>
                        </View>
                    )}

                    {/* Color Indicator */}
                    <View style={styles.colorIndicatorContainer}>
                        <View style={[styles.activeColorCircle, { backgroundColor: isErasing ? 'transparent' : activeColor, borderWidth: isErasing ? 1 : 0, borderColor: colors.textSecondary }]}>
                            {isErasing && <Ionicons name="close" size={16} color={colors.textSecondary} />}
                        </View>
                        <ThemedText style={styles.activeColorLabel}>{isErasing ? 'Eraser' : (legendItem?.label || 'Brush')}</ThemedText>
                    </View>
                </View>
            </GestureHandlerRootView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
    },
    container: {
        flex: 1,
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        marginBottom: 30,
    },
    closeButton: {
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'flex-start',
    },
    titleContainer: {
        alignItems: 'center',
    },
    dateText: {
        fontSize: 20,
        fontWeight: '700',
    },
    yearText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
        marginTop: 2,
    },
    headerRight: {
        width: 44,
    },
    canvasContainer: {
        alignSelf: 'center',
        width: CANVAS_SIZE,
        height: CANVAS_SIZE,
        borderRadius: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    canvas: {
        flex: 1,
    },
    svg: {
        flex: 1,
    },
    toolbar: {
        marginTop: 30,
        paddingHorizontal: 20,
    },
    tools: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-evenly',
        paddingVertical: 12,
        paddingHorizontal: 16,
        width: '100%',
    },
    toolGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    toolButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
    },
    activeTool: {
        backgroundColor: '#4a9eff',
    },
    sizeButton: {
        width: 24,
        height: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    sizeDot: {
        backgroundColor: '#fff',
    },
    divider: {
        width: 1,
        height: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    colorIndicatorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 24,
        gap: 10,
    },
    activeColorCircle: {
        width: 24,
        height: 24,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    activeColorLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.6)',
    },
    paletteContainer: {
        marginTop: 20,
        height: 60,
    },
    paletteList: {
        paddingHorizontal: 20,
        gap: 16,
        alignItems: 'center',
    },
    paletteItem: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    activePaletteItem: {
        // No extra style here, handled by ring
    },
    paletteColor: {
        width: 30,
        height: 30,
        borderRadius: 15,
    },
    paletteActiveRing: {
        position: 'absolute',
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: '#D4AF37', // Gold ring
    },
    photoPickerContainer: {
        marginTop: 30,
        width: '100%',
        alignItems: 'center',
    },
    photoPickerTitle: {
        fontSize: 12,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.4)',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 12,
    },
    photoList: {
        paddingHorizontal: 20,
        gap: 12,
    },
    photoThumbnailWrapper: {
        width: 60,
        height: 60,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    photoThumbnail: {
        width: '100%',
        height: '100%',
    },
    selectedCheck: {
        position: 'absolute',
        top: 2,
        right: 2,
        backgroundColor: '#fff',
        borderRadius: 10,
    },
    noneThumbnail: {
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        borderStyle: 'dashed',
    },
    noneText: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.4)',
        marginTop: 2,
    },
});

import React, { useState, useCallback, useMemo } from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { Svg, Path } from 'react-native-svg';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { useYearInPixelsStore } from '@/lib/yearInPixelsStore';
import { useObsyTheme } from '@/contexts/ThemeContext';

interface DayPixelGridProps {
    date: string; // YYYY-MM-DD
    gridWidth: number;
}

export const DayPixelGrid: React.FC<DayPixelGridProps> = ({ date, gridWidth }) => {
    const { pixels, legend, activeColorId, addStroke, setStrokes, setPixelColor } = useYearInPixelsStore();
    const { isDark, isLight } = useObsyTheme();

    const currentPixel = pixels[date];
    const strokes = currentPixel?.strokes || [];
    const baseColor = currentPixel?.color;

    const activeColor = useMemo(() => {
        const item = legend.find(l => l.id === activeColorId);
        return item?.color || '#7B68EE';
    }, [activeColorId, legend]);

    const [currentPath, setCurrentPath] = useState<string | null>(null);
    const [brushSize, setBrushSize] = useState(8);
    const [isErasing, setIsErasing] = useState(false);

    const onGestureEvent = useCallback((event: any) => {
        const { x, y } = event.nativeEvent;
        if (x < 0 || x > gridWidth || y < 0 || y > gridWidth) return;

        setCurrentPath(prev => {
            if (!prev) return `M${x},${y}`;
            return `${prev} L${x},${y}`;
        });
    }, [gridWidth]);

    const onHandlerStateChange = useCallback((event: any) => {
        if (event.nativeEvent.state === State.END) {
            setCurrentPath(prev => {
                if (prev) {
                    addStroke(date, {
                        path: prev,
                        color: isErasing ? 'transparent' : activeColor,
                        strokeWidth: brushSize,
                        timestamp: Date.now(),
                    });
                }
                return null;
            });
        }
    }, [date, isErasing, activeColor, brushSize, addStroke]);

    const handleUndo = useCallback(() => {
        if (strokes.length > 0) {
            setStrokes(date, strokes.slice(0, -1));
        }
    }, [date, strokes, setStrokes]);

    const handleFill = useCallback(() => {
        setPixelColor(date, activeColor);
    }, [date, activeColor, setPixelColor]);

    const borderColor = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
    const bgColor = baseColor || (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)');
    const toolMuted = isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)';

    return (
        <View>
            {/* Canvas */}
            <View style={[styles.canvasContainer, { width: gridWidth, height: gridWidth, backgroundColor: bgColor, borderColor }]}>
                <PanGestureHandler
                    onGestureEvent={onGestureEvent}
                    onHandlerStateChange={onHandlerStateChange}
                >
                    <View style={styles.canvas}>
                        <Svg width={gridWidth} height={gridWidth}>
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

            {/* Toolbar */}
            <View style={styles.toolbar}>
                <TouchableOpacity
                    style={[styles.toolBtn, !isErasing && styles.toolActive]}
                    onPress={() => setIsErasing(false)}
                >
                    <MaterialCommunityIcons name="brush" size={20} color={!isErasing ? '#fff' : toolMuted} />
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.toolBtn}
                    onPress={handleFill}
                >
                    <MaterialCommunityIcons name="format-color-fill" size={20} color={toolMuted} />
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.toolBtn, isErasing && styles.toolActive]}
                    onPress={() => setIsErasing(true)}
                >
                    <MaterialCommunityIcons name="eraser" size={20} color={isErasing ? '#fff' : toolMuted} />
                </TouchableOpacity>

                <View style={[styles.divider, { backgroundColor: borderColor }]} />

                {[4, 8, 16].map(size => (
                    <TouchableOpacity key={size} style={styles.sizeBtn} onPress={() => setBrushSize(size)}>
                        <View style={[
                            styles.sizeDot,
                            {
                                width: Math.max(size * 0.7, 5),
                                height: Math.max(size * 0.7, 5),
                                borderRadius: Math.max(size * 0.35, 2.5),
                                backgroundColor: brushSize === size ? (isLight ? '#000' : '#fff') : toolMuted,
                            },
                        ]} />
                    </TouchableOpacity>
                ))}

                <View style={[styles.divider, { backgroundColor: borderColor }]} />

                <TouchableOpacity style={styles.toolBtn} onPress={handleUndo}>
                    <Ionicons name="arrow-undo" size={18} color={toolMuted} />
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    canvasContainer: {
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
    },
    canvas: {
        flex: 1,
    },
    toolbar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        marginTop: 10,
    },
    toolBtn: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
    },
    toolActive: {
        backgroundColor: '#4a9eff',
    },
    sizeBtn: {
        width: 26,
        height: 26,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sizeDot: {},
    divider: {
        width: 1,
        height: 16,
    },
});

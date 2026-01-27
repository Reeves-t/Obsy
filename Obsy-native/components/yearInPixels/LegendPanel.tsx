import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { StyleSheet, View, TouchableOpacity, ScrollView, TextInput, Alert, Modal, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Svg, Rect, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, runOnJS } from 'react-native-reanimated';
import { ThemedText } from '@/components/ui/ThemedText';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { useYearInPixelsStore } from '@/lib/yearInPixelsStore';
import Colors from '@/constants/Colors';
import { GlassCard } from '@/components/ui/GlassCard';
import { hsvToHex, hexToHsv, hsvToRgb, rgbToHex } from '@/lib/colorUtils';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SLIDER_HEIGHT = 20;
const SV_FIELD_SIZE = 240;

interface LegendPanelProps {
    panelHeight?: number;
}

export const LegendPanel: React.FC<LegendPanelProps> = ({ panelHeight }) => {
    const { colors, isDark } = useObsyTheme();
    const { legend, activeColorId, setActiveColorId, addLegendItem, removeLegendItem } = useYearInPixelsStore();
    const [isAdding, setIsAdding] = useState(false);

    // Internal state for the color picker
    const [hue, setHue] = useState(0);
    const [sat, setSat] = useState(1);
    const [val, setVal] = useState(1);
    const [label, setLabel] = useState('');
    const [hexInput, setHexInput] = useState('');

    const currentColor = useMemo(() => hsvToHex(hue, sat, val), [hue, sat, val]);

    useEffect(() => {
        setHexInput(currentColor);
    }, [currentColor]);

    const handleHexChange = (text: string) => {
        setHexInput(text);
        if (/^#?[0-9A-F]{6}$/i.test(text)) {
            const hsv = hexToHsv(text);
            setHue(hsv.h);
            setSat(hsv.s);
            setVal(hsv.v);
        }
    };

    const handleAdd = () => {
        if (!label.trim()) {
            Alert.alert('Name Required', 'Please enter a name for this color.');
            return;
        }
        addLegendItem({
            color: currentColor,
            label: label.trim(),
            order: legend.length,
        });
        setLabel('');
        setHue(0);
        setSat(1);
        setVal(1);
        setIsAdding(false);
    };

    // Re-initialize SV positions when adding starts to avoid "black swatch" bug
    useEffect(() => {
        if (isAdding) {
            svX.value = SV_FIELD_SIZE; // Max Saturation
            svY.value = 0;             // Max Value
            hueX.value = 0;            // Initial Hue (Red)
            setHue(0);
            setSat(1);
            setVal(1);
            setLabel('');
        }
    }, [isAdding]);

    // --- SV Field Gesture ---
    const svX = useSharedValue(SV_FIELD_SIZE);
    const svY = useSharedValue(0);

    const svGesture = Gesture.Pan()
        .onBegin((e) => {
            svX.value = Math.max(0, Math.min(SV_FIELD_SIZE, e.x));
            svY.value = Math.max(0, Math.min(SV_FIELD_SIZE, e.y));
            runOnJS(setSat)(svX.value / SV_FIELD_SIZE);
            runOnJS(setVal)(1 - svY.value / SV_FIELD_SIZE);
        })
        .onUpdate((e) => {
            svX.value = Math.max(0, Math.min(SV_FIELD_SIZE, e.x));
            svY.value = Math.max(0, Math.min(SV_FIELD_SIZE, e.y));
            runOnJS(setSat)(svX.value / SV_FIELD_SIZE);
            runOnJS(setVal)(1 - svY.value / SV_FIELD_SIZE);
        });

    const svIndicatorStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: svX.value - 10 },
            { translateY: svY.value - 10 }
        ],
    }));

    // --- Hue Slider Gesture ---
    const hueX = useSharedValue(0);
    const hueGesture = Gesture.Pan()
        .onBegin((e) => {
            hueX.value = Math.max(0, Math.min(SV_FIELD_SIZE, e.x));
            runOnJS(setHue)((hueX.value / SV_FIELD_SIZE) * 360);
        })
        .onUpdate((e) => {
            hueX.value = Math.max(0, Math.min(SV_FIELD_SIZE, e.x));
            runOnJS(setHue)((hueX.value / SV_FIELD_SIZE) * 360);
        });

    const hueIndicatorStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: hueX.value - 10 },
        ],
    }));

    // Calculate available space for the scroll list
    // Title (~18) + Margins (~20) + Add Button (~54)
    const LIST_MAX_HEIGHT = panelHeight ? panelHeight - 92 : 'auto';

    return (
        <View style={[styles.container, panelHeight ? { height: panelHeight } : { flex: 1 }]}>
            <View style={styles.topSection}>
                <ThemedText style={styles.sectionTitle}>Key</ThemedText>

                <View style={{ maxHeight: LIST_MAX_HEIGHT }}>
                    <ScrollView
                        style={styles.legendList}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={styles.legendContent}
                    >
                        {legend.map((item, index) => (
                            <React.Fragment key={item.id}>
                                <TouchableOpacity
                                    style={[
                                        styles.legendItem,
                                        activeColorId === item.id && styles.activeLegendItem
                                    ]}
                                    onPress={() => setActiveColorId(activeColorId === item.id ? null : item.id)}
                                    onLongPress={() => {
                                        Alert.alert(
                                            'Delete Color',
                                            `Remove "${item.label}"?`,
                                            [
                                                { text: 'Cancel', style: 'cancel' },
                                                { text: 'Delete', style: 'destructive', onPress: () => removeLegendItem(item.id) },
                                            ]
                                        );
                                    }}
                                >
                                    <ThemedText style={styles.legendLabel} numberOfLines={1}>{item.label}</ThemedText>
                                    <View style={[styles.colorSquare, { backgroundColor: item.color }]} />
                                </TouchableOpacity>
                                {index < legend.length - 1 && <View style={styles.legendDivider} />}
                            </React.Fragment>
                        ))}
                    </ScrollView>
                </View>
            </View>

            {legend.length < 10 && (
                <TouchableOpacity style={styles.addButton} onPress={() => setIsAdding(true)}>
                    <Ionicons
                        name="add"
                        size={24}
                        color={isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.8)'}
                    />
                </TouchableOpacity>
            )}

            <Modal visible={isAdding} transparent animationType="fade">
                <GestureHandlerRootView style={styles.modalOverlay}>
                    <View style={[styles.solidModal, { backgroundColor: isDark ? '#1a1a1a' : '#fff' }]}>
                        {/* Label Input */}
                        <TextInput
                            style={[styles.labelInput, { color: colors.text }]}
                            placeholder="Mood name"
                            placeholderTextColor={colors.textTertiary}
                            value={label}
                            onChangeText={setLabel}
                            textAlign="center"
                        />

                        {/* Color Preview */}
                        <View style={styles.previewContainer}>
                            <View style={[styles.previewSwatch, { backgroundColor: currentColor }]} />
                        </View>

                        {/* SV Field */}
                        <View style={styles.svContainer}>
                            <GestureDetector gesture={svGesture}>
                                <Animated.View style={styles.svField}>
                                    <Svg width={SV_FIELD_SIZE} height={SV_FIELD_SIZE}>
                                        <Defs>
                                            <SvgGradient id="gradWhite" x1="0" y1="0.5" x2="1" y2="0.5">
                                                <Stop offset="0" stopColor="#fff" stopOpacity={1} />
                                                <Stop offset="1" stopColor="#fff" stopOpacity={0} />
                                            </SvgGradient>
                                            <SvgGradient id="gradBlack" x1="0.5" y1="0" x2="0.5" y2="1">
                                                <Stop offset="0" stopColor="#000" stopOpacity={0} />
                                                <Stop offset="1" stopColor="#000" stopOpacity={1} />
                                            </SvgGradient>
                                        </Defs>
                                        {/* Base Hue Layer */}
                                        <Rect width={SV_FIELD_SIZE} height={SV_FIELD_SIZE} fill={hsvToHex(hue, 1, 1)} />
                                        {/* Saturation Layer (White -> Transparent) */}
                                        <Rect width={SV_FIELD_SIZE} height={SV_FIELD_SIZE} fill="url(#gradWhite)" />
                                        {/* Value Layer (Transparent -> Black) */}
                                        <Rect width={SV_FIELD_SIZE} height={SV_FIELD_SIZE} fill="url(#gradBlack)" />
                                    </Svg>
                                    <Animated.View style={[styles.svIndicator, svIndicatorStyle]} />
                                </Animated.View>
                            </GestureDetector>
                        </View>

                        {/* Hue Slider */}
                        <View style={styles.hueContainer}>
                            <GestureDetector gesture={hueGesture}>
                                <Animated.View style={styles.hueSlider}>
                                    <Svg width={SV_FIELD_SIZE} height={SLIDER_HEIGHT}>
                                        <Defs>
                                            <SvgGradient id="gradHue" x1="0" y1="0.5" x2="1" y2="0.5">
                                                <Stop offset="0" stopColor="#f00" />
                                                <Stop offset="0.166" stopColor="#ff0" />
                                                <Stop offset="0.333" stopColor="#0f0" />
                                                <Stop offset="0.5" stopColor="#0ff" />
                                                <Stop offset="0.666" stopColor="#00f" />
                                                <Stop offset="0.833" stopColor="#f0f" />
                                                <Stop offset="1" stopColor="#f00" />
                                            </SvgGradient>
                                        </Defs>
                                        <Rect width={SV_FIELD_SIZE} height={SLIDER_HEIGHT} rx={10} fill="url(#gradHue)" />
                                    </Svg>
                                    <Animated.View style={[styles.hueIndicator, hueIndicatorStyle, { backgroundColor: hsvToHex(hue, 1, 1) }]} />
                                </Animated.View>
                            </GestureDetector>
                        </View>

                        {/* Hex Input */}
                        <View style={styles.hexContainer}>
                            <TextInput
                                style={[styles.hexInput, { color: colors.text }]}
                                value={hexInput}
                                onChangeText={handleHexChange}
                                maxLength={7}
                                autoCapitalize="characters"
                            />
                        </View>

                        {/* Modal Actions */}
                        <View style={styles.modalActions}>
                            <TouchableOpacity onPress={() => setIsAdding(false)}>
                                <ThemedText style={styles.actionText}>Cancel</ThemedText>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleAdd} disabled={!label.trim()}>
                                <ThemedText style={[styles.actionText, !label.trim() && { opacity: 0.3 }]}>Save</ThemedText>
                            </TouchableOpacity>
                        </View>
                    </View>
                </GestureHandlerRootView>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
    },
    topSection: {
        flex: 1,
        width: '100%',
        alignItems: 'center',
    },
    sectionTitle: {
        fontSize: 11,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.5)',
        marginBottom: 12,
    },
    legendList: {
        width: '100%',
    },
    legendContent: {
        alignItems: 'center',
        gap: 8,
        paddingBottom: 20,
    },
    legendItem: {
        padding: 4,
        borderRadius: 8,
        alignItems: 'center',
        width: 50,
    },
    activeLegendItem: {
        backgroundColor: 'rgba(212, 175, 55, 0.15)',
        shadowColor: '#D4AF37',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 4,
    },
    legendLabel: {
        fontSize: 8,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.4)',
        textAlign: 'center',
        marginBottom: 2,
        width: 40,
    },
    legendDivider: {
        width: 30,
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.05)',
        marginVertical: 4,
    },
    colorSquare: {
        width: 28,
        height: 28,
        borderRadius: 6,
        alignSelf: 'center',
    },
    addButton: {
        width: 44, // Larger for visibility
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 10,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    solidModal: {
        width: '100%',
        maxWidth: SV_FIELD_SIZE + 48,
        padding: 24,
        alignItems: 'center',
        borderRadius: 32,
        // Elevation/Shadow
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 10,
    },
    labelInput: {
        fontSize: 24,
        fontWeight: '400',
        color: 'rgba(255,255,255,0.4)',
        marginBottom: 20,
        width: '100%',
    },
    previewContainer: {
        marginBottom: 12,
    },
    previewSwatch: {
        width: 50,
        height: 50,
        borderRadius: 12,
    },
    svContainer: {
        width: SV_FIELD_SIZE,
        height: SV_FIELD_SIZE,
        borderRadius: 20,
        overflow: 'hidden',
        marginBottom: 24,
    },
    svField: {
        width: SV_FIELD_SIZE,
        height: SV_FIELD_SIZE,
        borderRadius: 12,
        overflow: 'hidden',
    },
    svIndicator: {
        position: 'absolute',
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 3,
        borderColor: '#fff',
        backgroundColor: 'transparent',
    },
    hueContainer: {
        width: SV_FIELD_SIZE,
        height: SLIDER_HEIGHT,
        marginBottom: 24,
    },
    hueSlider: {
        width: SV_FIELD_SIZE,
        height: SLIDER_HEIGHT,
        justifyContent: 'center',
    },
    hueIndicator: {
        position: 'absolute',
        width: 30,
        height: 30,
        borderRadius: 15,
        borderWidth: 3,
        borderColor: '#fff',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 5,
    },
    hexContainer: {
        width: '100%',
        alignItems: 'center',
        marginBottom: 20,
    },
    hexInput: {
        fontSize: 18,
        letterSpacing: 1,
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        borderRadius: 12,
        minWidth: 140,
        textAlign: 'center',
    },
    modalActions: {
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 8,
    },
    actionText: {
        fontSize: 16,
        fontWeight: '500',
    },
});

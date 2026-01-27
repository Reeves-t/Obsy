import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextStyle, View, LayoutChangeEvent } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from '@react-navigation/native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    Easing,
    cancelAnimation,
    SharedValue,
} from 'react-native-reanimated';
import { Colors } from '@/constants/Colors';

export type HighlightPalette = 'purple' | 'green' | 'orange';

interface WaveHighlightTextProps {
    text: string;
    palette: HighlightPalette;
    style?: TextStyle;
    /** Optional shared progress value (0 to 1) for syncing multiple highlights */
    progress?: SharedValue<number>;
}

// All 4 highlight colors
const PURPLE = Colors.highlight.purple;
const GREEN = Colors.highlight.emerald;
const BLUE = Colors.highlight.blue;
const ORANGE = Colors.highlight.orange;
const WHITE = 'rgba(255, 255, 255, 0.95)';

/**
 * Build a long gradient that contains all color waves in sequence.
 * Each color has a solid section followed by a white transition.
 * The gradient sweeps left-to-right continuously.
 *
 * Structure: [color1, color1, white, white, color2, color2, white, white, ...]
 * Each color pair creates a solid block, white pairs create smooth transitions.
 */
const getWaveGradient = (palette: HighlightPalette): string[] => {
    // Different color orders based on palette for variety between highlights
    let colors: string[];
    switch (palette) {
        case 'purple':
            colors = [PURPLE, GREEN, BLUE, ORANGE];
            break;
        case 'green':
            colors = [GREEN, BLUE, ORANGE, PURPLE];
            break;
        case 'orange':
            colors = [ORANGE, PURPLE, GREEN, BLUE];
            break;
        default:
            colors = [PURPLE, GREEN, BLUE, ORANGE];
    }

    // Build gradient: each color gets a solid section, then transitions through white
    const gradient: string[] = [];
    for (const color of colors) {
        gradient.push(color, color); // Solid color block
        gradient.push(WHITE, WHITE); // White transition
    }
    // Add first color again at end for seamless loop
    gradient.push(colors[0], colors[0]);

    return gradient;
};

// Generate evenly spaced gradient locations
const getGradientLocations = (numStops: number): number[] => {
    const locations: number[] = [];
    for (let i = 0; i < numStops; i++) {
        locations.push(i / (numStops - 1));
    }
    return locations;
};

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

// Full cycle duration: ~11 seconds (4 colors × ~2.75s each)
const CYCLE_DURATION = 11000;

// How much wider the gradient is vs the text (to contain all color waves)
// 4 colors + 4 white transitions + 1 loop buffer = ~10 segments worth
const GRADIENT_WIDTH_MULTIPLIER = 10;

/**
 * WaveHighlightText Component
 *
 * Renders highlighted text with:
 * - Colors wave in from left to right (not strobe-like)
 * - One solid color at a time, white transitions between
 * - All 4 app colors cycle through (purple, green, blue, orange)
 * - Full cycle completes in ~11 seconds
 * - Subtle bottom sheen for premium look
 */
export function WaveHighlightText({ text, palette, style, progress }: WaveHighlightTextProps) {
    const [layout, setLayout] = useState({ width: 0, height: 0 });
    const internalTranslateX = useSharedValue(0);
    const translateX = progress || internalTranslateX;
    const hasLayout = layout.width > 0 && layout.height > 0;

    // Measure the text block dimensions
    const handleLayout = (event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;
        if (width > 0 && height > 0) {
            setLayout({ width, height });
        }
    };

    // Calculate gradient dimensions
    const gradientWidth = layout.width * GRADIENT_WIDTH_MULTIPLIER;
    // How far to translate to sweep through all colors
    const translateDistance = gradientWidth - layout.width;

    const isFocused = useIsFocused();

    useEffect(() => {
        if (!hasLayout || progress) return;

        if (!isFocused) {
            cancelAnimation(translateX);
            return;
        }

        // Continuously sweep the gradient from right to left
        // This makes colors appear to wave in from the left
        translateX.value = withRepeat(
            withTiming(1, {
                duration: CYCLE_DURATION,
                easing: Easing.linear,
            }),
            -1, // Infinite loop
            false // Don't reverse - continuous left-to-right wave
        );
    }, [hasLayout, translateX, isFocused, progress]);

    const animatedGradientStyle = useAnimatedStyle(() => {
        // Move gradient from 0 to -translateDistance (sweeps colors left-to-right)
        return {
            transform: [{ translateX: -translateX.value * translateDistance }],
        };
    });

    const gradientColors = getWaveGradient(palette);
    const gradientLocations = getGradientLocations(gradientColors.length);

    return (
        <View style={styles.container}>
            {/* Hidden text to measure dimensions */}
            <Text
                style={[styles.maskText, style, styles.measureText]}
                onLayout={handleLayout}
            >
                {text}
            </Text>

            {/* Only render masked views once we have measurements */}
            {hasLayout && (
                <>
                    <MaskedView
                        style={[styles.maskedView, { width: '100%', alignSelf: 'stretch' }]}
                        maskElement={
                            <View style={styles.maskContainer}>
                                <Text style={[styles.maskText, style]}>
                                    {text}
                                </Text>
                            </View>
                        }
                    >
                        {/* Wave gradient that sweeps colors left-to-right */}
                        <AnimatedLinearGradient
                            colors={gradientColors as any}
                            start={{ x: 0, y: 0.5 }}
                            end={{ x: 1, y: 0.5 }}
                            locations={gradientLocations as any}
                            style={[
                                {
                                    width: gradientWidth,
                                    height: layout.height,
                                },
                                animatedGradientStyle,
                            ]}
                        />
                    </MaskedView>

                    {/* Bottom white sheen overlay */}
                    <MaskedView
                        style={[styles.sheenOverlay, { height: layout.height }]}
                        maskElement={
                            <View style={styles.maskContainer}>
                                <Text style={[styles.maskText, style]}>
                                    {text}
                                </Text>
                            </View>
                        }
                    >
                        <LinearGradient
                            colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.15)']}
                            start={{ x: 0.5, y: 0 }}
                            end={{ x: 0.5, y: 1 }}
                            style={[StyleSheet.absoluteFillObject]}
                        />
                    </MaskedView>
                </>
            )}
        </View>
    );
}

const FONT_SIZE = 15;
const LINE_HEIGHT = FONT_SIZE * 1.6;

const styles = StyleSheet.create({
    container: {
        position: 'relative',
    },
    measureText: {
        position: 'absolute',
        opacity: 0,
    },
    maskedView: {
        flexDirection: 'row',
    },
    maskContainer: {
        backgroundColor: 'transparent',
    },
    maskText: {
        fontSize: FONT_SIZE,
        lineHeight: LINE_HEIGHT,
        fontWeight: '600',
        letterSpacing: 0.2,
        backgroundColor: 'transparent',
    },
    sheenOverlay: {
        ...StyleSheet.absoluteFillObject,
    },
});

export default WaveHighlightText;


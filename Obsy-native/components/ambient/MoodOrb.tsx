import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withSequence,
    withTiming,
    Easing,
    withDelay,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

interface MoodOrbProps {
    color: string;
    size: number; // Size multiplier (1.0 = base, 1.5 = 1.5x, etc.)
    x: number; // Absolute x position
    y: number; // Absolute y position
    delay: number; // Initial delay before starting animation (ms)
    isPaused: boolean; // Pause animation when true
}

const BASE_SIZE = 12; // Base icon size in pixels (subtle sparkles)
const FADE_IN_DURATION = 2500; // 2.5 seconds fade in
const HOLD_DURATION = 600; // 0.6 seconds hold at peak
const FADE_OUT_DURATION = 2000; // 2 seconds fade out

/**
 * MoodOrb - A single breathing orb for the Ambient Mood Field
 *
 * Animation cycle:
 * 1. Fade in slowly (8s)
 * 2. Hold briefly at peak (2s)
 * 3. Fade out slowly (6s)
 * 4. Pause briefly before repeating
 *
 * The orb is soft-edged with low opacity and slight blur effect
 */
export function MoodOrb({ color, size, x, y, delay, isPaused }: MoodOrbProps) {
    const opacity = useSharedValue(0);

    useEffect(() => {
        if (isPaused) {
            // Pause - fade out quickly
            opacity.value = withTiming(0, { duration: 1000 });
            return;
        }

        // Simple breathing animation - smooth fade in/out
        opacity.value = withDelay(
            delay,
            withRepeat(
                withSequence(
                    // Fade in
                    withTiming(0.7, { // High contrast opacity
                        duration: FADE_IN_DURATION,
                        easing: Easing.inOut(Easing.ease),
                    }),
                    // Hold at peak
                    withTiming(0.7, {
                        duration: HOLD_DURATION,
                    }),
                    // Fade out
                    withTiming(0, {
                        duration: FADE_OUT_DURATION,
                        easing: Easing.inOut(Easing.ease),
                    }),
                    // Brief pause before repeat
                    withTiming(0, {
                        duration: 800,
                    })
                ),
                -1, // Infinite repeat
                false
            )
        );
    }, [isPaused, delay]);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
    }));

    const iconSize = BASE_SIZE * size;

    return (
        <Animated.View
            style={[
                styles.sparkle,
                {
                    left: x,
                    top: y,
                },
                animatedStyle,
            ]}
        >
            <Ionicons
                name="ellipse"
                size={iconSize}
                color={color}
                style={styles.icon}
            />
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    sparkle: {
        position: 'absolute',
    },
    icon: {
        // Enhanced glow for better contrast
        textShadowColor: 'rgba(255, 255, 255, 0.8)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 8,
    },
});

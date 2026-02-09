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

interface MoodOrbProps {
    color: string;
    size: number; // Size multiplier (1.0 = base, 1.5 = 1.5x, etc.)
    x: number; // Absolute x position
    y: number; // Absolute y position
    delay: number; // Initial delay before starting animation (ms)
    isPaused: boolean; // Pause animation when true
}

const BASE_SIZE = 60; // Base orb diameter in pixels
const FADE_IN_DURATION = 8000; // 8 seconds fade in
const HOLD_DURATION = 2000; // 2 seconds hold at peak
const FADE_OUT_DURATION = 6000; // 6 seconds fade out

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
    const scale = useSharedValue(0.95);

    useEffect(() => {
        if (isPaused) {
            // Pause at current opacity
            opacity.value = withTiming(0, { duration: 1000 });
            scale.value = withTiming(0.95, { duration: 1000 });
            return;
        }

        // Breathing animation sequence
        opacity.value = withDelay(
            delay,
            withRepeat(
                withSequence(
                    // Fade in
                    withTiming(0.25, { // Low opacity for subtlety
                        duration: FADE_IN_DURATION,
                        easing: Easing.inOut(Easing.ease),
                    }),
                    // Hold
                    withTiming(0.25, {
                        duration: HOLD_DURATION,
                    }),
                    // Fade out
                    withTiming(0, {
                        duration: FADE_OUT_DURATION,
                        easing: Easing.inOut(Easing.ease),
                    }),
                    // Brief pause before repeat
                    withTiming(0, {
                        duration: 1000,
                    })
                ),
                -1, // Infinite repeat
                false
            )
        );

        // Subtle scale breathing (barely noticeable)
        scale.value = withDelay(
            delay,
            withRepeat(
                withSequence(
                    withTiming(1.0, {
                        duration: FADE_IN_DURATION,
                        easing: Easing.inOut(Easing.ease),
                    }),
                    withTiming(1.0, {
                        duration: HOLD_DURATION,
                    }),
                    withTiming(0.95, {
                        duration: FADE_OUT_DURATION,
                        easing: Easing.inOut(Easing.ease),
                    }),
                    withTiming(0.95, {
                        duration: 1000,
                    })
                ),
                -1,
                false
            )
        );
    }, [isPaused, delay]);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ scale: scale.value }],
    }));

    const orbSize = BASE_SIZE * size;

    return (
        <Animated.View
            style={[
                styles.orb,
                {
                    width: orbSize,
                    height: orbSize,
                    borderRadius: orbSize / 2,
                    backgroundColor: color,
                    left: x,
                    top: y,
                },
                animatedStyle,
            ]}
        />
    );
}

const styles = StyleSheet.create({
    orb: {
        position: 'absolute',
        // Soft glow effect
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 0,
        },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 5,
    },
});

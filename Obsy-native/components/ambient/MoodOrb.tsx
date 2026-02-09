import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withSequence,
    withTiming,
    Easing,
    withDelay,
    runOnJS,
} from 'react-native-reanimated';

interface MoodOrbProps {
    color: string;
    size: number; // Size multiplier (1.0 = base, 1.5 = 1.5x, etc.)
    x: number; // Absolute x position
    y: number; // Absolute y position
    delay: number; // Initial delay before starting animation (ms)
    isPaused: boolean; // Pause animation when true
}

const BASE_SIZE = 24; // Base orb diameter in pixels (tiny like stars)
const FADE_IN_DURATION = 2500; // 2.5 seconds fade in
const HOLD_DURATION = 600; // 0.6 seconds hold at peak
const FADE_OUT_DURATION = 2000; // 2 seconds fade out
const SHINE_DURATION = 400; // 0.4 seconds shine pulse

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
    const scale = useSharedValue(1.0);
    const shine = useSharedValue(1.0);

    useEffect(() => {
        if (isPaused) {
            // Pause - fade out quickly
            opacity.value = withTiming(0, { duration: 1000 });
            scale.value = withTiming(1.0, { duration: 1000 });
            shine.value = withTiming(1.0, { duration: 1000 });
            return;
        }

        // Breathing animation sequence with shine
        opacity.value = withDelay(
            delay,
            withRepeat(
                withSequence(
                    // Fade in
                    withTiming(0.5, { // Brighter opacity
                        duration: FADE_IN_DURATION,
                        easing: Easing.inOut(Easing.ease),
                    }),
                    // Hold at peak
                    withTiming(0.5, {
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

        // Shine pulse at peak (quick glow)
        shine.value = withDelay(
            delay,
            withRepeat(
                withSequence(
                    // No shine during fade in
                    withTiming(1.0, {
                        duration: FADE_IN_DURATION,
                    }),
                    // Quick shine pulse at peak
                    withTiming(1.4, {
                        duration: SHINE_DURATION,
                        easing: Easing.out(Easing.ease),
                    }),
                    // Shine fades during hold
                    withTiming(1.0, {
                        duration: HOLD_DURATION - SHINE_DURATION,
                        easing: Easing.in(Easing.ease),
                    }),
                    // No shine during fade out
                    withTiming(1.0, {
                        duration: FADE_OUT_DURATION + 800,
                    })
                ),
                -1,
                false
            )
        );

        // Subtle scale variation (breathing feel)
        scale.value = withDelay(
            delay,
            withRepeat(
                withSequence(
                    withTiming(1.05, {
                        duration: FADE_IN_DURATION,
                        easing: Easing.inOut(Easing.ease),
                    }),
                    withTiming(1.05, {
                        duration: HOLD_DURATION,
                    }),
                    withTiming(1.0, {
                        duration: FADE_OUT_DURATION,
                        easing: Easing.inOut(Easing.ease),
                    }),
                    withTiming(1.0, {
                        duration: 800,
                    })
                ),
                -1,
                false
            )
        );
    }, [isPaused, delay]);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ scale: scale.value * shine.value }],
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

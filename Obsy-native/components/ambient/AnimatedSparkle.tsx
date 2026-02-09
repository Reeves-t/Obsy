import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withSequence,
    withTiming,
    withDelay,
    Easing,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

interface AnimatedSparkleProps {
    /** Center x coordinate within the cluster */
    cx: number;
    /** Center y coordinate within the cluster */
    cy: number;
    /** Arm length of the sparkle (half the total width/height) */
    radius: number;
    /** Fill color */
    color: string;
    /** Delay before animation starts (ms) */
    delay: number;
    /** Total animation cycle duration (ms) */
    cycleDuration: number;
    /** Whether to pause the animation */
    isPaused: boolean;
    /** Peak opacity (0-1) */
    peakOpacity?: number;
    /** Whether to include rotation in the animation */
    rotate?: boolean;
}

/**
 * Generates a 4-pointed star SVG path centered at the middle of a viewBox.
 * The star has sharp points along the axes and thin waist between them.
 *
 * @param centerX - Center X in the SVG coordinate space
 * @param centerY - Center Y in the SVG coordinate space
 * @param outerR - Length of the sharp points
 * @param innerR - Width of the waist (controls how thin the star is)
 */
function starPath(centerX: number, centerY: number, outerR: number, innerR: number): string {
    const points: string[] = [];
    for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4 - Math.PI / 2; // Start from top
        const r = i % 2 === 0 ? outerR : innerR;
        const x = centerX + Math.cos(angle) * r;
        const y = centerY + Math.sin(angle) * r;
        points.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`);
    }
    return points.join(' ') + ' Z';
}

/**
 * AnimatedSparkle - A single 4-pointed star sparkle with scale, opacity, and rotation animations.
 *
 * Uses Animated.View for transforms (scale, rotation, positioning) and renders
 * the star shape as a small self-contained SVG.
 *
 * Animation:
 * - Scale: 0 → 1 → 0 (grow in, shrink out)
 * - Opacity: 0 → peak → 0
 * - Rotation (optional): subtle twist during lifecycle
 */
export function AnimatedSparkle({
    cx,
    cy,
    radius,
    color,
    delay: initialDelay,
    cycleDuration,
    isPaused,
    peakOpacity = 0.9,
    rotate = false,
}: AnimatedSparkleProps) {
    const scale = useSharedValue(0);
    const opacity = useSharedValue(0);
    const rotation = useSharedValue(0);

    const growDuration = cycleDuration * 0.35;
    const holdDuration = cycleDuration * 0.15;
    const shrinkDuration = cycleDuration * 0.30;
    const restDuration = cycleDuration * 0.20;

    useEffect(() => {
        if (isPaused) {
            scale.value = withTiming(0, { duration: 600 });
            opacity.value = withTiming(0, { duration: 600 });
            return;
        }

        // Scale animation: 0 → 1 → hold → 0
        scale.value = withDelay(
            initialDelay,
            withRepeat(
                withSequence(
                    withTiming(1, {
                        duration: growDuration,
                        easing: Easing.out(Easing.cubic),
                    }),
                    withTiming(1, { duration: holdDuration }),
                    withTiming(0, {
                        duration: shrinkDuration,
                        easing: Easing.in(Easing.cubic),
                    }),
                    withTiming(0, { duration: restDuration })
                ),
                -1,
                false
            )
        );

        // Opacity: slightly leads scale for a sparkle feel
        opacity.value = withDelay(
            initialDelay,
            withRepeat(
                withSequence(
                    withTiming(peakOpacity, {
                        duration: growDuration * 0.8,
                        easing: Easing.out(Easing.quad),
                    }),
                    withTiming(peakOpacity * 0.85, {
                        duration: holdDuration + growDuration * 0.2,
                    }),
                    withTiming(0, {
                        duration: shrinkDuration,
                        easing: Easing.in(Easing.quad),
                    }),
                    withTiming(0, { duration: restDuration })
                ),
                -1,
                false
            )
        );

        // Optional rotation
        if (rotate) {
            rotation.value = withDelay(
                initialDelay,
                withRepeat(
                    withTiming(45, {
                        duration: growDuration + holdDuration + shrinkDuration,
                        easing: Easing.inOut(Easing.ease),
                    }),
                    -1,
                    true // reverse each cycle for smooth back-and-forth
                )
            );
        }
    }, [isPaused, initialDelay, cycleDuration]);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [
            { scale: scale.value },
            ...(rotate ? [{ rotate: `${rotation.value}deg` }] : []),
        ],
    }));

    // SVG viewBox sized to fit the star
    const svgSize = radius * 2 + 2; // +2 for anti-alias
    const center = svgSize / 2;
    const d = starPath(center, center, radius, radius * 0.15);

    return (
        <Animated.View
            style={[
                styles.sparkle,
                {
                    left: cx - svgSize / 2,
                    top: cy - svgSize / 2,
                    width: svgSize,
                    height: svgSize,
                },
                animatedStyle,
            ]}
        >
            <Svg width={svgSize} height={svgSize} viewBox={`0 0 ${svgSize} ${svgSize}`}>
                <Path d={d} fill={color} />
            </Svg>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    sparkle: {
        position: 'absolute',
    },
});

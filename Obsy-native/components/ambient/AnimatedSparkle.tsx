import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSequence,
    withTiming,
    withDelay,
    Easing,
} from 'react-native-reanimated';
import Svg, { Ellipse } from 'react-native-svg';

interface AnimatedSparkleProps {
    /** Center x coordinate within the cluster */
    cx: number;
    /** Center y coordinate within the cluster */
    cy: number;
    /** Size of the ellipse (used for radii) */
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
    /** Shape: 'circle' for equal radii, 'ellipse' for elongated */
    shape?: 'circle' | 'ellipse';
}


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
    shape = 'ellipse',
}: AnimatedSparkleProps) {
    const scale = useSharedValue(0);
    const opacity = useSharedValue(0);
    const rotation = useSharedValue(0);

    const growDuration = cycleDuration * 0.35;
    const holdDuration = cycleDuration * 0.15;
    const shrinkDuration = cycleDuration * 0.30;

    useEffect(() => {
        if (isPaused) {
            scale.value = withTiming(0, { duration: 600 });
            opacity.value = withTiming(0, { duration: 600 });
            return;
        }

        // Scale animation: 0 → 1 → hold → 0 (plays once)
        scale.value = withDelay(
            initialDelay,
            withSequence(
                withTiming(1, {
                    duration: growDuration,
                    easing: Easing.out(Easing.cubic),
                }),
                withTiming(1, { duration: holdDuration }),
                withTiming(0, {
                    duration: shrinkDuration,
                    easing: Easing.in(Easing.cubic),
                })
            )
        );

        // Opacity: slightly leads scale for a sparkle feel
        opacity.value = withDelay(
            initialDelay,
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
                })
            )
        );

        // Optional rotation
        if (rotate) {
            rotation.value = withDelay(
                initialDelay,
                withTiming(45, {
                    duration: growDuration + holdDuration + shrinkDuration,
                    easing: Easing.inOut(Easing.ease),
                })
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

    const rx = radius;
    const ry = shape === 'circle' ? radius : radius * 0.6;
    const svgW = rx * 2 + 2;
    const svgH = ry * 2 + 2;
    const centerX = svgW / 2;
    const centerY = svgH / 2;

    return (
        <Animated.View
            style={[
                styles.sparkle,
                {
                    left: cx - svgW / 2,
                    top: cy - svgH / 2,
                    width: svgW,
                    height: svgH,
                },
                animatedStyle,
            ]}
        >
            <Svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`}>
                <Ellipse cx={centerX} cy={centerY} rx={rx} ry={ry} fill={color} />
            </Svg>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    sparkle: {
        position: 'absolute',
    },
});

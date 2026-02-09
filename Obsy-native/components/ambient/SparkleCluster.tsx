import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withSequence,
    withTiming,
    withDelay,
    Easing,
} from 'react-native-reanimated';
import { AnimatedSparkle } from './AnimatedSparkle';

interface SparkleClusterProps {
    /** Mood color for all sparkles in this cluster */
    color: string;
    /** Size multiplier from mood weight (1.0 = base) */
    sizeFactor: number;
    /** Absolute x position on screen */
    x: number;
    /** Absolute y position on screen */
    y: number;
    /** Initial delay before cluster starts animating (ms) */
    delay: number;
    /** Whether animations are paused */
    isPaused: boolean;
}

/** Layout of a single sparkle within the cluster */
interface SparkleLayout {
    /** Offset from cluster center x */
    ox: number;
    /** Offset from cluster center y */
    oy: number;
    /** Radius of the sparkle arm */
    radius: number;
    /** Extra delay relative to cluster start (ms) */
    stagger: number;
    /** Animation cycle duration (ms) */
    cycle: number;
    /** Peak opacity */
    peakOpacity: number;
    /** Whether this sparkle rotates */
    rotate: boolean;
}

// Base cluster size (before sizeFactor)
const BASE_CLUSTER_RADIUS = 28;

/**
 * Predefined sparkle layouts within a cluster.
 *
 * Inspired by the Shutterstock starburst:
 * - One large center sparkle
 * - Several medium sparkles around it at various offsets
 * - A few tiny accent sparkles for extra shimmer
 *
 * Offsets are relative to cluster center, normalized to BASE_CLUSTER_RADIUS.
 */
const SPARKLE_LAYOUTS: SparkleLayout[] = [
    // Center sparkle — large, no rotation, prominent
    { ox: 0, oy: 0, radius: 10, stagger: 0, cycle: 3200, peakOpacity: 0.95, rotate: false },
    // Upper-right — medium, slight delay
    { ox: 12, oy: -14, radius: 6, stagger: 400, cycle: 2800, peakOpacity: 0.8, rotate: true },
    // Lower-left — medium
    { ox: -10, oy: 12, radius: 5.5, stagger: 700, cycle: 3000, peakOpacity: 0.75, rotate: false },
    // Upper-left — small accent
    { ox: -14, oy: -8, radius: 3.5, stagger: 1100, cycle: 2400, peakOpacity: 0.7, rotate: true },
    // Lower-right — small accent
    { ox: 8, oy: 10, radius: 3, stagger: 900, cycle: 2600, peakOpacity: 0.65, rotate: false },
    // Far upper — tiny twinkle
    { ox: 2, oy: -20, radius: 2.5, stagger: 1400, cycle: 2200, peakOpacity: 0.6, rotate: true },
];

/**
 * SparkleCluster — A group of animated 4-pointed star sparkles
 * arranged in a starburst pattern.
 *
 * Each sparkle has independent timing, creating the "magic sparkle"
 * effect where stars appear and disappear asynchronously.
 *
 * The cluster itself has a subtle glow animation via a pulsing background circle.
 */
export function SparkleCluster({
    color,
    sizeFactor,
    x,
    y,
    delay: clusterDelay,
    isPaused,
}: SparkleClusterProps) {
    const clusterScale = Math.max(0.6, sizeFactor);
    const viewSize = BASE_CLUSTER_RADIUS * 2 * clusterScale + 20; // Extra padding for glow

    // Subtle glow pulse on the container
    const glowOpacity = useSharedValue(0);

    React.useEffect(() => {
        if (isPaused) {
            glowOpacity.value = withTiming(0, { duration: 600 });
            return;
        }
        glowOpacity.value = withDelay(
            clusterDelay,
            withRepeat(
                withSequence(
                    withTiming(0.25, {
                        duration: 2000,
                        easing: Easing.inOut(Easing.ease),
                    }),
                    withTiming(0.08, {
                        duration: 2500,
                        easing: Easing.inOut(Easing.ease),
                    })
                ),
                -1,
                true
            )
        );
    }, [isPaused, clusterDelay]);

    const glowStyle = useAnimatedStyle(() => ({
        opacity: glowOpacity.value,
    }));

    const sparkles = useMemo(() => {
        const center = viewSize / 2;
        return SPARKLE_LAYOUTS.map((layout, i) => ({
            key: i,
            cx: center + layout.ox * clusterScale,
            cy: center + layout.oy * clusterScale,
            radius: layout.radius * clusterScale,
            delay: clusterDelay + layout.stagger,
            cycle: layout.cycle,
            peakOpacity: layout.peakOpacity,
            rotate: layout.rotate,
        }));
    }, [clusterScale, viewSize, clusterDelay]);

    return (
        <View
            style={[
                styles.clusterContainer,
                {
                    left: x - viewSize / 2,
                    top: y - viewSize / 2,
                    width: viewSize,
                    height: viewSize,
                },
            ]}
        >
            {/* Soft glow behind the cluster */}
            <Animated.View
                style={[
                    styles.glow,
                    {
                        backgroundColor: color,
                        width: viewSize * 0.7,
                        height: viewSize * 0.7,
                        borderRadius: viewSize * 0.35,
                        left: viewSize * 0.15,
                        top: viewSize * 0.15,
                    },
                    glowStyle,
                ]}
            />
            {/* Individual sparkle stars */}
            {sparkles.map((s) => (
                <AnimatedSparkle
                    key={s.key}
                    cx={s.cx}
                    cy={s.cy}
                    radius={s.radius}
                    color={color}
                    delay={s.delay}
                    cycleDuration={s.cycle}
                    isPaused={isPaused}
                    peakOpacity={s.peakOpacity}
                    rotate={s.rotate}
                />
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    clusterContainer: {
        position: 'absolute',
    },
    glow: {
        position: 'absolute',
    },
});

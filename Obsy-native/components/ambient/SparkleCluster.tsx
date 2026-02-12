import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
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
    /** Light theme — larger + more opaque for visibility */
    isLight?: boolean;
}

/** Layout of a single sparkle within the cluster */
interface SparkleLayout {
    ox: number;
    oy: number;
    radius: number;
    stagger: number;
    cycle: number;
    peakOpacity: number;
    rotate: boolean;
    shape: 'circle' | 'ellipse';
}

const BASE_CLUSTER_RADIUS = 16;

const SPARKLE_LAYOUTS: SparkleLayout[] = [
    // Upper-right — ellipse
    { ox: 6, oy: -7, radius: 2.5, stagger: 0, cycle: 1500, peakOpacity: 0.8, rotate: true, shape: 'ellipse' },
    // Lower-left — ellipse
    { ox: -5, oy: 6, radius: 2, stagger: 150, cycle: 1600, peakOpacity: 0.75, rotate: false, shape: 'ellipse' },
    // Upper-left — ellipse
    { ox: -7, oy: -4, radius: 1.5, stagger: 300, cycle: 1300, peakOpacity: 0.7, rotate: true, shape: 'ellipse' },
    // Lower-right — ellipse
    { ox: 4, oy: 5, radius: 1.3, stagger: 250, cycle: 1400, peakOpacity: 0.65, rotate: false, shape: 'ellipse' },
    // Far upper — ellipse
    { ox: 1, oy: -10, radius: 1, stagger: 450, cycle: 1200, peakOpacity: 0.6, rotate: true, shape: 'ellipse' },
];

export function SparkleCluster({
    color,
    sizeFactor,
    x,
    y,
    delay: clusterDelay,
    isPaused,
    isLight = false,
}: SparkleClusterProps) {
    const clusterScale = Math.max(0.6, sizeFactor);
    // Light theme: scale up to keep original visibility, dark theme: use smaller sizes
    const radiusScale = isLight ? 1.4 : 1.0;
    const viewSize = BASE_CLUSTER_RADIUS * 2 * clusterScale * (isLight ? 1.4 : 1.0) + 10;

    const sparkles = useMemo(() => {
        const center = viewSize / 2;
        return SPARKLE_LAYOUTS.map((layout, i) => ({
            key: i,
            cx: center + layout.ox * clusterScale * radiusScale,
            cy: center + layout.oy * clusterScale * radiusScale,
            radius: layout.radius * clusterScale * radiusScale,
            delay: clusterDelay + layout.stagger,
            cycle: layout.cycle,
            peakOpacity: isLight ? Math.min(1, layout.peakOpacity * 1.3) : layout.peakOpacity,
            rotate: layout.rotate,
            shape: layout.shape,
        }));
    }, [clusterScale, viewSize, clusterDelay, isLight, radiusScale]);

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
                    shape={s.shape}
                />
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    clusterContainer: {
        position: 'absolute',
    },
});

import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    Easing,
    SharedValue,
} from 'react-native-reanimated';

interface OrbConfig {
    angle: number;
    distance: number;
    delayFrac: number;
    size: number;
}

function pseudo(seed: number, salt: number): number {
    return ((seed * salt * 9301 + 49297) % 233280) / 233280;
}

function makeOrbs(
    count: number,
    maxDistance: number,
    sizeMin: number,
    sizeMax: number,
    seedOffset: number,
): OrbConfig[] {
    return Array.from({ length: count }, (_, i) => {
        const seed = i + 1 + seedOffset;
        const baseAngle = (i / count) * Math.PI * 2;
        const angleJitter = (pseudo(seed, 47) - 0.5) * 0.5;
        const distance = maxDistance * 0.65 + pseudo(seed, 31) * maxDistance * 0.35;
        const delayFrac = pseudo(seed, 17) * 0.18;
        const size = sizeMin + pseudo(seed, 23) * (sizeMax - sizeMin);
        return { angle: baseAngle + angleJitter, distance, delayFrac, size };
    });
}

interface OrbBurstProps {
    motionKey: number;
    orbCount?: number;
    maxDistance?: number;
    sizeMin?: number;
    sizeMax?: number;
    duration?: number;
    seedOffset?: number;
}

interface OrbProps {
    progress: SharedValue<number>;
    config: OrbConfig;
}

function Orb({ progress, config }: OrbProps) {
    const animStyle = useAnimatedStyle(() => {
        const t = progress.value;
        if (t <= 0 || t >= 1) {
            return { opacity: 0, transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 0 }] };
        }

        const localT = Math.max(0, Math.min(1, (t - config.delayFrac) / (1 - config.delayFrac)));
        const bell = Math.sin(localT * Math.PI);
        const x = Math.cos(config.angle) * config.distance * bell;
        const y = Math.sin(config.angle) * config.distance * bell;

        let opacity: number;
        if (localT < 0.15) {
            opacity = localT / 0.15;
        } else if (localT > 0.85) {
            opacity = (1 - localT) / 0.15;
        } else {
            opacity = 1;
        }

        const scale = 0.5 + bell * 0.6;

        return {
            opacity: opacity * 0.95,
            transform: [{ translateX: x }, { translateY: y }, { scale }],
        };
    });

    return (
        <Animated.View
            style={[
                {
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: config.size,
                    height: config.size,
                    marginLeft: -config.size / 2,
                    marginTop: -config.size / 2,
                    borderRadius: config.size / 2,
                    backgroundColor: '#FFFFFF',
                    shadowColor: '#FFFFFF',
                    shadowOpacity: 0.9,
                    shadowRadius: 6,
                    shadowOffset: { width: 0, height: 0 },
                },
                animStyle,
            ]}
        />
    );
}

export function OrbBurst({
    motionKey,
    orbCount = 14,
    maxDistance = 45,
    sizeMin = 3,
    sizeMax = 6,
    duration = 1000,
    seedOffset = 0,
}: OrbBurstProps) {
    const progress = useSharedValue(0);
    const [orbs] = useState(() => makeOrbs(orbCount, maxDistance, sizeMin, sizeMax, seedOffset));

    useEffect(() => {
        if (motionKey === 0) return;
        progress.value = 0;
        progress.value = withTiming(1, {
            duration,
            easing: Easing.bezier(0.4, 0, 0.6, 1),
        });
    }, [motionKey, progress, duration]);

    return (
        <View style={styles.container} pointerEvents="none">
            {orbs.map((config, i) => (
                <Orb key={i} progress={progress} config={config} />
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
});

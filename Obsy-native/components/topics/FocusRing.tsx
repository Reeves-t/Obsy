import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withSequence,
    withTiming,
    Easing,
} from 'react-native-reanimated';

const RING_SIZE = 168;

interface FocusRingProps {
    active: boolean;
    children?: React.ReactNode;
}

export function FocusRing({ active, children }: FocusRingProps) {
    const pulseOpacity = useSharedValue(0.55);
    const pulseScale = useSharedValue(1);

    useEffect(() => {
        if (!active) {
            // Idle pulse
            pulseOpacity.value = withRepeat(
                withSequence(
                    withTiming(1, { duration: 2100, easing: Easing.inOut(Easing.ease) }),
                    withTiming(0.55, { duration: 2100, easing: Easing.inOut(Easing.ease) }),
                ),
                -1,
                true
            );
            pulseScale.value = withRepeat(
                withSequence(
                    withTiming(1.04, { duration: 2100, easing: Easing.inOut(Easing.ease) }),
                    withTiming(1, { duration: 2100, easing: Easing.inOut(Easing.ease) }),
                ),
                -1,
                true
            );
        } else {
            pulseOpacity.value = withTiming(1, { duration: 300 });
            pulseScale.value = withTiming(1, { duration: 300 });
        }
    }, [active]);

    const haloStyle = useAnimatedStyle(() => ({
        opacity: pulseOpacity.value,
        transform: [{ scale: pulseScale.value }],
    }));

    return (
        <View style={styles.container}>
            {/* Outer halo - pulses when idle */}
            <Animated.View style={[styles.halo, haloStyle]}>
                <LinearGradient
                    colors={[
                        'rgba(255,255,255,0.08)',
                        'rgba(255,255,255,0.02)',
                        'transparent',
                    ]}
                    locations={[0, 0.45, 0.7]}
                    start={{ x: 0.5, y: 0.5 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFillObject}
                />
            </Animated.View>

            {/* Dashed outer ring */}
            <View style={styles.outerRing}>
                <LinearGradient
                    colors={[
                        'rgba(255,255,255,0.06)',
                        'rgba(255,255,255,0.015)',
                        'transparent',
                    ]}
                    locations={[0, 0.45, 0.75]}
                    start={{ x: 0.5, y: 0.35 }}
                    end={{ x: 0.5, y: 1 }}
                    style={StyleSheet.absoluteFillObject}
                />
            </View>

            {/* Inner crisp ring */}
            <View style={styles.innerRing} />

            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: RING_SIZE,
        height: RING_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
    },
    halo: {
        position: 'absolute',
        top: -10,
        left: -10,
        right: -10,
        bottom: -10,
        borderRadius: (RING_SIZE + 20) / 2,
    },
    outerRing: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius: RING_SIZE / 2,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.22)',
        borderStyle: 'dashed',
        overflow: 'hidden',
        shadowColor: '#FFFFFF',
        shadowOpacity: 0.04,
        shadowRadius: 30,
        shadowOffset: { width: 0, height: 0 },
    },
    innerRing: {
        position: 'absolute',
        top: 6,
        left: 6,
        right: 6,
        bottom: 6,
        borderRadius: (RING_SIZE - 12) / 2,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
});

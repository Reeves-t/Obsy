import React, { useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useObsyTheme } from '@/contexts/ThemeContext';

interface PulsingCameraTriggerProps {
    onPress?: () => void;
}

const ORB_SIZE = 160;
const RING_SIZE = ORB_SIZE + 8; // metallic ring sits outside the orb
const AURA_SIZE = RING_SIZE + 16; // faint aura beyond the ring

export function PulsingCameraTrigger({ onPress }: PulsingCameraTriggerProps) {
    const router = useRouter();
    const { isLight } = useObsyTheme();

    // Shimmer sweep: translates a highlight across the ring
    const shimmerPosition = useSharedValue(-1);

    useEffect(() => {
        // Sweep takes ~1.8s, then pauses ~3.5s before repeating
        shimmerPosition.value = withRepeat(
            withSequence(
                withTiming(-1, { duration: 0 }),
                withDelay(
                    3500,
                    withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) })
                )
            ),
            -1,
            false
        );
    }, []);

    // Animated shimmer overlay style — moves a bright gradient diagonally
    const shimmerStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: shimmerPosition.value * (RING_SIZE / 2) },
            { translateY: shimmerPosition.value * (RING_SIZE / 2) },
        ],
        opacity: shimmerPosition.value > -0.8 && shimmerPosition.value < 0.8 ? 0.35 : 0,
    }));

    const handlePress = () => {
        if (onPress) {
            onPress();
        } else {
            router.push('/capture');
        }
    };

    return (
        <View style={styles.container}>
            {/* Faint outer aura */}
            <View style={styles.outerAura} />

            {/* Metallic ring */}
            <View style={styles.metallicRing}>
                {/* Metallic gradient effect via layered borders */}
                <LinearGradient
                    colors={['rgba(200,200,200,0.25)', 'rgba(120,120,120,0.15)', 'rgba(200,200,200,0.25)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.ringGradient}
                />

                {/* Shimmer sweep */}
                <Animated.View style={[styles.shimmerOverlay, shimmerStyle]}>
                    <LinearGradient
                        colors={['transparent', 'rgba(255,255,255,0.5)', 'transparent']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                    />
                </Animated.View>
            </View>

            <TouchableOpacity
                activeOpacity={0.8}
                onPress={handlePress}
                style={styles.wrapper}
            >
                {/* Unified Glass Orb */}
                <View style={[styles.orb, { backgroundColor: isLight ? '#C2AE8A' : '#0D0D0D' }]}>
                    {/* Static subtle border ring */}
                    <View style={styles.borderRing} />

                    {/* Transparent Glass Fill */}
                    <LinearGradient
                        colors={isLight
                            ? ['rgba(255,255,255,0.15)', 'rgba(0,0,0,0.08)']
                            : ['rgba(255,255,255,0.05)', 'rgba(0,0,0,0.2)']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                    />

                    {/* Glass Shine */}
                    <LinearGradient
                        colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.05)', 'transparent']}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 1 }}
                        style={styles.glassShine}
                    />

                    {/* Inner glint border */}
                    <View style={styles.innerGlint} />

                    {/* Camera Icon */}
                    <View style={styles.iconContainer}>
                        <Ionicons name="camera" size={36} color={isLight ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)'} />
                    </View>
                </View>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: AURA_SIZE,
        height: AURA_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
    },
    outerAura: {
        position: 'absolute',
        width: AURA_SIZE,
        height: AURA_SIZE,
        borderRadius: AURA_SIZE / 2,
        backgroundColor: 'rgba(180, 180, 200, 0.06)',
    },
    metallicRing: {
        position: 'absolute',
        width: RING_SIZE,
        height: RING_SIZE,
        borderRadius: RING_SIZE / 2,
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
    },
    ringGradient: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: RING_SIZE / 2,
        borderWidth: 2,
        borderColor: 'rgba(180,180,180,0.3)',
    },
    shimmerOverlay: {
        position: 'absolute',
        width: RING_SIZE,
        height: RING_SIZE,
        borderRadius: RING_SIZE / 2,
    },
    wrapper: {
        width: ORB_SIZE,
        height: ORB_SIZE,
        justifyContent: 'center',
        alignItems: 'center',
    },
    orb: {
        width: ORB_SIZE,
        height: ORB_SIZE,
        borderRadius: ORB_SIZE / 2,
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
    },
    borderRing: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: ORB_SIZE / 2,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    glassShine: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '33%',
        borderTopLeftRadius: ORB_SIZE / 2,
        borderTopRightRadius: ORB_SIZE / 2,
    },
    innerGlint: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: ORB_SIZE / 2,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
    },
    iconContainer: {
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1,
    },
});

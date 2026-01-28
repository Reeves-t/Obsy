import React, { useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    Easing,
    interpolateColor,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useObsyTheme } from '@/contexts/ThemeContext';

interface PulsingCameraTriggerProps {
    onPress?: () => void;
}

export function PulsingCameraTrigger({ onPress }: PulsingCameraTriggerProps) {
    const router = useRouter();
    const { isLight } = useObsyTheme();

    const handlePress = () => {
        if (onPress) {
            onPress();
        } else {
            router.push('/capture');
        }
    };

    // Animation value for shimmer rotation
    const shimmerProgress = useSharedValue(0);

    useEffect(() => {
        // Smooth continuous rotation - linear timing for seamless loop
        shimmerProgress.value = withRepeat(
            withTiming(1, {
                duration: 9000, // Slightly faster
                easing: Easing.linear // Linear for seamless looping
            }),
            -1,
            false
        );
    }, []);

    // Unified orb style with rotating glow
    const orbGlowStyle = useAnimatedStyle(() => {
        'worklet';
        const progress = shimmerProgress.value;

        // Apply sine-based speed variation for rollercoaster effect
        // This creates slow-at-top, fast-at-bottom without any loop discontinuity
        const phaseOffset = Math.sin(progress * 2 * Math.PI) * 0.06;
        const adjustedProgress = progress + phaseOffset;
        const rotation = adjustedProgress * 360;

        // Spatially-aware color - matches corner as glow passes
        // Using softer, more muted colors that blend better
        // 0.00 = Top Right (Blue)
        // 0.25 = Bottom Right (Purple)
        // 0.50 = Bottom Left (Green)
        // 0.75 = Top Left (Orange)
        const glowColor = interpolateColor(
            progress,
            [0, 0.25, 0.5, 0.75, 1],
            [
                'rgba(96, 165, 250, 0.7)',  // Blue - Top Right (softer)
                'rgba(167, 139, 250, 0.7)', // Purple - Bottom Right (softer)
                'rgba(52, 211, 153, 0.7)',  // Green - Bottom Left (softer)
                'rgba(251, 146, 60, 0.7)',  // Orange - Top Left (softer)
                'rgba(96, 165, 250, 0.7)',  // Blue - Loop back
            ]
        );

        return {
            transform: [{ rotate: `${rotation}deg` }],
            // Subtle thin border for the glow arc
            borderTopColor: glowColor,
            // Soft, diffused glow
            shadowColor: glowColor,
        };
    });

    return (
        <View style={styles.container}>
            <TouchableOpacity
                activeOpacity={0.8}
                onPress={handlePress}
                style={styles.wrapper}
            >
                {/* Unified Glass Orb */}
                <View style={styles.orb}>
                    {/* Rotating Glow Ring - subtle border with diffused shadow */}
                    <Animated.View style={[styles.glowRing, orbGlowStyle]} />

                    {/* Transparent Glass Fill */}
                    <LinearGradient
                        colors={['rgba(255,255,255,0.05)', 'rgba(0,0,0,0.2)']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                    />

                    {/* Glass Shine - top-to-bottom gradient (matches web glass-card::before) */}
                    <LinearGradient
                        colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.05)', 'transparent']}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 1 }}
                        style={styles.glassShine}
                    />

                    {/* Inner glint border - mimics web's border-white/10 */}
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
        alignItems: 'center',
        justifyContent: 'center',
    },
    wrapper: {
        width: 180,
        height: 180,
        justifyContent: 'center',
        alignItems: 'center',
    },
    // Unified glass orb - single container
    orb: {
        width: 160,
        height: 160,
        borderRadius: 80,
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
        // Base background for the orb
        backgroundColor: '#0D0D0D',
    },
    // Rotating glow ring with soft, blurred shadow
    glowRing: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 80,
        // Very thin, subtle border
        borderWidth: 1.5,
        borderColor: 'transparent',
        borderTopColor: 'rgba(96, 165, 250, 0.5)', // Will be animated
        // Soft, diffused glow - more blur, less opacity
        shadowOpacity: 0.35,
        shadowRadius: 30,
        shadowOffset: { width: 0, height: 0 },
        elevation: 8,
    },
    // Glass shine - covers top 1/3 with vertical gradient (matches web glass-card::before)
    glassShine: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '33%', // h-1/3 from web
        borderTopLeftRadius: 80,
        borderTopRightRadius: 80,
    },
    // Inner glint border - subtle white ring inside (matches web border-white/10)
    innerGlint: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 80,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
    },
    // Icon container centered in orb
    iconContainer: {
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1,
    },
});

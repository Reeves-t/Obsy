import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
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

    return (
        <View style={styles.container}>
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
        // backgroundColor set dynamically via inline style (theme-aware)
    },
    // Static subtle border replacing the rotating glow
    borderRing: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 80,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.08)',
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

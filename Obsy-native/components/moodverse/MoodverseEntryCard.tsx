import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { ThemedText } from '@/components/ui/ThemedText';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { ObsyIcon } from '@/components/moodverse/ObsyIcon';

const STAR_DOTS = [
    { top: 14, left: 22, size: 2, opacity: 0.22 },
    { top: 24, left: 110, size: 1.5, opacity: 0.18 },
    { top: 50, left: 74, size: 2.5, opacity: 0.14 },
    { top: 18, right: 92, size: 2, opacity: 0.18 },
    { top: 56, right: 128, size: 1.5, opacity: 0.16 },
    { top: 38, right: 42, size: 2, opacity: 0.14 },
    { top: 20, right: 148, size: 1.5, opacity: 0.18 },
    { top: 52, left: 138, size: 2, opacity: 0.14 },
] as const;

export function MoodverseEntryCard() {
    const router = useRouter();
    const { isLight } = useObsyTheme();

    const cardBg = '#000000';
    const borderColor = isLight ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.07)';
    const subtitleColor = isLight ? 'rgba(255,255,255,0.62)' : 'rgba(255,255,255,0.5)';
    const chevronColor = isLight ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.3)';

    return (
        <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.push('/moodverse')}
            style={[styles.card, { backgroundColor: cardBg, borderColor }]}
        >
            <View pointerEvents="none" style={styles.starField}>
                {STAR_DOTS.map((star, index) => (
                    <View
                        key={`star-dot-${index}`}
                        style={[
                            styles.starDot,
                            {
                                top: star.top,
                                left: star.left,
                                right: star.right,
                                width: star.size,
                                height: star.size,
                                opacity: star.opacity,
                            },
                        ]}
                    />
                ))}
            </View>

            <LinearGradient
                pointerEvents="none"
                colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.03)', 'rgba(255,255,255,0.01)']}
                locations={[0, 0.22, 1]}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={styles.glassSheen}
            />
            <LinearGradient
                pointerEvents="none"
                colors={['rgba(255,255,255,0.08)', 'transparent']}
                locations={[0, 1]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.topGlow}
            />

            <View style={styles.content}>
                <ThemedText style={styles.title}>Moodverse</ThemedText>
                <ThemedText style={[styles.subtitle, { color: subtitleColor }]}>
                    Explore your emotional universe.
                </ThemedText>
            </View>

            <View style={styles.trailingGroup}>
                <ObsyIcon size={54} />
                <ChevronRight size={18} color={chevronColor} style={styles.chevron} />
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    card: {
        borderRadius: 999,
        borderWidth: 1,
        overflow: 'hidden',
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 18,
        width: '100%',
        minHeight: 84,
    },
    starField: {
        ...StyleSheet.absoluteFillObject,
    },
    starDot: {
        position: 'absolute',
        borderRadius: 999,
        backgroundColor: '#FFFFFF',
    },
    glassSheen: {
        ...StyleSheet.absoluteFillObject,
    },
    topGlow: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '46%',
    },
    content: {
        flex: 1,
        gap: 3,
        paddingRight: 12,
        zIndex: 1,
    },
    title: {
        fontSize: 17,
        fontWeight: '700',
        color: '#fff',
    },
    subtitle: {
        fontSize: 13,
        fontWeight: '400',
        lineHeight: 18,
    },
    trailingGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        zIndex: 1,
    },
    chevron: {
        marginLeft: 2,
    },
});

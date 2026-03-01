import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Sparkles, ChevronRight } from 'lucide-react-native';
import { ThemedText } from '@/components/ui/ThemedText';
import { useObsyTheme } from '@/contexts/ThemeContext';

export function MoodverseEntryCard() {
    const router = useRouter();
    const { isLight } = useObsyTheme();

    const cardBg = isLight ? 'rgba(20, 20, 22, 0.92)' : '#000000';
    const borderColor = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)';
    const subtitleColor = isLight ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.45)';
    const chevronColor = isLight ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.25)';

    return (
        <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.push('/moodverse')}
            style={[styles.card, { backgroundColor: cardBg, borderColor }]}
        >
            {/* Cosmic gradient — purple to pink (GitNexus palette) */}
            <LinearGradient
                colors={['rgba(124, 58, 237, 0.12)', 'rgba(236, 72, 153, 0.06)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
            />

            <View style={styles.content}>
                <View style={styles.iconRow}>
                    <Sparkles size={18} color="#a855f7" strokeWidth={1.8} />
                </View>

                <ThemedText style={styles.title}>Moodverse</ThemedText>
                <ThemedText style={[styles.subtitle, { color: subtitleColor }]}>
                    Explore your emotional universe.
                </ThemedText>
            </View>

            <ChevronRight size={18} color={chevronColor} style={styles.chevron} />
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    card: {
        borderRadius: 20,
        borderWidth: 1,
        overflow: 'hidden',
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 24,
        paddingHorizontal: 20,
        width: '100%',
    },
    content: {
        flex: 1,
        gap: 4,
    },
    iconRow: {
        marginBottom: 6,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
    },
    subtitle: {
        fontSize: 14,
        fontWeight: '400',
        lineHeight: 20,
    },
    chevron: {
        marginLeft: 8,
    },
});

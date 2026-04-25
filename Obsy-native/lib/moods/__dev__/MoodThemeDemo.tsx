import React, { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from '@/components/ui/ThemedText';
import { MOODS_PRESET, getMoodTheme, generateMoodGradient, gradientMidpoint } from '@/lib/moods';

/**
 * Dev-only component for visually verifying all mood gradients.
 * Renders every preset mood as a gradient chip grouped by tone,
 * plus a live preview for custom mood gradient generation.
 *
 * Usage: Drop <MoodThemeDemo /> into any screen temporarily.
 */
export function MoodThemeDemo() {
    const [customName, setCustomName] = useState('');

    const lowMoods = MOODS_PRESET.filter(m => m.tone === 'low');
    const mediumMoods = MOODS_PRESET.filter(m => m.tone === 'medium');
    const highMoods = MOODS_PRESET.filter(m => m.tone === 'high');

    const customGradient = customName.trim()
        ? generateMoodGradient(customName)
        : null;
    const customSolid = customGradient ? gradientMidpoint(customGradient) : null;

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <ThemedText style={styles.heading}>Mood Theme Verification</ThemedText>

            <ToneSection title="Low Energy" moods={lowMoods} />
            <ToneSection title="Medium Energy" moods={mediumMoods} />
            <ToneSection title="High Energy" moods={highMoods} />

            {/* Custom mood gradient preview */}
            <View style={styles.section}>
                <ThemedText style={styles.sectionTitle}>Custom Mood Preview</ThemedText>
                <TextInput
                    style={styles.input}
                    placeholder="Type a mood name..."
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    value={customName}
                    onChangeText={setCustomName}
                />
                {customGradient && (
                    <View style={styles.previewRow}>
                        <LinearGradient
                            colors={[customGradient.from, customGradient.to]}
                            start={{ x: 0, y: 0.5 }}
                            end={{ x: 1, y: 0.5 }}
                            style={styles.previewOrb}
                        />
                        <View style={styles.previewInfo}>
                            <ThemedText style={styles.previewLabel}>{customName}</ThemedText>
                            <ThemedText style={styles.previewHex}>
                                {customGradient.from} → {customGradient.to}
                            </ThemedText>
                            <ThemedText style={styles.previewHex}>
                                solid: {customSolid}
                            </ThemedText>
                        </View>
                    </View>
                )}
            </View>
        </ScrollView>
    );
}

function ToneSection({ title, moods }: { title: string; moods: typeof MOODS_PRESET }) {
    return (
        <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>{title} ({moods.length})</ThemedText>
            <View style={styles.chipGrid}>
                {moods.map(mood => {
                    const theme = getMoodTheme(mood.id);
                    return (
                        <View key={mood.id} style={styles.chipRow}>
                            {/* Gradient orb */}
                            <LinearGradient
                                colors={[theme.gradient.primary, theme.gradient.mid, theme.gradient.secondary]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.orb}
                            />
                            {/* Solid swatch */}
                            <View style={[styles.solidSwatch, { backgroundColor: theme.solid }]} />
                            {/* Gradient chip */}
                            <LinearGradient
                                colors={[theme.gradient.primary, theme.gradient.mid, theme.gradient.secondary]}
                                start={{ x: 0, y: 0.5 }}
                                end={{ x: 1, y: 0.5 }}
                                style={styles.chip}
                            >
                                <ThemedText style={[
                                    styles.chipText,
                                    { color: theme.textOn === 'dark' ? '#000' : '#fff' },
                                ]}>
                                    {mood.label}
                                </ThemedText>
                            </LinearGradient>
                        </View>
                    );
                })}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0A0A0A',
    },
    content: {
        padding: 20,
        paddingBottom: 60,
        gap: 28,
    },
    heading: {
        fontSize: 20,
        fontWeight: '700',
        color: '#fff',
        textAlign: 'center',
    },
    section: {
        gap: 12,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    chipGrid: {
        gap: 8,
    },
    chipRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    orb: {
        width: 32,
        height: 32,
        borderRadius: 16,
    },
    solidSwatch: {
        width: 16,
        height: 16,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    chip: {
        flex: 1,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
    },
    chipText: {
        fontSize: 13,
        fontWeight: '600',
    },
    input: {
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        color: '#fff',
        fontSize: 15,
    },
    previewRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginTop: 8,
    },
    previewOrb: {
        width: 48,
        height: 48,
        borderRadius: 24,
    },
    previewInfo: {
        gap: 2,
    },
    previewLabel: {
        fontSize: 15,
        fontWeight: '600',
        color: '#fff',
    },
    previewHex: {
        fontSize: 11,
        fontFamily: 'SpaceMono',
        color: 'rgba(255,255,255,0.4)',
    },
});

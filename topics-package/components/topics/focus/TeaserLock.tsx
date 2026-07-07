import React from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Rect } from 'react-native-svg';
import { FocusCard } from './FocusCard';

interface TeaserLockProps {
    variant: 'discover' | 'evolve';
    onUnlock: () => void;
}

function LockIcon() {
    return (
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Rect x={5} y={10.5} width={14} height={9.5} rx={2.2} stroke="#fff" strokeWidth={1.6} />
            <Path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" />
        </Svg>
    );
}

const SAMPLE: Record<TeaserLockProps['variant'], { title: string; subtitle: string; cards: { label: string; lines: string[] }[] }> = {
    discover: {
        title: 'Discover learns with you',
        subtitle: 'Core patterns, themes, perspectives and connections drawn from your reflections.',
        cards: [
            { label: 'Core pattern', lines: ['The strongest signal across everything you’ve noticed here.'] },
            { label: 'Themes', lines: ['Growth   Discipline   Curiosity'] },
            { label: 'Perspectives', lines: ['What’s worth observing next in this space.'] },
        ],
    },
    evolve: {
        title: 'Evolve turns awareness into direction',
        subtitle: 'Your topic journey, key realizations, open threads, and goals shaped from your own words.',
        cards: [
            { label: 'Topic journey', lines: ['Where this began → where your attention is now.'] },
            { label: 'Key realizations', lines: ['The moments that quietly shifted something.'] },
            { label: 'Open threads', lines: ['Ideas you keep returning to but haven’t explored.'] },
        ],
    },
};

/**
 * Free-tier teaser for the Plus-only Discover / Evolve pages: representative
 * sample cards under a blur, with an upgrade CTA. No AI is called for free users.
 */
export function TeaserLock({ variant, onUnlock }: TeaserLockProps) {
    const sample = SAMPLE[variant];

    return (
        <View style={styles.root}>
            {/* Blurred sample content */}
            <View style={styles.sampleStack} pointerEvents="none">
                {sample.cards.map((c) => (
                    <FocusCard key={c.label} label={c.label}>
                        {c.lines.map((line, i) => (
                            <Text key={i} style={styles.sampleLine}>
                                {line}
                            </Text>
                        ))}
                    </FocusCard>
                ))}
            </View>

            <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
            <LinearGradient
                colors={['rgba(8,9,13,0.35)', 'rgba(8,9,13,0.78)']}
                style={StyleSheet.absoluteFill}
            />

            {/* Upgrade overlay */}
            <View style={styles.overlay} pointerEvents="box-none">
                <View style={styles.lockChip}>
                    <LockIcon />
                </View>
                <Text style={styles.title}>{sample.title}</Text>
                <Text style={styles.subtitle}>{sample.subtitle}</Text>
                <Pressable style={styles.cta} onPress={onUnlock}>
                    <LinearGradient
                        colors={['rgba(255,255,255,0.96)', 'rgba(232,234,240,0.92)']}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 1 }}
                        style={[StyleSheet.absoluteFillObject, { borderRadius: 999 }]}
                    />
                    <Text style={styles.ctaText}>Unlock with Plus</Text>
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        borderRadius: 18,
        overflow: 'hidden',
    },
    sampleStack: {
        gap: 10,
        padding: 2,
        opacity: 0.6,
    },
    sampleLine: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.55)',
        lineHeight: 19,
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 30,
    },
    lockChip: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.16)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    title: {
        fontSize: 19,
        fontWeight: '700',
        color: '#fff',
        letterSpacing: -0.3,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 13.5,
        color: 'rgba(255,255,255,0.6)',
        textAlign: 'center',
        lineHeight: 20,
        marginTop: 10,
        maxWidth: 300,
    },
    cta: {
        marginTop: 22,
        paddingVertical: 13,
        paddingHorizontal: 30,
        borderRadius: 999,
        overflow: 'hidden',
    },
    ctaText: {
        color: '#0b0c10',
        fontSize: 15,
        fontWeight: '600',
    },
});

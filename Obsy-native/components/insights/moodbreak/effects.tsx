import React, { memo, useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
    Easing,
    FadeIn,
    FadeOut,
    SharedValue,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import { ThemedText } from '@/components/ui/ThemedText';
import {
    Burst,
    BURST_DURATION_MS,
    INSIGHT_FALL_MS,
    Pop,
    POP_DURATION_MS,
} from './engine';

// ─────────────────────────────────────────────────────────────────────────────
// Charged-brick shimmer — all bricks share ONE repeating clock (owned by
// BrickField); each shimmer derives its pulse from it with a phase offset so
// there is a single UI-thread animation loop regardless of brick count.
// ─────────────────────────────────────────────────────────────────────────────

export function ChargedShimmer({ clock, phase }: { clock: SharedValue<number>; phase: number }) {
    const style = useAnimatedStyle(() => {
        const p = (clock.value + phase) % 1;
        return { opacity: 0.1 + 0.32 * (0.5 + 0.5 * Math.sin(p * Math.PI * 2)) };
    });
    return <Animated.View pointerEvents="none" style={[styles.shimmer, style]} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Floating score/effect pops — drift up from the broken brick and fade
// ─────────────────────────────────────────────────────────────────────────────

function PopView({ pop, onDone }: { pop: Pop; onDone: (id: number) => void }) {
    const progress = useSharedValue(0);

    useEffect(() => {
        progress.value = withTiming(1, { duration: POP_DURATION_MS, easing: Easing.out(Easing.quad) });
        const t = setTimeout(() => onDone(pop.id), POP_DURATION_MS + 50);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const style = useAnimatedStyle(() => ({
        transform: [
            { translateY: -26 * progress.value },
            { scale: 1 + 0.15 * progress.value },
        ],
        opacity: 1 - progress.value,
    }));

    return (
        <Animated.View pointerEvents="none" style={[styles.pop, { left: pop.x - 60, top: pop.y - 14 }, style]}>
            <ThemedText style={[styles.popText, { color: pop.color }]} numberOfLines={1}>
                {pop.text}
            </ThemedText>
        </Animated.View>
    );
}

export const PopsLayer = memo(function PopsLayer({
    pops,
    onDone,
}: {
    pops: Pop[];
    onDone: (id: number) => void;
}) {
    return (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {pops.map(p => <PopView key={p.id} pop={p} onDone={onDone} />)}
        </View>
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// Particle bursts — each burst's particles are driven by ONE progress value
// ─────────────────────────────────────────────────────────────────────────────

interface ParticleSpec {
    dx: number;
    dy: number;
    size: number;
    color: string;
}

function Particle({ progress, spec }: { progress: SharedValue<number>; spec: ParticleSpec }) {
    const style = useAnimatedStyle(() => ({
        transform: [
            { translateX: spec.dx * progress.value },
            { translateY: spec.dy * progress.value },
            { scale: 1 - 0.6 * progress.value },
        ],
        opacity: 1 - progress.value,
    }));
    return (
        <Animated.View
            style={[
                styles.particle,
                { width: spec.size, height: spec.size, borderRadius: spec.size / 2, backgroundColor: spec.color },
                style,
            ]}
        />
    );
}

function BurstView({ burst, onDone }: { burst: Burst; onDone: (id: number) => void }) {
    const progress = useSharedValue(0);

    const specs = useMemo<ParticleSpec[]>(() => {
        const count = burst.big ? 12 : 7;
        const minDist = burst.big ? 45 : 30;
        const maxDist = burst.big ? 70 : 45;
        return Array.from({ length: count }, (_, i) => {
            const angle = (i / count) * Math.PI * 2 + Math.random() * 0.6;
            const dist = minDist + Math.random() * (maxDist - minDist);
            return {
                dx: Math.cos(angle) * dist,
                dy: Math.sin(angle) * dist,
                size: 3 + Math.random() * 2,
                color: burst.colors[i % 3],
            };
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        progress.value = withTiming(1, { duration: BURST_DURATION_MS, easing: Easing.out(Easing.cubic) });
        const t = setTimeout(() => onDone(burst.id), BURST_DURATION_MS + 50);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <View pointerEvents="none" style={[styles.burstOrigin, { left: burst.x, top: burst.y }]}>
            {specs.map((s, i) => <Particle key={i} progress={progress} spec={s} />)}
        </View>
    );
}

export const BurstLayer = memo(function BurstLayer({
    bursts,
    onDone,
}: {
    bursts: Burst[];
    onDone: (id: number) => void;
}) {
    return (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {bursts.map(b => <BurstView key={b.id} burst={b} onDone={onDone} />)}
        </View>
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// Score header — lives OUTSIDE the game canvas so bricks never cover it.
// Best (persisted high score) on the left, live score + combo on the right.
// ─────────────────────────────────────────────────────────────────────────────

export const ScoreHeader = memo(function ScoreHeader({
    score,
    combo,
    comboPoints,
    best,
    isLight,
}: {
    score: number;
    combo: number;
    comboPoints: number;
    best: number;
    isLight: boolean;
}) {
    const dim = isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)';
    const bright = isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.7)';
    const comboColor = isLight ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.85)';
    // Arcade counter heats up as the combo chain grows
    const counterColor = combo >= 6 ? '#FF5540' : combo >= 2 ? '#FF9142' : bright;
    return (
        <View style={styles.scoreHeader}>
            <View style={styles.scoreGroup}>
                <ThemedText style={[styles.scoreLabel, { color: dim }]}>BEST</ThemedText>
                <ThemedText style={[styles.scoreValue, { color: bright }]}>{best}</ThemedText>
            </View>
            {comboPoints > 0 && (
                <View pointerEvents="none" style={styles.comboCounterWrap}>
                    <Animated.View key={comboPoints} entering={FadeIn.duration(80)}>
                        <ThemedText style={[styles.comboCounterText, { color: counterColor }]}>
                            +{comboPoints}
                        </ThemedText>
                    </Animated.View>
                </View>
            )}
            <View style={styles.scoreGroup}>
                {combo >= 2 && (
                    <Animated.View entering={FadeIn.duration(120)}>
                        <ThemedText style={[styles.scoreCombo, { color: comboColor }]}>×{combo}</ThemedText>
                    </Animated.View>
                )}
                <ThemedText style={[styles.scoreLabel, { color: dim }]}>SCORE</ThemedText>
                <ThemedText style={[styles.scoreValue, { color: bright }]}>{score}</ThemedText>
            </View>
        </View>
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// Falling insight — mood-clear text with no card. It fades in, holds long
// enough to read, then drops: each word falls away with its own drift, spin,
// and delay so the sentence breaks apart mid-fall.
// ─────────────────────────────────────────────────────────────────────────────

interface WordSpec {
    word: string;
    delay: number; // 0..0.3 of the fall phase
    dx: number;    // horizontal scatter (px)
    rot: number;   // degrees
}

const HOLD_END = 0.45; // portion of the timeline spent readable before the fall

function FallingWord({
    progress,
    spec,
    color,
}: {
    progress: SharedValue<number>;
    spec: WordSpec;
    color: string;
}) {
    const style = useAnimatedStyle(() => {
        const p = progress.value;
        const fadeIn = Math.min(1, p / 0.08);
        const q = p <= HOLD_END ? 0 : (p - HOLD_END) / (1 - HOLD_END);
        const qi = Math.min(1, Math.max(0, (q - spec.delay) / Math.max(0.001, 1 - spec.delay)));
        return {
            opacity: fadeIn * (1 - qi),
            transform: [
                { translateY: 150 * qi * qi }, // accelerating fall
                { translateX: spec.dx * qi },
                { rotate: `${spec.rot * qi}deg` },
            ],
        };
    });
    return (
        <Animated.View style={style}>
            <ThemedText style={[styles.fallingWord, { color }]}>{spec.word}</ThemedText>
        </Animated.View>
    );
}

export function FallingInsight({ text, isLight }: { text: string; isLight: boolean }) {
    const progress = useSharedValue(0);

    const words = useMemo<WordSpec[]>(
        () => text.split(' ').map(word => ({
            word,
            delay: Math.random() * 0.3,
            dx: (Math.random() - 0.5) * 70,
            rot: (Math.random() - 0.5) * 90,
        })),
        [text],
    );

    useEffect(() => {
        progress.value = 0;
        progress.value = withTiming(1, { duration: INSIGHT_FALL_MS, easing: Easing.linear });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [text]);

    const color = isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.75)';

    return (
        <Animated.View pointerEvents="none" exiting={FadeOut.duration(120)} style={styles.fallingWrap}>
            {words.map((spec, i) => (
                <FallingWord key={`${i}-${spec.word}`} progress={progress} spec={spec} color={color} />
            ))}
        </Animated.View>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pause overlay
// ─────────────────────────────────────────────────────────────────────────────

export function PauseOverlay({ onResume, isLight }: { onResume: () => void; isLight: boolean }) {
    return (
        <Animated.View entering={FadeIn.duration(150)} style={StyleSheet.absoluteFill}>
            <Pressable
                onPress={onResume}
                style={[styles.pauseBackdrop, {
                    backgroundColor: isLight ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.6)',
                }]}
            >
                <ThemedText style={[styles.pauseTitle, { color: isLight ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.65)' }]}>
                    Paused
                </ThemedText>
                <ThemedText style={[styles.pauseHint, { color: isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.45)' }]}>
                    Tap to resume
                </ThemedText>
            </Pressable>
        </Animated.View>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    shimmer: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#fff',
    },
    pop: {
        position: 'absolute',
        width: 120,
        alignItems: 'center',
    },
    popText: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.5,
        textShadowColor: 'rgba(0,0,0,0.25)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
    burstOrigin: {
        position: 'absolute',
        width: 0,
        height: 0,
    },
    particle: {
        position: 'absolute',
    },
    scoreHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
        paddingHorizontal: 2,
    },
    scoreGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    scoreLabel: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 1,
    },
    scoreValue: {
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: 0.5,
        fontVariant: ['tabular-nums'],
    },
    scoreCombo: {
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 0.5,
        marginRight: 2,
    },
    comboCounterWrap: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
    },
    comboCounterText: {
        fontSize: 14,
        fontWeight: '800',
        letterSpacing: 0.8,
        fontVariant: ['tabular-nums'],
    },
    fallingWrap: {
        position: 'absolute',
        top: '38%',
        left: 16,
        right: 16,
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        columnGap: 4,
    },
    fallingWord: {
        fontSize: 13,
        fontWeight: '500',
        fontStyle: 'italic',
        letterSpacing: 0.3,
        textShadowColor: 'rgba(0,0,0,0.2)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
    pauseBackdrop: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
    },
    pauseTitle: {
        fontSize: 15,
        fontWeight: '600',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    pauseHint: {
        fontSize: 12,
        marginTop: 6,
    },
});

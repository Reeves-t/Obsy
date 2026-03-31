import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions, TouchableOpacity } from 'react-native';
import Animated, {
    type SharedValue,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/ui/ThemedText';
import { getWeekRangeForUser } from '@/lib/dateUtils';
import { getMoodLabel, resolveMoodThemeById } from '@/lib/moodUtils';
import { generateOrbEffect } from '@/lib/moods';
import type { Capture } from '@/types/capture';

type Scope = 'week' | 'month';

type MoodNode = {
    moodId: string;
    label: string;
    count: number;
    primary: string;
    mid: string;
    secondary: string;
};

type Transition = { from: string; to: string; count: number };

type BallProps = {
    mood: MoodNode;
    index: number;
    x: number;
    total: number;
    angle: SharedValue<number>;
    onPullRelease: (ballIndex: number, releasedAngle: number) => void;
    labelsVisible: boolean;
    labelStyle: any;
};

const MAX_BALLS = 5;
const MIN_BALLS = 3;
const STRING_LENGTH = 84;
const BALL_SIZE = 34;
const MAX_PULL_DEG = 45;

export function MoodTransitionCradle({ captures, isLight }: { captures: Capture[]; isLight: boolean }) {
    const { width } = useWindowDimensions();
    const [scope, setScope] = useState<Scope>('week');
    const [message, setMessage] = useState<string | null>(null);
    const [labelsVisible, setLabelsVisible] = useState(true);
    const [activeTransition, setActiveTransition] = useState<Transition | null>(null);
    const cycleIndexRef = useRef(0);

    const a0 = useSharedValue(0);
    const a1 = useSharedValue(0);
    const a2 = useSharedValue(0);
    const a3 = useSharedValue(0);
    const a4 = useSharedValue(0);
    const labelOpacity = useSharedValue(1);

    const angles = [a0, a1, a2, a3, a4];

    const scopedCaptures = useMemo(() => {
        const now = new Date();
        if (scope === 'week') {
            const { start, end } = getWeekRangeForUser(now);
            return captures.filter((c) => {
                const d = new Date(c.created_at);
                return d >= start && d <= end;
            });
        }
        const month = now.getMonth();
        const year = now.getFullYear();
        return captures.filter((c) => {
            const d = new Date(c.created_at);
            return d.getMonth() === month && d.getFullYear() === year;
        });
    }, [captures, scope]);

    const moodNodes = useMemo<MoodNode[]>(() => {
        const counts = new Map<string, { count: number; label: string }>();
        scopedCaptures.forEach((c) => {
            if (!c.mood_id) return;
            const prev = counts.get(c.mood_id);
            const label = getMoodLabel(c.mood_id, c.mood_name_snapshot);
            counts.set(c.mood_id, { count: (prev?.count ?? 0) + 1, label });
        });

        return Array.from(counts.entries())
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, MAX_BALLS)
            .map(([moodId, info]) => {
                const theme = resolveMoodThemeById(moodId, info.label);
                return {
                    moodId,
                    label: info.label,
                    count: info.count,
                    primary: theme.gradient.primary,
                    mid: theme.gradient.mid,
                    secondary: theme.gradient.secondary,
                };
            });
    }, [scopedCaptures]);

    const transitions = useMemo<Transition[]>(() => {
        if (moodNodes.length === 0) return [];
        const topSet = new Set(moodNodes.map((m) => m.moodId));
        const sorted = [...scopedCaptures].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
        const counts = new Map<string, number>();

        for (let i = 0; i < sorted.length - 1; i += 1) {
            const from = sorted[i]?.mood_id;
            const to = sorted[i + 1]?.mood_id;
            if (!from || !to || !topSet.has(from) || !topSet.has(to)) continue;
            const key = `${from}__${to}`;
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }

        return Array.from(counts.entries())
            .map(([k, count]) => {
                const [from, to] = k.split('__');
                return { from, to, count };
            })
            .sort((a, b) => b.count - a.count)
            .slice(0, 3);
    }, [moodNodes, scopedCaptures]);

    const cradleWidth = Math.min(width * 0.68, 340);
    const spacing = moodNodes.length > 1 ? cradleWidth / (moodNodes.length - 1) : 0;

    const hideLabels = () => {
        setLabelsVisible(false);
        labelOpacity.value = withTiming(0, { duration: 150 });
    };
    const showLabels = () => {
        setLabelsVisible(true);
        labelOpacity.value = withTiming(1, { duration: 250 });
    };

    const performHaptic = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    };

    const runBounce = (fromIdx: number, toIdx: number, baseAngle: number, bounce = 0) => {
        if (bounce > 3 || baseAngle < 3) {
            setTimeout(() => showLabels(), 350);
            return;
        }

        const nextEnergy = baseAngle * (bounce === 0 ? 0.8 : 0.75);
        angles[fromIdx].value = withTiming(0, { duration: 380 }, (finished) => {
            if (!finished) return;
            runOnJS(performHaptic)();
            angles[toIdx].value = nextEnergy;
            angles[toIdx].value = withTiming(0, { duration: 380 }, (done) => {
                if (!done) return;
                runOnJS(performHaptic)();
                runOnJS(runBounce)(fromIdx, toIdx, -nextEnergy, bounce + 1);
            });
        });
    };

    const triggerTransition = (transition: Transition) => {
        const fromIdx = moodNodes.findIndex((m) => m.moodId === transition.from);
        const toIdx = moodNodes.findIndex((m) => m.moodId === transition.to);
        if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;

        hideLabels();
        setActiveTransition(transition);

        const count = transition.count;
        const angle = count >= 10 ? 38 : count >= 5 ? 24 : 13;
        angles[fromIdx].value = -angle;
        angles[fromIdx].value = withTiming(0, { duration: 400 }, (finished) => {
            if (!finished) return;
            runOnJS(performHaptic)();
            runOnJS(runBounce)(fromIdx, toIdx, angle, 0);
        });
    };

    useEffect(() => {
        cycleIndexRef.current = 0;
        angles.forEach((a) => {
            a.value = 0;
        });
        setMessage(null);
        setActiveTransition(null);
        showLabels();
    }, [scope]);

    useEffect(() => {
        if (moodNodes.length < MIN_BALLS || transitions.length === 0) return;
        const interval = setInterval(() => {
            const next = transitions[cycleIndexRef.current % transitions.length];
            cycleIndexRef.current += 1;
            triggerTransition(next);
        }, 6000);

        triggerTransition(transitions[0]);

        return () => clearInterval(interval);
    }, [transitions, moodNodes.length]);

    const onPullRelease = (ballIndex: number, releasedAngle: number) => {
        const source = moodNodes[ballIndex];
        if (!source) return;

        const candidate = transitions
            .filter((t) => t.from === source.moodId)
            .sort((a, b) => b.count - a.count)[0];

        if (!candidate) {
            setMessage(`No pattern yet for ${source.label}`);
            angles[ballIndex].value = withTiming(0, { duration: 450 });
            setTimeout(() => setMessage(null), 2600);
            return;
        }

        const targetIdx = moodNodes.findIndex((m) => m.moodId === candidate.to);
        if (targetIdx < 0) return;

        hideLabels();
        setActiveTransition(candidate);
        setMessage(`${source.label} → ${moodNodes[targetIdx].label} · ${candidate.count}x this ${scope}`);
        runBounce(ballIndex, targetIdx, Math.max(8, Math.abs(releasedAngle)), 0);
        setTimeout(() => setMessage(null), 3000);
    };

    const labelStyle = useAnimatedStyle(() => ({ opacity: labelOpacity.value }));

    if (scopedCaptures.length <= 1) return null;

    if (moodNodes.length < MIN_BALLS) {
        return (
            <View style={[styles.placeholder, { borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)' }]}>
                <View style={[styles.placeholderFrame, { borderColor: isLight ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.2)' }]} />
                <ThemedText style={styles.placeholderText}>Log more moods to see your patterns</ThemedText>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={[styles.scopeToggle, { backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)' }]}>
                {(['week', 'month'] as Scope[]).map((item) => (
                    <TouchableOpacity
                        key={item}
                        style={[styles.scopePill, scope === item && styles.scopePillActive]}
                        onPress={() => setScope(item)}
                    >
                        <ThemedText style={styles.scopeText}>{item === 'week' ? 'Week' : 'Month'}</ThemedText>
                    </TouchableOpacity>
                ))}
            </View>

            <View style={[styles.cradle, { width: cradleWidth }]}> 
                <View style={[styles.frameTop, { width: cradleWidth + 48 }]} />
                <View style={[styles.supportLeft, { left: -12 }]} />
                <View style={[styles.supportRight, { right: -12 }]} />

                <View style={styles.ballsRow}>
                    {moodNodes.map((mood, index) => {
                        const x = index * spacing;
                        return (
                            <CradleBall
                                key={mood.moodId}
                                mood={mood}
                                index={index}
                                x={x}
                                total={moodNodes.length}
                                angle={angles[index]}
                                onPullRelease={onPullRelease}
                                labelsVisible={labelsVisible}
                                labelStyle={labelStyle}
                            />
                        );
                    })}
                </View>
            </View>

            {!!(message || activeTransition) && (
                <ThemedText style={styles.transitionText}>
                    {message || `${moodNodes.find((n) => n.moodId === activeTransition?.from)?.label ?? ''} → ${moodNodes.find((n) => n.moodId === activeTransition?.to)?.label ?? ''} · ${activeTransition?.count ?? 0}x this ${scope}`}
                </ThemedText>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { alignItems: 'center', marginBottom: 14 },
    scopeToggle: { flexDirection: 'row', borderRadius: 14, padding: 3, marginBottom: 12 },
    scopePill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
    scopePillActive: { backgroundColor: 'rgba(255,255,255,0.16)' },
    scopeText: { fontSize: 12, opacity: 0.9 },
    cradle: { height: 170, alignItems: 'center', justifyContent: 'flex-start' },
    frameTop: { height: 2, borderRadius: 2, backgroundColor: 'rgba(207,212,220,0.82)', marginTop: 8 },
    supportLeft: { position: 'absolute', top: 8, width: 2, height: 132, backgroundColor: 'rgba(196,201,210,0.45)', transform: [{ rotate: '10deg' }] },
    supportRight: { position: 'absolute', top: 8, width: 2, height: 132, backgroundColor: 'rgba(196,201,210,0.45)', transform: [{ rotate: '-10deg' }] },
    ballsRow: { position: 'absolute', top: 10, width: '100%', height: 140 },
    ballAnchor: { position: 'absolute', top: 0, width: BALL_SIZE, alignItems: 'center' },
    pendulum: { alignItems: 'center' },
    string: { width: 1.25, height: STRING_LENGTH, backgroundColor: 'rgba(220,226,238,0.7)' },
    ball: {
        width: BALL_SIZE,
        height: BALL_SIZE,
        borderRadius: BALL_SIZE / 2,
        marginTop: -1,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.24)',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    grainOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(255,255,255,0.12)',
    },
    splash: { width: 11, height: 11, borderRadius: 9, opacity: 0.3 },
    streak: {
        position: 'absolute',
        width: 2,
        height: 20,
        backgroundColor: 'rgba(255,255,255,0.2)',
        transform: [{ rotate: '35deg' }],
    },
    labelWrap: { position: 'absolute', top: STRING_LENGTH + BALL_SIZE + 6, width: 64, left: -15, alignItems: 'center' },
    label: { fontSize: 10, opacity: 0.7 },
    transitionText: { fontSize: 12, opacity: 0.85, marginTop: 8 },
    placeholder: {
        borderWidth: 1,
        borderRadius: 16,
        paddingVertical: 18,
        paddingHorizontal: 16,
        alignItems: 'center',
        marginBottom: 12,
    },
    placeholderFrame: { width: 140, height: 44, borderTopWidth: 2, borderLeftWidth: 1, borderRightWidth: 1, borderRadius: 4, marginBottom: 8 },
    placeholderText: { fontSize: 12, opacity: 0.7 },
});

function CradleBall({ mood, index, x, total, angle, onPullRelease, labelsVisible, labelStyle }: BallProps) {
    const effect = useMemo(() => generateOrbEffect(mood.label), [mood.label]);
    const animStyle = useAnimatedStyle(() => ({
        transform: [{ rotateZ: `${angle.value}deg` }],
    }));

    const dragGesture = useMemo(
        () =>
            Gesture.Pan()
                .enabled(index === 0 || index === total - 1)
                .onUpdate((e) => {
                    const dragAngle = (e.translationX / STRING_LENGTH) * (180 / Math.PI);
                    angle.value = Math.max(-MAX_PULL_DEG, Math.min(MAX_PULL_DEG, dragAngle));
                })
                .onEnd(() => {
                    const released = angle.value;
                    runOnJS(onPullRelease)(index, released);
                }),
        [angle, index, onPullRelease, total]
    );

    return (
        <View style={[styles.ballAnchor, { left: x - BALL_SIZE / 2 }]}>
            <GestureDetector gesture={dragGesture}>
                <Animated.View style={[styles.pendulum, animStyle]}>
                    <View style={styles.string} />
                    <LinearGradient
                        colors={[mood.primary, mood.mid, mood.secondary]}
                        start={{ x: 0.25, y: 0.2 }}
                        end={{ x: 0.9, y: 1 }}
                        style={styles.ball}
                    >
                        {effect.type === 'grain' && <View style={styles.grainOverlay} />}
                        {effect.type === 'splash' && (
                            <View style={[styles.splash, { backgroundColor: effect.splashColor ?? 'rgba(255,255,255,0.25)' }]} />
                        )}
                        {effect.type === 'streak' && <View style={styles.streak} />}
                    </LinearGradient>
                </Animated.View>
            </GestureDetector>
            {labelsVisible && (
                <Animated.View style={[styles.labelWrap, labelStyle]}>
                    <ThemedText style={styles.label} numberOfLines={1}>{mood.label}</ThemedText>
                </Animated.View>
            )}
        </View>
    );
}

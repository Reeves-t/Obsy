import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, Text, Pressable, ActivityIndicator } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    Easing,
    runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import type { Topic } from '@/lib/topicStore';
import { useTopicStore } from '@/lib/topicStore';
import type { TopicPulseCard, TopicPulseCardType } from '@/lib/topicAiTypes';
import { AiToneId, getToneDefinition, isPresetTone } from '@/lib/aiTone';
import { useCustomTones } from '@/hooks/useCustomTones';
import { getLensDef, inferTopicLens, defaultDepthForLens, DEPTH_LABELS } from '@/lib/topicLens';
import { useSubscription } from '@/hooks/useSubscription';
import { VanguardPaywall } from '@/components/paywall/VanguardPaywall';
import {
    generateTopicPulse,
    type TopicPulseAction,
    type TopicPulseMeta,
    type TopicPulseUsage,
} from '@/services/topicPulseClient';

// Calm fallback shown when generation fails (per spec).
const FALLBACK_CARD: TopicPulseCard = {
    type: 'topic_pulse',
    title: 'Topic Pulse',
    body: 'This topic space is warming up. Try refreshing again in a moment.',
};

const FREE_LIMIT_TEXT = 'Daily refreshes used. Plus gets 10 daily Topic Pulse refreshes.';

const ROTATE_MS = 4000;

// Subtle accent dot per card type — the "optional small indicator".
const TYPE_ACCENT: Record<TopicPulseCardType, string> = {
    topic_pulse: '#8b6fce',
    quick_tip: '#6fca7d',
    question_drift: '#5aa6e8',
    tiny_challenge: '#e8935a',
    useful_angle: '#6fc9c2',
    common_trap: '#e07a8b',
    small_next_step: '#c2a86f',
};

const ACTION_BUTTONS: { action: TopicPulseAction; label: string }[] = [
    { action: 'give_me_ideas', label: 'Give me ideas' },
    { action: 'ask_question', label: 'Ask a question' },
    { action: 'teach_me_something', label: 'Teach me something' },
    { action: 'make_mini_plan', label: 'Make a mini plan' },
];

type Mode = 'feed' | 'focused';

export function TopicPulse({ topic }: { topic: Topic }) {
    const setTopicPulse = useTopicStore(s => s.setTopicPulse);
    const getTopicPulse = useTopicStore(s => s.getTopicPulse);
    const addTopicNote = useTopicStore(s => s.addTopicNote);
    const { tones: customTones } = useCustomTones();
    const { tier, counts, checkLimit, getLimits } = useSubscription();

    // ── Resolve the SAFE metadata (labels only) the same way MetaPanel does ──
    const meta: TopicPulseMeta = useMemo(() => {
        const toneId = (topic.toneId ?? 'neutral') as AiToneId;
        const toneLabel = isPresetTone(toneId)
            ? getToneDefinition(toneId).label
            : (customTones.find(t => t.id === toneId)?.name ?? 'Custom');
        const lensId = topic.lens ?? inferTopicLens(topic.title, topic.description);
        const depth = topic.depth ?? defaultDepthForLens(lensId);
        return {
            topicTitle: topic.title,
            topicDescription: topic.description ?? '',
            topicLens: getLensDef(lensId).label,
            tone: toneLabel,
            responseEnergy: DEPTH_LABELS[depth],
        };
    }, [topic.id, topic.title, topic.description, topic.toneId, topic.lens, topic.depth, customTones]);

    // ── State ────────────────────────────────────────────────────────────────
    const [cards, setCards] = useState<TopicPulseCard[]>([]);
    const [mode, setMode] = useState<Mode>('feed');
    const [focusedCard, setFocusedCard] = useState<TopicPulseCard | null>(null);
    const [savedFocused, setSavedFocused] = useState(false);
    const [activeIdx, setActiveIdx] = useState(0);
    const [loading, setLoading] = useState(false);
    const [errored, setErrored] = useState(false);
    const [liveUsage, setLiveUsage] = useState<TopicPulseUsage | null>(null);
    const [showPaywall, setShowPaywall] = useState(false);

    const didInit = useRef(false);
    const opacity = useSharedValue(1);
    const cardStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

    // ── Usage / gating ─────────────────────────────────────────────────────────
    const limit = getLimits().topic_pulse;
    const used = liveUsage?.used ?? counts.topic_pulse;
    const remaining = liveUsage?.remaining ?? Math.max(0, limit - used);
    const canGenerate = checkLimit('topic_pulse') && !loading;

    const usageText = useMemo(() => {
        if (remaining <= 0) {
            return tier === 'free' ? FREE_LIMIT_TEXT : 'Refresh available tomorrow';
        }
        return remaining === 1 ? '1 refresh left today' : `${remaining} refreshes left today`;
    }, [remaining, tier]);

    // ── Generation ──────────────────────────────────────────────────────────────
    const runGeneration = useCallback(
        async (action: TopicPulseAction) => {
            if (loading) return;
            // Feed actions (initial auto-load + manual refresh) render the 7-card
            // rotating feed; everything else returns one focused card.
            const isFeed = action === 'refresh_pulse' || action === 'initial_pulse';
            setLoading(true);
            setErrored(false);
            const res = await generateTopicPulse(meta, action);
            setLoading(false);

            if (res.usage) setLiveUsage(res.usage);

            if (!res.ok || !res.cards || res.cards.length === 0) {
                setErrored(true);
                if (isFeed) {
                    // Keep any existing feed; if none, show the calm fallback card.
                    setMode('feed');
                    setCards(prev => (prev.length ? prev : [FALLBACK_CARD]));
                    setActiveIdx(0);
                } else {
                    setMode('focused');
                    setFocusedCard(FALLBACK_CARD);
                    setSavedFocused(false);
                }
                return;
            }

            if (isFeed) {
                setCards(res.cards);
                setTopicPulse(topic.id, res.cards);
                setActiveIdx(0);
                setMode('feed');
                opacity.value = withTiming(1, { duration: 300 });
            } else {
                setFocusedCard(res.cards[0]);
                setSavedFocused(false);
                setMode('focused');
            }
        },
        [loading, meta, setTopicPulse, topic.id, opacity],
    );

    const handleRefresh = useCallback(async () => {
        if (!canGenerate) {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            if (tier === 'free') setShowPaywall(true);
            return;
        }
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        await runGeneration('refresh_pulse');
    }, [canGenerate, runGeneration, tier]);

    const handleAction = useCallback(
        async (action: TopicPulseAction) => {
            if (!canGenerate) {
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                if (tier === 'free') setShowPaywall(true);
                return;
            }
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            await runGeneration(action);
        },
        [canGenerate, runGeneration, tier],
    );

    const handleSaveFocused = useCallback(() => {
        if (!focusedCard || savedFocused) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        addTopicNote(topic.id, `${focusedCard.title}: ${focusedCard.body}`, 'pulse');
        setSavedFocused(true);
    }, [focusedCard, savedFocused, addTopicNote, topic.id]);

    const handleBackToFeed = useCallback(() => {
        setMode('feed');
        setFocusedCard(null);
        setActiveIdx(0);
        opacity.value = withTiming(1, { duration: 250 });
    }, [opacity]);

    // ── Initial load: use today's cache, else auto-generate the FREE initial
    // feed once (uncounted, not gated by the refresh limit). ──
    useEffect(() => {
        if (didInit.current) return;
        didInit.current = true;
        const cached = getTopicPulse(topic.id);
        if (cached && cached.cards.length > 0) {
            setCards(cached.cards);
            return;
        }
        runGeneration('initial_pulse');
    }, [topic.id, getTopicPulse, runGeneration]);

    // ── Auto-rotation (feed mode, multiple cards) ──────────────────────────────
    // Fade the old card fully out, swap, then fade the new one in. The card sits
    // fully visible for ROTATE_MS between transitions.
    const FADE_OUT_MS = 380;
    const FADE_IN_MS = 480;

    useEffect(() => {
        if (mode !== 'feed' || cards.length <= 1) return;
        const id = setInterval(() => {
            opacity.value = withTiming(0, { duration: FADE_OUT_MS, easing: Easing.inOut(Easing.ease) }, (finished) => {
                if (finished) {
                    runOnJS(setActiveIdx)((activeIdx + 1) % cards.length);
                    opacity.value = withTiming(1, { duration: FADE_IN_MS, easing: Easing.inOut(Easing.ease) });
                }
            });
        }, ROTATE_MS);
        return () => clearInterval(id);
    }, [mode, cards.length, activeIdx, opacity]);

    // Manual advance (tap the card) — same calm cross-fade.
    const advanceManually = useCallback(() => {
        if (mode !== 'feed' || cards.length <= 1) return;
        opacity.value = withTiming(0, { duration: FADE_OUT_MS, easing: Easing.inOut(Easing.ease) }, (finished) => {
            if (finished) {
                runOnJS(setActiveIdx)((activeIdx + 1) % cards.length);
                opacity.value = withTiming(1, { duration: FADE_IN_MS, easing: Easing.inOut(Easing.ease) });
            }
        });
    }, [mode, cards.length, activeIdx, opacity]);

    // ── Current card to display ────────────────────────────────────────────────
    const displayCard: TopicPulseCard | null =
        mode === 'focused'
            ? focusedCard
            : cards.length > 0
                ? cards[Math.min(activeIdx, cards.length - 1)]
                : null;

    const outOfRefreshes = remaining <= 0;

    return (
        <View style={styles.section}>
            <View style={styles.headerRow}>
                <Text style={styles.sectionLabel}>Explore this topic</Text>
                {!!displayCard && cards.length > 1 && mode === 'feed' && (
                    <Text style={styles.counter}>
                        {Math.min(activeIdx + 1, cards.length)}/{cards.length}
                    </Text>
                )}
            </View>
            <Text style={styles.subtitle}>General guidance only · no private entries used</Text>

            {/* ── Topic Pulse card area ── */}
            <Pressable
                onPress={mode === 'feed' ? advanceManually : undefined}
                style={styles.card}
            >
                {loading && !displayCard ? (
                    <View style={styles.cardLoading}>
                        <ActivityIndicator color="rgba(255,255,255,0.6)" />
                    </View>
                ) : displayCard ? (
                    <Animated.View style={[styles.cardInner, mode === 'feed' && cardStyle]}>
                        <View style={styles.cardLabelRow}>
                            <View style={[styles.cardDot, { backgroundColor: TYPE_ACCENT[displayCard.type] }]} />
                            <Text style={styles.cardLabel}>{displayCard.title}</Text>
                            {loading && <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" style={{ marginLeft: 'auto' }} />}
                        </View>
                        <Text style={styles.cardBody}>{displayCard.body}</Text>
                    </Animated.View>
                ) : (
                    <View style={styles.cardInner}>
                        <View style={styles.cardLabelRow}>
                            <View style={[styles.cardDot, { backgroundColor: TYPE_ACCENT.topic_pulse }]} />
                            <Text style={styles.cardLabel}>Topic Pulse</Text>
                        </View>
                        <Text style={styles.cardBody}>
                            {outOfRefreshes
                                ? 'No refreshes left today. Your topic pulse returns tomorrow.'
                                : 'Tap refresh to wake up this topic space.'}
                        </Text>
                    </View>
                )}
            </Pressable>

            {/* ── Focused-card controls (save / back) ── */}
            {mode === 'focused' && focusedCard && (
                <View style={styles.focusedRow}>
                    <Pressable style={styles.backBtn} onPress={handleBackToFeed} hitSlop={6}>
                        <Text style={styles.backBtnText}>‹ Back to pulse</Text>
                    </Pressable>
                    <Pressable
                        style={[styles.saveBtn, savedFocused && styles.saveBtnDone]}
                        onPress={handleSaveFocused}
                        disabled={savedFocused}
                    >
                        <Text style={[styles.saveBtnText, savedFocused && styles.saveBtnTextDone]}>
                            {savedFocused ? '✓ Saved' : '+ Save'}
                        </Text>
                    </Pressable>
                </View>
            )}

            {/* ── Action buttons ── */}
            <View style={styles.actionsWrap}>
                {ACTION_BUTTONS.map(({ action, label }) => (
                    <Pressable
                        key={action}
                        style={[styles.actionBtn, !canGenerate && styles.actionBtnDisabled]}
                        onPress={() => handleAction(action)}
                    >
                        <Text style={[styles.actionBtnText, !canGenerate && styles.actionBtnTextDisabled]}>
                            {label}
                        </Text>
                    </Pressable>
                ))}
            </View>

            {/* ── Usage + Refresh ── */}
            <View style={styles.footerRow}>
                <Text style={styles.usageText}>{usageText}</Text>
                <Pressable
                    style={[styles.refreshBtn, !canGenerate && styles.refreshBtnDisabled]}
                    onPress={handleRefresh}
                >
                    {loading ? (
                        <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" />
                    ) : (
                        <Text style={[styles.refreshBtnText, !canGenerate && styles.refreshBtnTextDisabled]}>
                            Refresh Pulse
                        </Text>
                    )}
                </Pressable>
            </View>

            <VanguardPaywall
                visible={showPaywall}
                onClose={() => setShowPaywall(false)}
                featureName="topic_pulse"
            />
        </View>
    );
}

const styles = StyleSheet.create({
    section: {
        // Transparent: reveals the single page-0 aurora rendered by TopicFocusPager,
        // shared with every other Observe-page card.
        padding: 12,
        paddingHorizontal: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        gap: 10,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    sectionLabel: {
        fontSize: 10,
        fontWeight: '600',
        letterSpacing: 1.0,
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.38)',
    },
    counter: {
        fontSize: 10,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.30)',
        letterSpacing: 0.4,
    },
    subtitle: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.35)',
        marginTop: -4,
        letterSpacing: 0.1,
    },

    // ── Card (the pulse box — transparent so the section's aurora shows through) ──
    card: {
        borderRadius: 12,
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        padding: 13,
        paddingHorizontal: 14,
        minHeight: 96,
        justifyContent: 'center',
        shadowColor: '#8b6fce',
        shadowOpacity: 0.08,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 6 },
    },
    cardLoading: {
        minHeight: 70,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardInner: {
        gap: 8,
    },
    cardLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
    },
    cardDot: {
        width: 7,
        height: 7,
        borderRadius: 4,
    },
    cardLabel: {
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.55)',
    },
    cardBody: {
        fontSize: 14,
        lineHeight: 20,
        color: 'rgba(255,255,255,0.85)',
        fontWeight: '400',
    },

    // ── Focused controls ──
    focusedRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    backBtn: {
        paddingVertical: 4,
        paddingRight: 8,
    },
    backBtnText: {
        fontSize: 12.5,
        color: 'rgba(255,255,255,0.5)',
        fontWeight: '500',
    },
    saveBtn: {
        paddingVertical: 6,
        paddingHorizontal: 14,
        borderRadius: 999,
        backgroundColor: 'rgba(139,111,206,0.18)',
        borderWidth: 1,
        borderColor: 'rgba(139,111,206,0.4)',
    },
    saveBtnDone: {
        backgroundColor: 'rgba(111,202,125,0.14)',
        borderColor: 'rgba(111,202,125,0.4)',
    },
    saveBtnText: {
        fontSize: 12.5,
        fontWeight: '600',
        color: 'rgba(220,210,255,0.95)',
        letterSpacing: 0.2,
    },
    saveBtnTextDone: {
        color: 'rgba(200,240,210,0.95)',
    },

    // ── Action buttons ──
    actionsWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    actionBtn: {
        flexGrow: 1,
        flexBasis: '47%',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 10,
        borderRadius: 12,
        backgroundColor: 'transparent', // shows the section's aurora through
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    actionBtnDisabled: {
        opacity: 0.4,
    },
    actionBtnText: {
        fontSize: 13,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.82)',
        letterSpacing: -0.1,
    },
    actionBtnTextDisabled: {
        color: 'rgba(255,255,255,0.5)',
    },

    // ── Footer (usage + refresh) ──
    footerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        marginTop: 2,
    },
    usageText: {
        flex: 1,
        fontSize: 11.5,
        color: 'rgba(255,255,255,0.42)',
        fontWeight: '500',
        letterSpacing: 0.1,
    },
    refreshBtn: {
        paddingVertical: 9,
        paddingHorizontal: 16,
        borderRadius: 12,
        backgroundColor: 'transparent', // shows the section's aurora through
        borderWidth: 1,
        borderColor: 'rgba(139,111,206,0.34)',
        minWidth: 110,
        alignItems: 'center',
    },
    refreshBtnDisabled: {
        borderColor: 'rgba(255,255,255,0.08)',
    },
    refreshBtnText: {
        fontSize: 13,
        fontWeight: '600',
        color: 'rgba(224,214,255,0.95)',
        letterSpacing: 0.2,
    },
    refreshBtnTextDisabled: {
        color: 'rgba(255,255,255,0.4)',
    },
});

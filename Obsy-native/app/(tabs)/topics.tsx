import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, View, Text, Pressable, Dimensions, LayoutChangeEvent } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withSpring,
} from 'react-native-reanimated';

import { DEFAULT_TAB_BAR_HEIGHT, ScreenWrapper } from '@/components/ScreenWrapper';
import { TopicOrb } from '@/components/topics/TopicOrb';
import { FocusRing } from '@/components/topics/FocusRing';
import { MetaPanel } from '@/components/topics/MetaPanel';
import { CreateTopicModal } from '@/components/topics/CreateTopicModal';
import {
    useGardenPhysics,
    GARDEN_LAYOUT,
    FOCUS_RING,
} from '@/components/topics/useGardenPhysics';
import { useTopicStore } from '@/lib/topicStore';

const SCREEN_W = Dimensions.get('window').width;

// ── Velocity tracker for flick detection ──────────────────────

interface VelocitySample {
    t: number;
    x: number;
    y: number;
}

export default function TopicsScreen() {
    const { topics, addTopic, getStats } = useTopicStore();
    const [focusedId, setFocusedId] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [showHint, setShowHint] = useState(true);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [, setTick] = useState(0);
    const [screenHeight, setScreenHeight] = useState(0);

    // Derived layout: garden top in screen coords + focus ring center
    const gardenTop = screenHeight - GARDEN_LAYOUT.bottom - GARDEN_LAYOUT.height;
    const focusCenter = { x: SCREEN_W / 2, y: FOCUS_RING.topOffset + FOCUS_RING.size / 2 };

    // Physics
    const { stateRef, setForceRender, markReleased } = useGardenPhysics(
        topics.map(t => t.id),
        focusedId,
        draggingId,
    );

    // Wire physics re-render
    useEffect(() => {
        setForceRender(() => setTick(n => (n + 1) % 1000000));
    }, [setForceRender]);

    // Hint auto-dismiss
    useEffect(() => {
        if (topics.length > 0) {
            const t = setTimeout(() => setShowHint(false), 5000);
            return () => clearTimeout(t);
        }
    }, [topics.length]);

    // Snap-in animation for focused orb
    const snapScale = useSharedValue(1);
    const snapOpacity = useSharedValue(1);

    useEffect(() => {
        if (focusedId) {
            snapScale.value = 0.4;
            snapOpacity.value = 0;
            snapScale.value = withSpring(1, { damping: 14, stiffness: 120 });
            snapOpacity.value = withTiming(1, { duration: 400 });
        }
    }, [focusedId]);

    const snapStyle = useAnimatedStyle(() => ({
        transform: [{ scale: snapScale.value }],
        opacity: snapOpacity.value,
    }));

    // Focused topic data
    const focusedTopic = topics.find(t => t.id === focusedId) ?? null;
    const focusedStats = focusedTopic ? getStats(focusedTopic.id) : null;

    // ── Drag state refs ───────────────────────────────────────

    const dragInfo = useRef<{
        id: string;
        startAbsX: number;
        startAbsY: number;
        moved: boolean;
    } | null>(null);

    const velocityTracker = useRef<VelocitySample[]>([]);

    // ── Handle save ───────────────────────────────────────────

    const handleSaveTopic = useCallback((title: string, description: string) => {
        addTopic(title, description);
        setCreating(false);
    }, [addTopic]);

    // ── Render helpers ────────────────────────────────────────

    const renderEmptyState = () => (
        <View style={styles.emptyContainer}>
            {/* Faint placeholder orbs */}
            <View style={styles.emptyOrbCluster}>
                <View style={{ position: 'absolute', left: 12, top: 60 }}>
                    <TopicOrb size={68} title="" />
                </View>
                <View style={{ position: 'absolute', left: 70, top: 16 }}>
                    <TopicOrb size={56} title="" />
                </View>
                <View style={{ position: 'absolute', left: 96, top: 84 }}>
                    <TopicOrb size={48} title="" />
                </View>
            </View>
            <Text style={styles.emptyTitle}>Plant your first topic</Text>
            <Text style={styles.emptySubtitle}>
                Topics live as orbs in your garden. Flick one into the focus ring to reflect on it.
            </Text>
            <Pressable style={styles.emptyCta} onPress={() => setCreating(true)}>
                <Text style={styles.emptyCtaText}>Create a topic</Text>
            </Pressable>
        </View>
    );

    const renderOrbs = () => {
        if (screenHeight === 0) return null;
        return topics.map(t => {
            const p = stateRef.current.get(t.id);
            if (!p) return null;

            return (
                <Pressable
                    key={t.id}
                    onPressIn={(e) => {
                        if (focusedId) return;
                        dragInfo.current = {
                            id: t.id,
                            startAbsX: e.nativeEvent.pageX,
                            startAbsY: e.nativeEvent.pageY,
                            moved: false,
                        };
                        setDraggingId(t.id);
                        velocityTracker.current = [{
                            t: Date.now(),
                            x: p.x,
                            y: p.y,
                        }];
                    }}
                    onPressOut={() => {
                        const d = dragInfo.current;
                        if (!d || d.id !== t.id) return;
                        const pp = stateRef.current.get(d.id);
                        dragInfo.current = null;
                        setDraggingId(null);
                        if (!pp) return;

                        // Pause drift for this orb so momentum isn't fought
                        markReleased(d.id);

                        // Compute velocity from recent samples
                        const samples = velocityTracker.current;
                        let vx = 0, vy = 0;
                        if (samples.length >= 2) {
                            const first = samples[0];
                            const last = samples[samples.length - 1];
                            const dt = Math.max(1, last.t - first.t);
                            vx = ((last.x - first.x) / dt) * 16;
                            vy = ((last.y - first.y) / dt) * 16;
                        }

                        // Check if orb overlaps the focus ring
                        const orbScreenY = gardenTop + pp.y;
                        const dx = pp.x - focusCenter.x;
                        const dy = orbScreenY - focusCenter.y;
                        const dist = Math.hypot(dx, dy);
                        if (dist < FOCUS_RING.size / 2) {
                            setFocusedId(d.id);
                            return;
                        }

                        // Tap with no drag: give a small nudge
                        if (!d.moved) {
                            pp.vx += (Math.random() - 0.5) * 3;
                            pp.vy += (Math.random() - 0.5) * 3;
                            return;
                        }

                        // Hand momentum back for flick feel
                        pp.vx = Math.max(-5, Math.min(5, vx * 0.8));
                        pp.vy = Math.max(-5, Math.min(5, vy * 0.8));
                    }}
                    onTouchMove={(e) => {
                        const d = dragInfo.current;
                        if (!d || d.id !== t.id) return;
                        const pp = stateRef.current.get(d.id);
                        if (!pp) return;

                        const dx = e.nativeEvent.pageX - d.startAbsX;
                        const dy = e.nativeEvent.pageY - d.startAbsY;

                        if (Math.abs(dx) + Math.abs(dy) > 6) d.moved = true;

                        pp.x += dx;
                        pp.y += dy;
                        pp.vx = 0;
                        pp.vy = 0;
                        d.startAbsX = e.nativeEvent.pageX;
                        d.startAbsY = e.nativeEvent.pageY;

                        const now = Date.now();
                        velocityTracker.current.push({ t: now, x: pp.x, y: pp.y });
                        velocityTracker.current = velocityTracker.current.filter(
                            s => now - s.t < 120
                        );
                    }}
                    style={{
                        position: 'absolute',
                        left: p.x - p.size / 2,
                        top: gardenTop + p.y - p.size / 2,
                        width: p.size,
                        height: p.size,
                        zIndex: draggingId === t.id ? 10 : 2,
                    }}
                >
                    <TopicOrb size={p.size} title={t.title} />
                </Pressable>
            );
        });
    };

    // ── Main render ───────────────────────────────────────────

    return (
        <ScreenWrapper screenName="topics" bottomInset={DEFAULT_TAB_BAR_HEIGHT}>
            <View style={styles.screen} onLayout={(e: LayoutChangeEvent) => setScreenHeight(e.nativeEvent.layout.height)}>
                {/* Top bar */}
                <View style={styles.topBar}>
                    <Text style={styles.screenTitle}>Topics</Text>
                    <Pressable
                        style={styles.plusBtn}
                        onPress={() => setCreating(true)}
                        accessibilityLabel="New topic"
                    >
                        <Text style={styles.plusGlyph}>+</Text>
                    </Pressable>
                </View>

                {/* Empty state */}
                {topics.length === 0 && !creating && renderEmptyState()}

                {/* Focus ring (when topics exist) */}
                {topics.length > 0 && (
                    <View style={styles.focusRingWrap}>
                        <FocusRing active={!!focusedTopic}>
                            {focusedTopic ? (
                                <Animated.View style={[styles.focusedOrbWrap, snapStyle]}>
                                    <TopicOrb size={140} title={focusedTopic.title} selected />
                                </Animated.View>
                            ) : (
                                <Text style={styles.focusLabel}>FOCUS</Text>
                            )}
                        </FocusRing>
                    </View>
                )}

                {/* Hint text */}
                {topics.length > 0 && !focusedTopic && showHint && (
                    <Text style={[styles.hintText, {
                        bottom: GARDEN_LAYOUT.bottom + GARDEN_LAYOUT.height + 12,
                    }]}>
                        drag an orb into the ring
                    </Text>
                )}

                {/* Orbs (rendered at screen level for free dragging) */}
                {topics.length > 0 && !focusedTopic && renderOrbs()}

                {/* Meta panel (when focused) */}
                {focusedTopic && focusedStats && (
                    <MetaPanel
                        topic={focusedTopic}
                        stats={focusedStats}
                        onClose={() => setFocusedId(null)}
                    />
                )}

                {/* Create modal */}
                {creating && (
                    <CreateTopicModal
                        onCancel={() => setCreating(false)}
                        onSave={handleSaveTopic}
                    />
                )}
            </View>
        </ScreenWrapper>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },
    // Top bar
    topBar: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 22,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 5,
    },
    screenTitle: {
        fontSize: 30,
        fontWeight: '700',
        letterSpacing: -0.6,
        color: '#fff',
    },
    plusBtn: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    plusGlyph: {
        color: '#fff',
        fontSize: 22,
        fontWeight: '300',
        marginTop: -1,
    },
    // Empty state
    emptyContainer: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 36,
        zIndex: 2,
    },
    emptyOrbCluster: {
        width: 160,
        height: 160,
        marginBottom: 26,
        opacity: 0.55,
    },
    emptyTitle: {
        fontSize: 22,
        fontWeight: '600',
        color: '#fff',
        letterSpacing: -0.3,
        textAlign: 'center',
    },
    emptySubtitle: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.55)',
        marginTop: 8,
        lineHeight: 21,
        maxWidth: 280,
        textAlign: 'center',
    },
    emptyCta: {
        marginTop: 24,
        paddingVertical: 14,
        paddingHorizontal: 28,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.92)',
        shadowColor: '#FFFFFF',
        shadowOpacity: 0.12,
        shadowRadius: 28,
        shadowOffset: { width: 0, height: 10 },
    },
    emptyCtaText: {
        color: '#0b0c10',
        fontSize: 15,
        fontWeight: '600',
    },
    // Focus ring
    focusRingWrap: {
        position: 'absolute',
        top: FOCUS_RING.topOffset,
        left: (SCREEN_W - FOCUS_RING.size) / 2,
        zIndex: 3,
    },
    focusedOrbWrap: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    focusLabel: {
        fontSize: 11,
        fontWeight: '500',
        letterSpacing: 1.4,
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.32)',
    },
    // Hint
    hintText: {
        position: 'absolute',
        left: 0,
        right: 0,
        textAlign: 'center',
        zIndex: 4,
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 0.4,
    },
});

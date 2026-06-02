import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, Text, Pressable, PanResponder, PanResponderInstance, LayoutChangeEvent, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { HabitGoalOrb } from './HabitGoalOrb';
import { HabitGoalCreateModal } from './HabitGoalCreateModal';
import { HabitGoalConfirmModal } from './HabitGoalConfirmModal';
import { HabitGoalDetailsList } from './HabitGoalDetailsList';
import { useHabitOrbPhysics } from './useHabitOrbPhysics';
import { useHabitGoalStore, HabitGoalFrequency } from '@/lib/habitGoalStore';

interface HabitGoalOrbSectionProps {
    frequency: HabitGoalFrequency;
    active?: boolean; // parent can force-pause physics (defaults true)
}

const BOX_HEIGHT = 210;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export function HabitGoalOrbSection({ frequency, active = true }: HabitGoalOrbSectionProps) {
    const { isLight } = useObsyTheme();
    const isFocused = useIsFocused();

    const items = useHabitGoalStore((s) => s.items);
    const addHabitGoal = useHabitGoalStore((s) => s.addHabitGoal);
    const removeHabitGoal = useHabitGoalStore((s) => s.removeHabitGoal);
    const toggleCompletion = useHabitGoalStore((s) => s.toggleCompletion);
    const reconcilePeriods = useHabitGoalStore((s) => s.reconcilePeriods);

    const myItems = useMemo(() => items.filter((i) => i.frequency === frequency), [items, frequency]);
    const ids = useMemo(() => myItems.map((i) => i.id), [myItems]);

    const [box, setBox] = useState({ width: 0, height: BOX_HEIGHT });
    const [creating, setCreating] = useState(false);
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [showDetails, setShowDetails] = useState(false);

    const toggleDetails = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setShowDetails((v) => !v);
    };

    // Reset stale completion state when the screen regains focus (handles day/week rollover).
    useEffect(() => {
        if (isFocused) reconcilePeriods();
    }, [isFocused, reconcilePeriods]);

    // Physics only runs while: mounted + screen focused + parent active + has orbs.
    const physicsActive = active && isFocused && myItems.length > 0;
    const { stateRef, draggingIdRef, markReleased } = useHabitOrbPhysics(ids, {
        width: box.width,
        height: box.height,
        active: physicsActive,
    });

    // ── Stable per-orb drag handling (PanResponder so the page ScrollView
    //    doesn't steal vertical drags). Created once per id and cached. ──
    const boxRef = useRef(box);
    boxRef.current = box;
    const dragRef = useRef<{ id: string; startX: number; startY: number; moved: boolean } | null>(null);
    const pansRef = useRef(new Map<string, PanResponderInstance>());

    const getPan = (id: string): PanResponderInstance => {
        const cached = pansRef.current.get(id);
        if (cached) return cached;
        const pan = PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onStartShouldSetPanResponderCapture: () => true,
            onMoveShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponderCapture: () => true,
            onPanResponderTerminationRequest: () => false,
            onPanResponderGrant: () => {
                const p = stateRef.current.get(id);
                if (!p) return;
                p.vx = 0;
                p.vy = 0;
                draggingIdRef.current = id;
                setDraggingId(id);
                markReleased(id);
                dragRef.current = { id, startX: p.x, startY: p.y, moved: false };
            },
            onPanResponderMove: (_e, g) => {
                const d = dragRef.current;
                const p = stateRef.current.get(id);
                if (!d || d.id !== id || !p) return;
                if (Math.abs(g.dx) + Math.abs(g.dy) > 6) d.moved = true;
                const { width, height } = boxRef.current;
                const r = p.size / 2;
                p.x = Math.max(r, Math.min(width - r, d.startX + g.dx));
                p.y = Math.max(r, Math.min(height - r, d.startY + g.dy));
                p.vx = 0;
                p.vy = 0;
            },
            onPanResponderRelease: (_e, g) => {
                const d = dragRef.current;
                dragRef.current = null;
                draggingIdRef.current = null;
                setDraggingId(null);
                const p = stateRef.current.get(id);
                if (!d || !p) return;
                markReleased(id);
                if (!d.moved) {
                    // Tap (no drag) → open the confirm sheet, never auto-complete.
                    setConfirmId(id);
                    return;
                }
                // Flick: hand back momentum (gesture velocity is px/ms).
                p.vx = Math.max(-5, Math.min(5, g.vx * 12));
                p.vy = Math.max(-5, Math.min(5, g.vy * 12));
            },
            onPanResponderTerminate: () => {
                dragRef.current = null;
                draggingIdRef.current = null;
                setDraggingId(null);
            },
        });
        pansRef.current.set(id, pan);
        return pan;
    };

    // Drop cached responders for removed orbs.
    useEffect(() => {
        for (const id of [...pansRef.current.keys()]) {
            if (!ids.includes(id)) pansRef.current.delete(id);
        }
    }, [ids.join(',')]);

    const confirmItem = confirmId ? myItems.find((i) => i.id === confirmId) ?? null : null;

    const labelColor = isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.75)';
    const lineColor = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';

    return (
        <View>
            {/* Header: title + plus, with the page's section-divider rhythm */}
            <View style={[styles.dividerLine, { backgroundColor: lineColor }]} />
            <View style={styles.header}>
                <Text style={[styles.headerTitle, { color: labelColor }]}>HABITS &amp; GOALS</Text>
                <View style={styles.headerActions}>
                    {myItems.length > 0 && (
                        <Pressable
                            style={[styles.detailsBtn, { borderColor: lineColor, backgroundColor: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.08)' }]}
                            onPress={toggleDetails}
                            hitSlop={8}
                            accessibilityLabel={showDetails ? 'Hide details' : 'Show details'}
                        >
                            <Text style={[styles.detailsLabel, { color: isLight ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.6)' }]}>
                                Details
                            </Text>
                            <Ionicons
                                name={showDetails ? 'chevron-up' : 'chevron-down'}
                                size={13}
                                color={isLight ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.6)'}
                            />
                        </Pressable>
                    )}
                    <Pressable
                        style={[styles.plusBtn, { borderColor: lineColor, backgroundColor: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.08)' }]}
                        onPress={() => setCreating(true)}
                        hitSlop={8}
                        accessibilityLabel={`New ${frequency} habit or goal`}
                    >
                        <Text style={[styles.plusGlyph, { color: isLight ? 'rgba(0,0,0,0.7)' : '#fff' }]}>+</Text>
                    </Pressable>
                </View>
            </View>

            {/* Floating area */}
            <View
                style={[
                    styles.box,
                    {
                        height: BOX_HEIGHT,
                        backgroundColor: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)',
                        borderColor: lineColor,
                    },
                ]}
                onLayout={(e: LayoutChangeEvent) =>
                    setBox({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })
                }
            >
                {myItems.length === 0 ? (
                    <View style={styles.empty}>
                        <Text style={[styles.emptyText, { color: isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)' }]}>
                            Tap + to add a {frequency} habit or goal
                        </Text>
                        <Text style={[styles.emptySub, { color: isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.28)' }]}>
                            They float here as orbs — tap one to mark it complete.
                        </Text>
                    </View>
                ) : (
                    box.width > 0 &&
                    myItems.map((item) => {
                        const p = stateRef.current.get(item.id);
                        if (!p) return null;
                        const pan = getPan(item.id);
                        return (
                            <View
                                key={item.id}
                                {...pan.panHandlers}
                                style={{
                                    position: 'absolute',
                                    left: p.x - p.size / 2,
                                    top: p.y - p.size / 2,
                                    width: p.size,
                                    height: p.size,
                                    zIndex: draggingId === item.id ? 10 : 2,
                                }}
                            >
                                <HabitGoalOrb
                                    size={p.size}
                                    title={item.title}
                                    type={item.type}
                                    completed={item.isCompletedForCurrentPeriod}
                                />
                            </View>
                        );
                    })
                )}
            </View>

            {/* Metadata dropdown */}
            {showDetails && myItems.length > 0 && (
                <HabitGoalDetailsList items={myItems} isLight={isLight} onPressItem={(id) => setConfirmId(id)} />
            )}

            <HabitGoalCreateModal
                visible={creating}
                defaultFrequency={frequency}
                onClose={() => setCreating(false)}
                onSave={(input) => {
                    addHabitGoal(input);
                    setCreating(false);
                }}
            />

            <HabitGoalConfirmModal
                item={confirmItem}
                onClose={() => setConfirmId(null)}
                onConfirm={() => {
                    if (confirmId) toggleCompletion(confirmId);
                    setConfirmId(null);
                }}
                onRemove={() => {
                    if (confirmId) removeHabitGoal(confirmId);
                    setConfirmId(null);
                }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    dividerLine: {
        height: 1,
        marginTop: 30,
        marginBottom: 14,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
    },
    headerTitle: {
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 1.8,
        textTransform: 'uppercase',
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    detailsBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        height: 30,
        paddingHorizontal: 12,
        borderRadius: 15,
        borderWidth: 1,
    },
    detailsLabel: {
        fontSize: 12,
        fontWeight: '500',
    },
    plusBtn: {
        width: 30,
        height: 30,
        borderRadius: 15,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    plusGlyph: {
        fontSize: 20,
        fontWeight: '300',
        marginTop: -2,
    },
    box: {
        borderRadius: 20,
        borderWidth: 1,
        overflow: 'hidden',
        position: 'relative',
    },
    empty: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 30,
        gap: 6,
    },
    emptyText: {
        fontSize: 14,
        fontWeight: '500',
        textAlign: 'center',
    },
    emptySub: {
        fontSize: 12,
        textAlign: 'center',
        lineHeight: 17,
    },
});

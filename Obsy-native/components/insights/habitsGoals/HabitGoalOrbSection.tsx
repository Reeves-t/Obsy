import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, Text, Pressable, LayoutChangeEvent, LayoutAnimation, Platform, UIManager } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { FloatingOrb } from './FloatingOrb';
import { HabitGoalCelebration } from './HabitGoalCelebration';
import { HabitGoalCreateModal } from './HabitGoalCreateModal';
import { HabitGoalConfirmModal } from './HabitGoalConfirmModal';
import { HabitGoalDetailsList } from './HabitGoalDetailsList';
import { useHabitOrbPhysicsV2, MAX_ORBS } from './useHabitOrbPhysicsV2';
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
    // Only the first MAX_ORBS float as orbs; any overflow still appears in the details list.
    const orbItems = useMemo(() => myItems.slice(0, MAX_ORBS), [myItems]);
    const ids = useMemo(() => orbItems.map((i) => i.id), [orbItems]);

    const [box, setBox] = useState({ width: 0, height: BOX_HEIGHT });
    const [creating, setCreating] = useState(false);
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [showDetails, setShowDetails] = useState(false);
    const [celebration, setCelebration] = useState<{ x: number; y: number; key: number } | null>(null);

    const toggleDetails = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setShowDetails((v) => !v);
    };

    // Reset stale completion state when the screen regains focus (handles day/week rollover).
    useEffect(() => {
        if (isFocused) reconcilePeriods();
    }, [isFocused, reconcilePeriods]);

    // Physics only runs while: mounted + screen focused + parent active + has orbs.
    const physicsActive = active && isFocused && orbItems.length > 0;
    const physics = useHabitOrbPhysicsV2(ids, {
        width: box.width,
        height: box.height,
        active: physicsActive,
    });

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
            <Text style={[styles.headerDescription, { color: isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)' }]}>
                Your {frequency} habits and goals as floating orbs. Tap one to mark it complete.
            </Text>

            {/* Floating area */}
            <GestureHandlerRootView
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
                {orbItems.length === 0 ? (
                    <View style={styles.empty} pointerEvents="none">
                        <Text style={[styles.emptyText, { color: isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)' }]}>
                            Tap + to add a {frequency} habit or goal
                        </Text>
                        <Text style={[styles.emptySub, { color: isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.28)' }]}>
                            They float here as orbs. Hold one to pick it up, tap to mark it complete.
                        </Text>
                    </View>
                ) : (
                    box.width > 0 &&
                    orbItems.map((item) => {
                        const slot = physics.slotFor(item.id);
                        if (slot == null) return null;
                        return (
                            <FloatingOrb
                                key={item.id}
                                item={item}
                                slot={slot}
                                size={physics.sizeFor(item.id)}
                                physics={physics}
                                onTap={setConfirmId}
                            />
                        );
                    })
                )}

                {/* Completion burst — mounted only while alive, then torn down */}
                {celebration && box.width > 0 && (
                    <HabitGoalCelebration
                        key={celebration.key}
                        x={celebration.x}
                        y={celebration.y}
                        width={box.width}
                        height={box.height}
                        onDone={() => setCelebration(null)}
                    />
                )}
            </GestureHandlerRootView>

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
                    if (confirmId) {
                        const willComplete = confirmItem ? !confirmItem.isCompletedForCurrentPeriod : false;
                        toggleCompletion(confirmId);
                        // Celebrate only when completing (not undo), and only if the
                        // orb is on screen (overflow items live in the list only).
                        if (willComplete) {
                            const pos = physics.positionOf(confirmId);
                            if (pos) setCelebration({ x: pos.x, y: pos.y, key: Date.now() });
                            physics.triggerCompletionPop(confirmId);
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                        }
                    }
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
        marginBottom: 10,
    },
    headerDescription: {
        fontSize: 13,
        lineHeight: 19,
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

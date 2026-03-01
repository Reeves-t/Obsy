import React, { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronLeft, Search, Crosshair } from 'lucide-react-native';
import { ThemedText } from '@/components/ui/ThemedText';
import { useCaptureStore } from '@/lib/captureStore';
import { useAuth } from '@/contexts/AuthContext';
import { useMoodverseStore } from '@/lib/moodverseStore';
import { GalaxyCanvas } from '@/components/moodverse/GalaxyCanvas';
import { BottomSheetMetadata } from '@/components/moodverse/BottomSheetMetadata';
import { TimeNavigator } from '@/components/moodverse/TimeNavigator';
import { SearchOverlay } from '@/components/moodverse/SearchOverlay';
import { SelectionTrail } from '@/components/moodverse/SelectionTrail';
import { computeGalaxyLayout, generateMockCaptures } from '@/components/moodverse/galaxyLayout';
import { computeEdgesForOrb, computeAmbientMesh } from '@/components/moodverse/edgeCompute';

const DEFAULT_CAMERA_Z = 35;
const CAMERA_Z_MIN = 15;
const CAMERA_Z_MAX = 90;
const PAN_LIMIT = 20;
const PAN_SENSITIVITY = 0.018;
const IDLE_RESUME_DELAY = 1200;

export default function MoodversePage() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { user } = useAuth();
    const { captures } = useCaptureStore();
    const [isFocused, setIsFocused] = useState(true);
    const [showSearch, setShowSearch] = useState(false);
    const [trailPoints, setTrailPoints] = useState<Array<{ x: number; y: number }>>([]);

    // Store subscriptions (individual selectors for minimal re-renders)
    const selectedYear = useMoodverseStore((s) => s.selectedYear);
    const selectedOrbId = useMoodverseStore((s) => s.selectedOrbId);
    const selectedOrbIds = useMoodverseStore((s) => s.selectedOrbIds);
    const selectModeActive = useMoodverseStore((s) => s.selectModeActive);
    const searchResultIds = useMoodverseStore((s) => s.searchResultIds);
    const isExplainOpen = useMoodverseStore((s) => s.isExplainOpen);
    const isIdle = useMoodverseStore((s) => s.isIdle);
    const aiHighlightedOrbIds = useMoodverseStore((s) => s.aiHighlightedOrbIds);

    // Camera state via refs (read by render loop, updated by gestures)
    const cameraZRef = useRef(DEFAULT_CAMERA_Z);
    const cameraOffsetRef = useRef({ x: 0, y: 0 });
    const baseZoomRef = useRef(DEFAULT_CAMERA_Z);
    const cameraTargetRef = useRef<{ x: number; y: number } | null>(null);
    const persistentCamRef = useRef({ x: 0, y: 0 });

    // Sync selectModeActive to ref for gesture callbacks
    const selectModeActiveRef = useRef(selectModeActive);
    useEffect(() => { selectModeActiveRef.current = selectModeActive; }, [selectModeActive]);

    // ── Idle tracking ────────────────────────────────────────────────────
    const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const markInteracting = useCallback(() => {
        useMoodverseStore.getState().setIdle(false);
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        idleTimerRef.current = setTimeout(() => {
            useMoodverseStore.getState().setIdle(true);
        }, IDLE_RESUME_DELAY);
    }, []);

    // Selection / explain changes break idle
    useEffect(() => {
        if (selectedOrbId || selectedOrbIds.length > 0 || isExplainOpen) {
            useMoodverseStore.getState().setIdle(false);
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        } else {
            idleTimerRef.current = setTimeout(() => {
                useMoodverseStore.getState().setIdle(true);
            }, IDLE_RESUME_DELAY);
        }
    }, [selectedOrbId, selectedOrbIds, isExplainOpen]);

    // Pause rendering when screen loses focus
    useFocusEffect(
        useCallback(() => {
            setIsFocused(true);
            return () => setIsFocused(false);
        }, [])
    );

    // Reset moodverse store + clear idle timer on unmount
    useEffect(() => {
        return () => {
            useMoodverseStore.getState().reset();
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        };
    }, []);

    // ── Data: fall back to mock captures when none exist ─────────────────
    const effectiveCaptures = useMemo(() => {
        if (captures.length > 0) return captures;
        if (!user?.id) return [];
        return generateMockCaptures(user.id, selectedYear);
    }, [captures, user?.id, selectedYear]);

    const { orbs, clusters } = useMemo(() => {
        if (!user?.id || effectiveCaptures.length === 0) {
            return { orbs: [], clusters: [] };
        }
        return computeGalaxyLayout(effectiveCaptures, user.id, selectedYear);
    }, [effectiveCaptures, user?.id, selectedYear]);

    // ── Derived props for GalaxyCanvas ───────────────────────────────────
    const selectedIdsSet = useMemo(() => {
        const set = new Set<string>();
        if (selectedOrbId) set.add(selectedOrbId);
        for (const id of selectedOrbIds) set.add(id);
        return set;
    }, [selectedOrbId, selectedOrbIds]);

    const highlightedIdsSet = useMemo(() => new Set(searchResultIds), [searchResultIds]);

    const ambientEdges = useMemo(() => {
        if (orbs.length < 2) return undefined;
        return computeAmbientMesh(orbs);
    }, [orbs]);

    const focusedEdges = useMemo(() => {
        if (!selectedOrbId) return undefined;
        const orb = orbs.find((o) => o.id === selectedOrbId);
        if (!orb) return undefined;
        return computeEdgesForOrb(orb, orbs);
    }, [selectedOrbId, orbs]);

    // Camera target: lerp toward selected orb's position
    useEffect(() => {
        if (selectedOrbId) {
            const orb = orbs.find((o) => o.id === selectedOrbId);
            if (orb) {
                cameraTargetRef.current = { x: orb.x, y: orb.y };
                return;
            }
        }
        cameraTargetRef.current = null;
    }, [selectedOrbId, orbs]);

    // ── Gestures ─────────────────────────────────────────────────────────
    const tapGesture = Gesture.Tap()
        .onEnd((e) => {
            const raycast = GalaxyCanvas._raycast?.current;
            if (!raycast) return;
            const orbId = raycast(e.x, e.y);
            if (orbId) {
                useMoodverseStore.getState().selectOrb(orbId);
            } else {
                useMoodverseStore.getState().clearSelection();
            }
        })
        .runOnJS(true);

    const pinchGesture = Gesture.Pinch()
        .onBegin(() => {
            baseZoomRef.current = cameraZRef.current;
            markInteracting();
        })
        .onUpdate((e) => {
            const newZ = baseZoomRef.current / e.scale;
            cameraZRef.current = Math.max(CAMERA_Z_MIN, Math.min(CAMERA_Z_MAX, newZ));
        })
        .onEnd(() => {
            markInteracting();
        })
        .runOnJS(true);

    const panGesture = Gesture.Pan()
        .onBegin((e) => {
            markInteracting();
            if (selectModeActiveRef.current) {
                setTrailPoints([{ x: e.x, y: e.y }]);
            }
        })
        .onUpdate((e) => {
            if (selectModeActiveRef.current) {
                setTrailPoints((prev) => {
                    const next = [...prev, { x: e.x, y: e.y }];
                    return next.length > 60 ? next.slice(-60) : next;
                });
                const raycast = GalaxyCanvas._raycast?.current;
                if (raycast) {
                    const orbId = raycast(e.x, e.y);
                    if (orbId) useMoodverseStore.getState().addToSelection(orbId);
                }
            } else {
                cameraOffsetRef.current = {
                    x: Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, persistentCamRef.current.x - e.translationX * PAN_SENSITIVITY)),
                    y: Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, persistentCamRef.current.y + e.translationY * PAN_SENSITIVITY)),
                };
            }
        })
        .onEnd(() => {
            markInteracting();
            if (selectModeActiveRef.current) {
                setTrailPoints([]);
            } else {
                persistentCamRef.current = { ...cameraOffsetRef.current };
            }
        })
        .runOnJS(true);

    const composedGesture = Gesture.Simultaneous(
        pinchGesture,
        Gesture.Exclusive(panGesture, tapGesture),
    );

    return (
        <GestureHandlerRootView style={styles.root}>
            <View style={[styles.container, { paddingTop: insets.top }]}>
                {/* Nebula background — subtle purple/pink radial glow */}
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                    <LinearGradient
                        colors={[
                            'rgba(124, 58, 237, 0.04)',
                            'rgba(236, 72, 153, 0.02)',
                            'transparent',
                        ]}
                        start={{ x: 0.5, y: 0.4 }}
                        end={{ x: 0.5, y: 1 }}
                        style={StyleSheet.absoluteFill}
                    />
                    <LinearGradient
                        colors={[
                            'transparent',
                            'rgba(124, 58, 237, 0.03)',
                            'transparent',
                        ]}
                        start={{ x: 0, y: 0.5 }}
                        end={{ x: 1, y: 0.5 }}
                        style={StyleSheet.absoluteFill}
                    />
                </View>

                {/* Galaxy Canvas with gesture detection */}
                <GestureDetector gesture={composedGesture}>
                    <View style={styles.canvasWrapper}>
                        {orbs.length > 0 ? (
                            <GalaxyCanvas
                                orbs={orbs}
                                clusters={clusters}
                                cameraZRef={cameraZRef}
                                cameraOffsetRef={cameraOffsetRef}
                                isPaused={!isFocused}
                                selectedIds={selectedIdsSet}
                                highlightedIds={highlightedIdsSet}
                                ambientEdges={ambientEdges}
                                focusedEdges={focusedEdges}
                                cameraTargetRef={cameraTargetRef}
                                isIdle={isIdle}
                                aiHighlightedOrbIds={aiHighlightedOrbIds}
                            />
                        ) : (
                            <View style={styles.emptyState}>
                                <ThemedText style={styles.emptyText}>
                                    No captures yet for {selectedYear}
                                </ThemedText>
                                <ThemedText style={styles.emptySubtext}>
                                    Start capturing to see your emotional universe.
                                </ThemedText>
                            </View>
                        )}
                    </View>
                </GestureDetector>

                {/* Selection trail overlay */}
                {selectModeActive && trailPoints.length > 1 && (
                    <SelectionTrail points={trailPoints} />
                )}

                {/* Time navigator — below header */}
                <View style={[styles.timeNavWrapper, { top: insets.top + 52 }]}>
                    <TimeNavigator />
                </View>

                {/* Header — absolute on top */}
                <View style={[styles.header, { top: insets.top }]}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <ChevronLeft size={24} color="#e4e4ed" />
                    </TouchableOpacity>
                    <ThemedText style={styles.headerTitle}>Moodverse</ThemedText>
                    <View style={styles.headerActions}>
                        <TouchableOpacity
                            onPress={() => useMoodverseStore.getState().toggleSelectMode()}
                            style={[styles.headerBtn, selectModeActive && styles.headerBtnActive]}
                        >
                            <Crosshair
                                size={18}
                                color={selectModeActive ? '#a855f7' : 'rgba(228,228,237,0.5)'}
                            />
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => setShowSearch(true)}
                            style={styles.headerBtn}
                        >
                            <Search size={18} color="rgba(228,228,237,0.5)" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Search overlay (modal) */}
                <SearchOverlay
                    visible={showSearch}
                    onClose={() => setShowSearch(false)}
                    orbs={orbs}
                />
            </View>

            {/* Bottom sheet for selected orb/cluster metadata */}
            {orbs.length > 0 && (
                <BottomSheetMetadata orbs={orbs} clusters={clusters} />
            )}
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    container: {
        flex: 1,
        backgroundColor: '#06060a',
    },
    header: {
        position: 'absolute',
        left: 0,
        right: 0,
        zIndex: 10,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 12,
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        flex: 1,
        textAlign: 'center',
        fontSize: 16,
        fontWeight: '600',
        color: '#e4e4ed',
    },
    headerActions: {
        flexDirection: 'row',
        gap: 4,
    },
    headerBtn: {
        padding: 6,
        borderRadius: 20,
    },
    headerBtnActive: {
        backgroundColor: 'rgba(168, 85, 247, 0.15)',
    },
    timeNavWrapper: {
        position: 'absolute',
        left: 0,
        right: 0,
        zIndex: 8,
    },
    canvasWrapper: {
        flex: 1,
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 40,
    },
    emptyText: {
        color: 'rgba(228,228,237,0.4)',
        fontSize: 16,
        fontWeight: '500',
        textAlign: 'center',
    },
    emptySubtext: {
        color: 'rgba(228,228,237,0.2)',
        fontSize: 14,
        textAlign: 'center',
    },
});

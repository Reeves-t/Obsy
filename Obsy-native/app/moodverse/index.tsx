import React, { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import { StyleSheet, View, TouchableOpacity, Alert } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronLeft, Search, Crosshair, RotateCcw } from 'lucide-react-native';
import { useSubscription } from '@/hooks/useSubscription';
import { VanguardPaywall } from '@/components/paywall/VanguardPaywall';
import { ObsyIcon } from '@/components/moodverse/ObsyIcon';
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
import { computeTransitions, computeTransitionAuras, TransitionData, TransitionAura } from '@/components/moodverse/transitionCompute';
import { getProfile } from '@/services/profile';

const DEFAULT_CAMERA_Z = 35;
const CAMERA_Z_MIN = 5;
const CAMERA_Z_MAX = 90;
const PAN_LIMIT = 20;
const PAN_SENSITIVITY = 0.018;
const IDLE_RESUME_DELAY = 1200;

// Orbit constants
const ORBIT_SENSITIVITY = 0.004;  // rad/px
const ORBIT_VEL_SCALE = 0.000067; // px/s → rad/frame momentum seed
const ORBIT_DECAY = 0.88;         // momentum friction per frame (~300ms coast)
const ORBIT_DEAD_ZONE = 4;        // px before orbit registers
const MIN_PHI = 0;                // top-down (looking straight down at spiral)
const MAX_PHI = Math.PI / 3;      // 60° tilt max — keeps view useful, never edge-on
const RECENTER_DURATION = 400;    // ms

export default function MoodversePage() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { user } = useAuth();
    const { captures } = useCaptureStore();
    const [isFocused, setIsFocused] = useState(true);
    const [showSearch, setShowSearch] = useState(false);
    const [showPaywall, setShowPaywall] = useState(false);
    const [aiFreeMode, setAiFreeMode] = useState(false);
    const [trailPoints, setTrailPoints] = useState<Array<{ x: number; y: number }>>([]);
    const { tier } = useSubscription();
    const isPro = tier === 'founder' || tier === 'subscriber';

    // Store subscriptions
    const selectedYear = useMoodverseStore((s) => s.selectedYear);
    const selectedOrbId = useMoodverseStore((s) => s.selectedOrbId);
    const selectedOrbIds = useMoodverseStore((s) => s.selectedOrbIds);
    const selectModeActive = useMoodverseStore((s) => s.selectModeActive);
    const orbitModeActive = useMoodverseStore((s) => s.orbitModeActive);
    const searchResultIds = useMoodverseStore((s) => s.searchResultIds);
    const showLinks = useMoodverseStore((s) => s.showLinks);
    const isExplainOpen = useMoodverseStore((s) => s.isExplainOpen);
    const isIdle = useMoodverseStore((s) => s.isIdle);
    const aiHighlightedOrbIds = useMoodverseStore((s) => s.aiHighlightedOrbIds);

    useEffect(() => {
        getProfile()
            .then((profile) => setAiFreeMode(!!profile?.ai_free_mode))
            .catch(() => setAiFreeMode(false));
    }, [user?.id]);

    // Camera state via refs (read by render loop, updated by gestures)
    const cameraZRef = useRef(DEFAULT_CAMERA_Z);
    const cameraOffsetRef = useRef({ x: 0, y: 0 });
    const orbitAnglesRef = useRef({ theta: 0, phi: 0 }); // phi=0 = top-down
    const baseZoomRef = useRef(DEFAULT_CAMERA_Z);
    const cameraTargetRef = useRef<{ x: number; y: number } | null>(null);
    const persistentCamRef = useRef({ x: 0, y: 0 });

    // Refs for gesture callbacks
    const selectModeActiveRef = useRef(selectModeActive);
    const orbitModeActiveRef = useRef(orbitModeActive);
    useEffect(() => { selectModeActiveRef.current = selectModeActive; }, [selectModeActive]);
    useEffect(() => { orbitModeActiveRef.current = orbitModeActive; }, [orbitModeActive]);

    // Orbit / momentum refs
    const lastPanTranslationRef = useRef({ x: 0, y: 0 });
    const orbitVelocityRef = useRef({ theta: 0, phi: 0 });
    const momentumRafRef = useRef<number | null>(null);

    // ── Idle tracking ────────────────────────────────────────────────────
    const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const markInteracting = useCallback(() => {
        useMoodverseStore.getState().setIdle(false);
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        idleTimerRef.current = setTimeout(() => {
            useMoodverseStore.getState().setIdle(true);
        }, IDLE_RESUME_DELAY);
    }, []);

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

    useFocusEffect(
        useCallback(() => {
            setIsFocused(true);
            return () => setIsFocused(false);
        }, [])
    );

    useEffect(() => {
        return () => {
            useMoodverseStore.getState().reset();
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
            if (momentumRafRef.current) cancelAnimationFrame(momentumRafRef.current);
        };
    }, []);

    // ── Data ─────────────────────────────────────────────────────────────
    const effectiveCaptures = useMemo(() => {
        if (captures.length > 0) return captures;
        if (!user?.id) return [];
        return generateMockCaptures(user.id, selectedYear);
    }, [captures, user?.id, selectedYear]);

    const { orbs, clusters } = useMemo(() => {
        if (!user?.id || effectiveCaptures.length === 0) return { orbs: [], clusters: [] };
        return computeGalaxyLayout(effectiveCaptures, user.id, selectedYear);
    }, [effectiveCaptures, user?.id, selectedYear]);

    // ── Derived canvas props ─────────────────────────────────────────────
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

    const allFocusedEdges = useMemo(() => {
        if (!selectedOrbId) return undefined;
        const orb = orbs.find((o) => o.id === selectedOrbId);
        if (!orb) return undefined;
        return computeEdgesForOrb(orb, orbs);
    }, [selectedOrbId, orbs]);

    // Gate edges on showLinks toggle
    const focusedEdges = showLinks ? allFocusedEdges : undefined;

    // ── Transition data (before/after mood patterns) ──────────────────
    const selectedOrb = useMemo(() => {
        if (!selectedOrbId) return null;
        return orbs.find((o) => o.id === selectedOrbId) ?? null;
    }, [selectedOrbId, orbs]);

    const transitions: TransitionData | null = useMemo(() => {
        if (!selectedOrb) return null;
        return computeTransitions(selectedOrb.moodId, orbs);
    }, [selectedOrb?.moodId, orbs]);

    const transitionAuras: TransitionAura[] = useMemo(() => {
        if (!transitions || !selectedOrb || !showLinks) return [];
        return computeTransitionAuras(transitions, selectedOrb.moodId);
    }, [transitions, selectedOrb?.moodId, showLinks]);

    useEffect(() => {
        cameraTargetRef.current = null;
    }, [selectedOrbId, orbs]);

    // ── Recenter ─────────────────────────────────────────────────────────
    const recenterCamera = useCallback(() => {
        // Cancel any active momentum
        if (momentumRafRef.current) {
            cancelAnimationFrame(momentumRafRef.current);
            momentumRafRef.current = null;
        }
        const startTime = Date.now();
        const startTheta = orbitAnglesRef.current.theta;
        const startPhi = orbitAnglesRef.current.phi;
        const startZ = cameraZRef.current;
        const startOffX = cameraOffsetRef.current.x;
        const startOffY = cameraOffsetRef.current.y;

        const tick = () => {
            const t = Math.min(1, (Date.now() - startTime) / RECENTER_DURATION);
            const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic
            orbitAnglesRef.current.theta = startTheta * (1 - ease);
            orbitAnglesRef.current.phi = startPhi * (1 - ease);
            cameraZRef.current = startZ + (DEFAULT_CAMERA_Z - startZ) * ease;
            cameraOffsetRef.current = {
                x: startOffX * (1 - ease),
                y: startOffY * (1 - ease),
            };
            persistentCamRef.current = { ...cameraOffsetRef.current };
            if (t < 1) momentumRafRef.current = requestAnimationFrame(tick);
        };
        momentumRafRef.current = requestAnimationFrame(tick);
    }, []);

    // ── Gestures ─────────────────────────────────────────────────────────

    const tapGesture = Gesture.Tap()
        .onEnd((e) => {
            const raycast = GalaxyCanvas._raycast?.current;
            if (!raycast) return;
            const orbId = raycast(e.x, e.y);
            if (orbId) {
                useMoodverseStore.getState().selectOrb(orbId);
                // Orb tap auto-disables orbit mode (spec requirement)
                if (orbitModeActiveRef.current) {
                    useMoodverseStore.getState().setOrbitModeActive(false);
                }
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
            // Reset orbit tracking state
            lastPanTranslationRef.current = { x: 0, y: 0 };
            orbitVelocityRef.current = { theta: 0, phi: 0 };
            // Cancel any active momentum before a new drag
            if (momentumRafRef.current) {
                cancelAnimationFrame(momentumRafRef.current);
                momentumRafRef.current = null;
            }
            if (!orbitModeActiveRef.current && selectModeActiveRef.current) {
                setTrailPoints([{ x: e.x, y: e.y }]);
            }
        })
        .onUpdate((e) => {
            if (orbitModeActiveRef.current) {
                // ── Orbit mode: rotate camera around spiral center ──────────
                const dx = e.translationX - lastPanTranslationRef.current.x;
                const dy = e.translationY - lastPanTranslationRef.current.y;
                lastPanTranslationRef.current = { x: e.translationX, y: e.translationY };

                const totalDist = Math.sqrt(e.translationX ** 2 + e.translationY ** 2);
                if (totalDist > ORBIT_DEAD_ZONE) {
                    orbitAnglesRef.current.theta += dx * ORBIT_SENSITIVITY;
                    orbitAnglesRef.current.phi = Math.max(MIN_PHI, Math.min(MAX_PHI,
                        orbitAnglesRef.current.phi + dy * ORBIT_SENSITIVITY,
                    ));
                    // Track velocity for momentum after release
                    orbitVelocityRef.current = {
                        theta: e.velocityX * ORBIT_VEL_SCALE,
                        phi: e.velocityY * ORBIT_VEL_SCALE,
                    };
                    markInteracting();
                }
            } else if (selectModeActiveRef.current) {
                // ── Brush select mode ───────────────────────────────────────
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
                // ── Normal pan: move camera in XY ───────────────────────────
                cameraOffsetRef.current = {
                    x: Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, persistentCamRef.current.x - e.translationX * PAN_SENSITIVITY)),
                    y: Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, persistentCamRef.current.y + e.translationY * PAN_SENSITIVITY)),
                };
            }
        })
        .onEnd(() => {
            if (orbitModeActiveRef.current) {
                // ── Coast to stop with momentum ease-out ───────────────────
                let vTheta = orbitVelocityRef.current.theta;
                let vPhi = orbitVelocityRef.current.phi;

                const applyMomentum = () => {
                    vTheta *= ORBIT_DECAY;
                    vPhi *= ORBIT_DECAY;
                    orbitAnglesRef.current.theta += vTheta;
                    orbitAnglesRef.current.phi = Math.max(MIN_PHI, Math.min(MAX_PHI,
                        orbitAnglesRef.current.phi + vPhi,
                    ));
                    if (Math.abs(vTheta) > 0.00015 || Math.abs(vPhi) > 0.00015) {
                        momentumRafRef.current = requestAnimationFrame(applyMomentum);
                    }
                };

                if (Math.abs(vTheta) > 0.00015 || Math.abs(vPhi) > 0.00015) {
                    momentumRafRef.current = requestAnimationFrame(applyMomentum);
                }
            } else {
                markInteracting();
                if (selectModeActiveRef.current) {
                    setTrailPoints([]);
                } else {
                    persistentCamRef.current = { ...cameraOffsetRef.current };
                }
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
                {/* Nebula background */}
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

                {/* Galaxy Canvas */}
                <GestureDetector gesture={composedGesture}>
                    <View style={styles.canvasWrapper}>
                        {orbs.length > 0 ? (
                            <GalaxyCanvas
                                orbs={orbs}
                                clusters={clusters}
                                cameraZRef={cameraZRef}
                                cameraOffsetRef={cameraOffsetRef}
                                orbitAnglesRef={orbitAnglesRef}
                                isPaused={!isFocused}
                                selectedIds={selectedIdsSet}
                                highlightedIds={highlightedIdsSet}
                                ambientEdges={ambientEdges}
                                focusedEdges={focusedEdges}
                                transitionAuras={transitionAuras}
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

                {/* Time navigator */}
                <View style={[styles.timeNavWrapper, { top: insets.top + 52 }]}>
                    <TimeNavigator />
                </View>

                {/* Header */}
                <View style={[styles.header, { top: insets.top }]}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <ChevronLeft size={24} color="#e4e4ed" />
                    </TouchableOpacity>
                    <ThemedText style={styles.headerTitle}>Moodverse</ThemedText>
                    <View style={styles.headerActions}>
                        {/* Crosshair: recenter when orbit active, multi-select toggle otherwise */}
                        <TouchableOpacity
                            onPress={() => {
                                if (orbitModeActive) {
                                    recenterCamera();
                                } else {
                                    useMoodverseStore.getState().toggleSelectMode();
                                }
                            }}
                            style={[
                                styles.headerBtn,
                                !orbitModeActive && selectModeActive && styles.headerBtnActive,
                            ]}
                        >
                            <Crosshair
                                size={18}
                                color={!orbitModeActive && selectModeActive ? '#a855f7' : 'rgba(228,228,237,0.5)'}
                            />
                        </TouchableOpacity>

                        {/* Search */}
                        <TouchableOpacity
                            onPress={() => setShowSearch(true)}
                            style={styles.headerBtn}
                        >
                            <Search size={18} color="rgba(228,228,237,0.5)" />
                        </TouchableOpacity>

                        {/* Orbit mode toggle */}
                        <TouchableOpacity
                            onPress={() => useMoodverseStore.getState().toggleOrbitMode()}
                            style={[styles.headerBtn, orbitModeActive && styles.headerBtnActiveOrbit]}
                        >
                            <RotateCcw
                                size={18}
                                color={orbitModeActive ? '#8B2252' : 'rgba(228,228,237,0.5)'}
                            />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Search overlay */}
                <SearchOverlay
                    visible={showSearch}
                    onClose={() => setShowSearch(false)}
                    orbs={orbs}
                />
            </View>

            {/* Bottom sheet */}
            {orbs.length > 0 && (
                <BottomSheetMetadata orbs={orbs} clusters={clusters} transitions={transitions} />
            )}

            {/* Floating Obsy chat button */}
            {orbs.length > 0 && !selectedOrbId && selectedOrbIds.length === 0 && (
                <TouchableOpacity
                    style={[styles.floatingChatBtn, { bottom: insets.bottom + 24 }]}
                    onPress={() => {
                        if (aiFreeMode) {
                            Alert.alert('AI-Free Mode', 'Moodverse chat is disabled while AI-Free mode is on.');
                            return;
                        }
                        if (!isPro) {
                            setShowPaywall(true);
                            return;
                        }
                        useMoodverseStore.getState().openChat([], 'general');
                        router.push('/moodverse/chat');
                    }}
                    activeOpacity={0.8}
                >
                    <ObsyIcon size={38} />
                </TouchableOpacity>
            )}

            <VanguardPaywall
                visible={showPaywall}
                onClose={() => setShowPaywall(false)}
                featureName="moodverse_explain"
            />
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
    headerBtnActiveOrbit: {
        backgroundColor: 'rgba(139, 34, 82, 0.15)',
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
    floatingChatBtn: {
        position: 'absolute',
        right: 20,
        zIndex: 20,
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: 'rgba(10, 10, 16, 0.85)',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#8B2252',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 14,
        elevation: 10,
        borderWidth: 1,
        borderColor: 'rgba(139, 34, 82, 0.2)',
    },
});

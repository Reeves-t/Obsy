import React, { useRef, useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, LayoutChangeEvent } from 'react-native';
import { GLView, ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer } from 'expo-three';
import * as THREE from 'three';
import { createOrbMesh, createClusterCloud, disposeOrbMesh } from './OrbNode';
import { EDGE_COLORS } from './edgeCompute';
import { createShimmerLayer, ShimmerLayer } from './shimmerLayer';
import { createNebulaRing, NebulaRingLayer } from './cosmicFog';
import type { GalaxyOrb, GalaxyCluster, GalaxyEdge } from './galaxyTypes';
import type { TransitionAura } from './transitionCompute';

interface GalaxyCanvasProps {
    orbs: GalaxyOrb[];
    clusters: GalaxyCluster[];
    cameraZRef: React.MutableRefObject<number>;
    cameraOffsetRef: React.MutableRefObject<{ x: number; y: number }>;
    /** Camera orbit angles (radians) — theta = Y-axis rotation, phi = X-axis tilt */
    orbitAnglesRef?: React.MutableRefObject<{ theta: number; phi: number }>;
    isPaused?: boolean;
    selectedIds?: Set<string>;
    highlightedIds?: Set<string>;
    /** Always-visible ambient mesh */
    ambientEdges?: GalaxyEdge[];
    /** On-selection focused edges */
    focusedEdges?: GalaxyEdge[];
    /** Transition auras: glow halos on before/after mood orbs */
    transitionAuras?: TransitionAura[];
    /** Camera target for lerp animation (selected orb position) */
    cameraTargetRef?: React.MutableRefObject<{ x: number; y: number } | null>;
    /** Whether the scene is idle (no interaction) — drives shimmer */
    isIdle?: boolean;
    /** Orb IDs highlighted by AI explanation */
    aiHighlightedOrbIds?: string[];
}

const BACKGROUND_COLOR = 0x050608;
const FOG_NEAR = 40;
const FOG_FAR = 120;
const LOD_THRESHOLD = 60;
const DIM_COLOR = new THREE.Color(0x12121c);
const CAMERA_LERP_SPEED = 0.04;

// ── Helpers ──────────────────────────────────────────────────────────────

/** Seeded curvature + direction variation per edge (deterministic from IDs) */
function edgeHash(fromId: string, toId: string): number {
    let hash = 5381;
    const key = fromId + toId;
    for (let i = 0; i < key.length; i++) {
        hash = ((hash << 5) + hash + key.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
}

function buildEdgeGroup(
    edges: GalaxyEdge[],
    posMap: Map<string, THREE.Vector3>,
    baseOpacity: number,
    brighten: boolean,
): THREE.Group {
    const group = new THREE.Group();

    for (const edge of edges) {
        const from = posMap.get(edge.fromId);
        const to = posMap.get(edge.toId);
        if (!from || !to) continue;

        const hash = edgeHash(edge.fromId, edge.toId);
        const curvature = 0.15 + (hash % 100) * 0.003;
        const sign = (hash % 2 === 0) ? 1 : -1;

        const dir = new THREE.Vector3().subVectors(to, from);
        const length = dir.length();
        const perp = new THREE.Vector3(-dir.y, dir.x, 0).normalize();

        const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
        const perpOffset = curvature * length * 0.3 * sign;
        mid.x += perp.x * perpOffset;
        mid.y += perp.y * perpOffset;
        mid.z += curvature * 2 * sign;

        const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
        // Use TubeGeometry for subtle connection threads
        const tubeRadius = 0.04;  // 50% reduction for subtlety
        const geometry = new THREE.TubeGeometry(curve, 20, tubeRadius, 8, false);

        const semanticColor = EDGE_COLORS[edge.reason] || 0x7c3aed;

        const avgZ = (from.z + to.z) / 2;
        const depthFade = Math.max(0.3, 1.0 - Math.abs(avgZ) * 0.04);

        const opacity = brighten
            ? Math.max(0.2, edge.strength * 0.5 * depthFade)
            : baseOpacity * edge.strength * depthFade;

        const material = new THREE.MeshBasicMaterial({
            color: semanticColor,
            transparent: true,
            opacity,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData = {
            fromId: edge.fromId,
            toId: edge.toId,
            reason: edge.reason,
            strength: edge.strength,
            baseOpacity: opacity,
        };
        group.add(mesh);
    }

    return group;
}

function disposeEdgeGroup(group: THREE.Group) {
    group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            (child.material as THREE.Material).dispose();
        }
    });
}

// ── Component ────────────────────────────────────────────────────────────

export function GalaxyCanvas({
    orbs,
    clusters,
    cameraZRef,
    cameraOffsetRef,
    orbitAnglesRef,
    isPaused = false,
    selectedIds,
    highlightedIds,
    ambientEdges,
    focusedEdges,
    transitionAuras,
    cameraTargetRef,
    isIdle = true,
    aiHighlightedOrbIds,
}: GalaxyCanvasProps) {
    const [sceneReady, setSceneReady] = useState(false);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const rendererRef = useRef<Renderer | null>(null);
    const orbGroupRef = useRef<THREE.Group | null>(null);
    const clusterGroupRef = useRef<THREE.Group | null>(null);
    const ambientEdgeGroupRef = useRef<THREE.Group | null>(null);
    const focusedEdgeGroupRef = useRef<THREE.Group | null>(null);
    const auraGroupRef = useRef<THREE.Group | null>(null);
    const shimmerLayerRef = useRef<ShimmerLayer | null>(null);
    const cosmicFogRef = useRef<NebulaRingLayer | null>(null);
    const rafIdRef = useRef<number>(0);
    const isPausedRef = useRef(isPaused);
    const glRef = useRef<ExpoWebGLRenderingContext | null>(null);
    const sizeRef = useRef({ width: 1, height: 1 });

    // Refs for selection/highlight that render loop reads
    const selectedIdsRef = useRef<Set<string>>(new Set());
    const highlightedIdsRef = useRef<Set<string>>(new Set());
    const isIdleRef = useRef(isIdle);
    const aiHighlightRef = useRef<Set<string>>(new Set());
    // Smooth camera offset for lerp
    const smoothCamOffset = useRef({ x: 0, y: 0 });
    // Smooth orbit angles for lerp
    const smoothOrbitAngles = useRef({ theta: 0, phi: 0 });

    useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
    useEffect(() => { selectedIdsRef.current = selectedIds ?? new Set(); }, [selectedIds]);
    useEffect(() => { highlightedIdsRef.current = highlightedIds ?? new Set(); }, [highlightedIds]);
    useEffect(() => { isIdleRef.current = isIdle; }, [isIdle]);
    useEffect(() => {
        aiHighlightRef.current = new Set(aiHighlightedOrbIds ?? []);
    }, [aiHighlightedOrbIds]);

    // ── Position lookup (shared between edge builders) ────────────────────
    const posMapRef = useRef(new Map<string, THREE.Vector3>());
    useEffect(() => {
        const map = new Map<string, THREE.Vector3>();
        for (const orb of orbs) {
            map.set(orb.id, new THREE.Vector3(orb.x, orb.y, orb.z));
        }
        posMapRef.current = map;
    }, [orbs]);

    // ── Orb→cluster mapping for shimmer ──────────────────────────────────
    const orbClusterMapRef = useRef(new Map<string, string>());
    useEffect(() => {
        const map = new Map<string, string>();
        for (const orb of orbs) {
            map.set(orb.id, orb.clusterId);
        }
        orbClusterMapRef.current = map;
    }, [orbs]);

    // ── Rebuild orbs ─────────────────────────────────────────────────────
    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene) return;

        if (orbGroupRef.current) {
            orbGroupRef.current.traverse((child) => {
                if (child instanceof THREE.Group && child !== orbGroupRef.current) {
                    disposeOrbMesh(child);
                }
            });
            scene.remove(orbGroupRef.current);
        }

        const orbGroup = new THREE.Group();
        orbGroup.userData = { type: 'orbGroup' };
        const currentTime = Date.now();
        for (const orb of orbs) {
            const mesh = createOrbMesh(orb);
            // Spiral animation: orbs drift from center to their positions
            // Delay increases with month (oldest appear first, newest last)
            const monthDelay = orb.month * 150; // 150ms per month
            mesh.userData.spiralAnimStart = currentTime + monthDelay;
            mesh.userData.spiralAnimDuration = 1200; // 1.2s drift
            mesh.userData.targetPos = { x: orb.x, y: orb.y, z: orb.z };
            // Start at center (will be animated in render loop)
            mesh.position.set(0, 0, orb.z * 0.3);
            orbGroup.add(mesh);
        }
        scene.add(orbGroup);
        orbGroupRef.current = orbGroup;

        // Clusters
        if (clusterGroupRef.current) {
            clusterGroupRef.current.traverse((child) => {
                if (child instanceof THREE.Mesh) child.material.dispose();
            });
            scene.remove(clusterGroupRef.current);
        }

        // Nebula fog disabled - orbs now scatter within nebula radius instead
        const clusterGroup = new THREE.Group();
        clusterGroup.userData = { type: 'clusterGroup' };
        scene.add(clusterGroup);
        clusterGroupRef.current = clusterGroup;
    }, [orbs, clusters, sceneReady]);

    // ── Update nebula ring colors when orbs change ─────────────────────
    useEffect(() => {
        if (!sceneRef.current || orbs.length === 0) return;

        if (cosmicFogRef.current) {
            cosmicFogRef.current.setMoodColors(orbs);
        }
    }, [orbs, sceneReady]);

    // ── Update shimmer layer with edge data (no static lines rendered) ────
    useEffect(() => {
        if (!shimmerLayerRef.current) return;
        if (!ambientEdges || ambientEdges.length === 0) return;

        // Pass edge data to shimmer layer for shooting star animation
        shimmerLayerRef.current.setEdges(
            ambientEdges,
            posMapRef.current,
            orbClusterMapRef.current,
        );
    }, [ambientEdges, orbs, sceneReady]);

    // ── Rebuild focused edges (selection) ─────────────────────────────────
    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene) return;

        if (focusedEdgeGroupRef.current) {
            disposeEdgeGroup(focusedEdgeGroupRef.current);
            scene.remove(focusedEdgeGroupRef.current);
            focusedEdgeGroupRef.current = null;
        }

        if (!focusedEdges || focusedEdges.length === 0) return;

        const group = buildEdgeGroup(focusedEdges, posMapRef.current, 0.2, true);  // 50% opacity reduction
        group.userData = { type: 'focusedEdges' };
        scene.add(group);
        focusedEdgeGroupRef.current = group;
    }, [focusedEdges, orbs, sceneReady]);

    // ── Transition aura map (render loop reads this) ──────────────────────
    const auraMapRef = useRef(new Map<string, { color: number; opacity: number }>());
    useEffect(() => {
        const map = new Map<string, { color: number; opacity: number }>();
        if (transitionAuras) {
            for (const a of transitionAuras) {
                map.set(a.moodId, { color: a.color, opacity: a.opacity });
            }
        }
        auraMapRef.current = map;
    }, [transitionAuras]);

    // ── Build/dispose aura glow spheres ─────────────────────────────────
    useEffect(() => {
        const scene = sceneRef.current;
        const orbGroup = orbGroupRef.current;
        if (!scene || !orbGroup) return;

        // Dispose previous auras
        if (auraGroupRef.current) {
            auraGroupRef.current.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.geometry.dispose();
                    (child.material as THREE.Material).dispose();
                }
            });
            scene.remove(auraGroupRef.current);
            auraGroupRef.current = null;
        }

        if (!transitionAuras || transitionAuras.length === 0) return;

        // Build a moodId → aura config lookup
        const auraByMood = new Map<string, { color: number; opacity: number }>();
        for (const a of transitionAuras) {
            auraByMood.set(a.moodId, { color: a.color, opacity: a.opacity });
        }

        const group = new THREE.Group();
        group.userData = { type: 'transitionAuras' };

        // Create glow spheres behind matching orbs
        const auraSphereGeo = new THREE.SphereGeometry(1, 16, 16);

        for (const child of orbGroup.children) {
            if (!(child instanceof THREE.Group)) continue;
            const orbMoodId = child.userData.moodId;
            const aura = auraByMood.get(orbMoodId);
            if (!aura) continue;

            const baseRadius = child.userData.radius ?? 0.35;
            const auraRadius = baseRadius * 1.4;

            const mat = new THREE.MeshBasicMaterial({
                color: aura.color,
                transparent: true,
                opacity: 0, // Start at 0, fade in via render loop
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            });

            const mesh = new THREE.Mesh(auraSphereGeo, mat);
            mesh.position.copy(child.position);
            mesh.scale.setScalar(auraRadius);
            mesh.userData = {
                orbId: child.userData.orbId,
                targetOpacity: aura.opacity,
                fadeStartTime: Date.now(),
                fadeDuration: 300,
            };
            group.add(mesh);
        }

        scene.add(group);
        auraGroupRef.current = group;

        return () => {
            // Cleanup on dep change (effect re-runs handle dispose at top)
        };
    }, [transitionAuras, orbs, sceneReady]);

    // ── Raycaster ─────────────────────────────────────────────────────────
    const raycast = useCallback((screenX: number, screenY: number): string | null => {
        const camera = cameraRef.current;
        const orbGroup = orbGroupRef.current;
        if (!camera || !orbGroup || !orbGroup.visible) return null;

        const { width, height } = sizeRef.current;
        const ndcX = (screenX / width) * 2 - 1;
        const ndcY = -(screenY / height) * 2 + 1;

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);

        const meshes: THREE.Object3D[] = [];
        orbGroup.traverse((child) => {
            if (child instanceof THREE.Mesh && child.userData.isCore) meshes.push(child);
        });

        const intersections = raycaster.intersectObjects(meshes, false);
        if (intersections.length > 0) {
            let obj: THREE.Object3D | null = intersections[0].object;
            while (obj && !obj.userData?.orbId) {
                obj = obj.parent;
            }
            return obj?.userData?.orbId ?? null;
        }
        return null;
    }, []);

    const raycastRef = useRef(raycast);
    raycastRef.current = raycast;

    useEffect(() => {
        // @ts-ignore
        GalaxyCanvas._raycast = raycastRef;
    }, []);

    const onLayout = useCallback((e: LayoutChangeEvent) => {
        sizeRef.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height };
    }, []);

    // ── GL context + render loop ─────────────────────────────────────────
    const onContextCreate = useCallback(async (gl: ExpoWebGLRenderingContext) => {
        glRef.current = gl;

        const renderer = new Renderer({ gl });
        renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
        renderer.setClearColor(BACKGROUND_COLOR, 1);
        rendererRef.current = renderer;

        const scene = new THREE.Scene();
        scene.fog = new THREE.Fog(BACKGROUND_COLOR, FOG_NEAR, FOG_FAR);
        sceneRef.current = scene;

        const aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
        const camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 300);
        camera.position.set(0, 0, cameraZRef.current);
        camera.lookAt(0, 0, 0);
        cameraRef.current = camera;

        scene.add(new THREE.AmbientLight(0xffffff, 0.4));

        // Initialize shimmer layer
        const shimmer = createShimmerLayer();
        scene.add(shimmer.group);
        shimmerLayerRef.current = shimmer;

        // Initialize nebula ring
        const nebulaRing = createNebulaRing();
        scene.add(nebulaRing.group);
        cosmicFogRef.current = nebulaRing;

        const clock = new THREE.Clock();

        const animate = () => {
            rafIdRef.current = requestAnimationFrame(animate);
            if (isPausedRef.current) return;

            const elapsed = clock.getElapsedTime();
            const camZ = cameraZRef.current;
            const gestureOffset = cameraOffsetRef.current;

            // Auto-focus lerp
            const target = cameraTargetRef?.current;
            if (target) {
                smoothCamOffset.current.x += (target.x - smoothCamOffset.current.x) * CAMERA_LERP_SPEED;
                smoothCamOffset.current.y += (target.y - smoothCamOffset.current.y) * CAMERA_LERP_SPEED;
            } else {
                smoothCamOffset.current.x += (0 - smoothCamOffset.current.x) * CAMERA_LERP_SPEED;
                smoothCamOffset.current.y += (0 - smoothCamOffset.current.y) * CAMERA_LERP_SPEED;
            }

            // ── Camera positioning: orbit mode (spherical) or pan mode (cartesian) ──
            const orbitAngles = orbitAnglesRef?.current;
            if (orbitAngles) {
                // Orbit mode: camera rotates around origin (0,0,0) at fixed distance
                // Smooth lerp to target angles (0.1 = responsive but smooth)
                const ORBIT_LERP = 0.1;
                smoothOrbitAngles.current.theta += (orbitAngles.theta - smoothOrbitAngles.current.theta) * ORBIT_LERP;
                smoothOrbitAngles.current.phi += (orbitAngles.phi - smoothOrbitAngles.current.phi) * ORBIT_LERP;

                const theta = smoothOrbitAngles.current.theta; // Y-axis rotation
                const phi = smoothOrbitAngles.current.phi;     // polar angle from Z-axis (0 = top-down, π/2 = horizon)
                const radius = camZ; // Current zoom distance from origin

                // Spherical to Cartesian conversion
                const x = radius * Math.sin(phi) * Math.cos(theta);
                const y = radius * Math.sin(phi) * Math.sin(theta);
                const z = radius * Math.cos(phi);

                camera.position.set(x, y, z);
                camera.lookAt(0, 0, 0); // Always look at galaxy center
            } else {
                // Pan mode: camera moves in X/Y plane, looks straight down
                const camX = gestureOffset.x + smoothCamOffset.current.x;
                const camY = gestureOffset.y + smoothCamOffset.current.y;
                camera.position.set(camX, camY, camZ);
                camera.lookAt(camX, camY, 0);
            }

            const showClusters = camZ > LOD_THRESHOLD;
            if (orbGroupRef.current) orbGroupRef.current.visible = !showClusters;
            // Nebula fog always visible (as background atmosphere for orb clusters)
            if (clusterGroupRef.current) clusterGroupRef.current.visible = true;
            if (ambientEdgeGroupRef.current) ambientEdgeGroupRef.current.visible = !showClusters;
            if (focusedEdgeGroupRef.current) focusedEdgeGroupRef.current.visible = !showClusters;
            if (auraGroupRef.current) auraGroupRef.current.visible = !showClusters;

            // Shimmer: visible only at orb level, always active
            if (shimmerLayerRef.current) {
                shimmerLayerRef.current.group.visible = !showClusters;
                if (!showClusters) {
                    shimmerLayerRef.current.update(elapsed);
                }
            }

            // Nebula ring: visible at orb level, hidden at cluster zoom
            if (cosmicFogRef.current) {
                cosmicFogRef.current.group.visible = !showClusters;
                if (!showClusters) {
                    cosmicFogRef.current.update(elapsed, camera.quaternion);
                }
            }

            // ── Animate orbs ─────────────────────────────────────────────
            if (!showClusters && orbGroupRef.current) {
                const selIds = selectedIdsRef.current;
                const hlIds = highlightedIdsRef.current;
                const aiHlIds = aiHighlightRef.current;
                const hasSelection = selIds.size > 0;
                const hasAiHighlight = aiHlIds.size > 0;

                // ── Update fog tint from selected orb color ──────────────
                if (cosmicFogRef.current) {
                    if (hasSelection) {
                        let foundTint = false;
                        for (const child of orbGroupRef.current.children) {
                            if (child instanceof THREE.Group && selIds.has(child.userData.orbId)) {
                                const origCenter = child.userData.origCenter as THREE.Color;
                                if (origCenter) {
                                    cosmicFogRef.current.setTintColor(origCenter);
                                    foundTint = true;
                                }
                                break;
                            }
                        }
                        if (!foundTint) cosmicFogRef.current.setTintColor(null);
                    } else {
                        cosmicFogRef.current.setTintColor(null);
                    }
                }

                for (const child of orbGroupRef.current.children) {
                    if (!(child instanceof THREE.Group)) continue;

                    const orbId = child.userData.orbId;
                    const seed = child.userData.breathSeed || 0;
                    const isSelected = selIds.has(orbId);
                    const isHighlighted = hlIds.has(orbId);
                    const isAiHighlighted = aiHlIds.has(orbId);

                    // ── Spiral animation (first load) ────────────────────────
                    if (child.userData.spiralAnimStart && child.userData.targetPos) {
                        const now = Date.now();
                        const start = child.userData.spiralAnimStart;
                        const duration = child.userData.spiralAnimDuration;
                        const target = child.userData.targetPos;

                        if (now < start) {
                            // Not started yet — stay at center
                            // (already positioned there on creation)
                        } else if (now < start + duration) {
                            // Animating — lerp from center to target
                            const progress = (now - start) / duration;
                            const ease = 1 - Math.pow(1 - progress, 3); // Ease out cubic
                            child.position.x = target.x * ease;
                            child.position.y = target.y * ease;
                            child.position.z = target.z * 0.3 + (target.z - target.z * 0.3) * ease;
                        } else {
                            // Animation complete — snap to target and clear animation data
                            child.position.set(target.x, target.y, target.z);
                            delete child.userData.spiralAnimStart;
                            delete child.userData.spiralAnimDuration;
                            delete child.userData.targetPos;
                        }
                    }

                    const baseZ = child.userData.baseZ ?? child.position.z;
                    if (child.userData.baseZ === undefined) child.userData.baseZ = child.position.z;

                    const zDrift = Math.sin(elapsed * 0.15 + seed * 3) * 0.15;

                    const distFromCam = Math.abs(camZ - (baseZ + zDrift));
                    const depthScale = Math.max(0.7, Math.min(1.3, 40 / Math.max(distFromCam, 10)));

                    const breath = 1 + Math.sin(elapsed * 0.4 + seed) * 0.06;
                    const selScale = isSelected ? 1.3 : 1;
                    const hlPhase = (Math.sin(elapsed * Math.PI * 4) + 1) / 2;
                    const hlPulse = isHighlighted ? 1.5 + hlPhase * 0.8 : 1;
                    // AI highlight: single gentle pulse then settle
                    const aiGlow = isAiHighlighted ? 1.15 : 1;
                    child.scale.setScalar(breath * depthScale * selScale * hlPulse * aiGlow);

                    child.position.z = baseZ + zDrift + (isSelected ? 0.5 : 0);

                    // ── Update shader uniforms ──────────────────────────────
                    const origCenter = child.userData.origCenter as THREE.Color;
                    const origEdge = child.userData.origEdge as THREE.Color;

                    for (const sub of child.children) {
                        if (!(sub instanceof THREE.Mesh)) continue;
                        const mat = sub.material as THREE.ShaderMaterial;
                        if (!mat.uniforms) continue;

                        const isGlow = sub.userData.isGlow;

                        if (isGlow) {
                            // Glow layer: adjust opacity based on selection state
                            if (isSelected || isAiHighlighted) {
                                mat.uniforms.glowOpacity.value = mat.userData?.origGlowOpacity ?? 0.15;
                            } else if (isHighlighted) {
                                mat.uniforms.glowOpacity.value = (mat.userData?.origGlowOpacity ?? 0.15) * 1.5;
                            } else if (hasAiHighlight || hasSelection) {
                                mat.uniforms.glowOpacity.value = 0.0;
                            } else {
                                mat.uniforms.glowOpacity.value = mat.userData?.origGlowOpacity ?? 0.15;
                            }
                        } else {
                            // Core sphere: update color uniforms
                            const origMid = child.userData.origMid;
                            if (isSelected || isAiHighlighted) {
                                mat.uniforms.colorFrom.value.copy(origCenter);
                                if (origMid) mat.uniforms.colorMid.value.copy(origMid);
                                mat.uniforms.colorTo.value.copy(origEdge);
                                mat.uniforms.opacity.value = 1.0;
                            } else if (isHighlighted) {
                                mat.uniforms.colorFrom.value.copy(origCenter);
                                if (hlPhase > 0.5) mat.uniforms.colorFrom.value.multiplyScalar(1.3);
                                if (origMid) mat.uniforms.colorMid.value.copy(origMid);
                                mat.uniforms.colorTo.value.copy(origEdge);
                                mat.uniforms.opacity.value = 1.0;
                            } else if (hasAiHighlight) {
                                mat.uniforms.colorFrom.value.copy(DIM_COLOR).lerp(origCenter, 0.2);
                                if (origMid) mat.uniforms.colorMid.value.copy(DIM_COLOR).lerp(origMid, 0.2);
                                mat.uniforms.colorTo.value.copy(DIM_COLOR).lerp(origEdge, 0.2);
                                mat.uniforms.opacity.value = 0.2;
                            } else if (hasSelection) {
                                mat.uniforms.colorFrom.value.copy(DIM_COLOR).lerp(origCenter, 0.25);
                                if (origMid) mat.uniforms.colorMid.value.copy(DIM_COLOR).lerp(origMid, 0.25);
                                mat.uniforms.colorTo.value.copy(DIM_COLOR).lerp(origEdge, 0.25);
                                mat.uniforms.opacity.value = 0.6;
                            } else {
                                mat.uniforms.colorFrom.value.copy(origCenter);
                                if (origMid) mat.uniforms.colorMid.value.copy(origMid);
                                mat.uniforms.colorTo.value.copy(origEdge);
                                mat.uniforms.opacity.value = 1.0;
                            }
                        }
                    }
                }
            }

            // Ambient edges removed — only shimmer and focused selection edges remain

            // ── Transition aura fade-in animation ───────────────────────
            if (!showClusters && auraGroupRef.current) {
                const now = Date.now();
                for (const child of auraGroupRef.current.children) {
                    if (!(child instanceof THREE.Mesh)) continue;
                    const mat = child.material as THREE.MeshBasicMaterial;
                    const { targetOpacity, fadeStartTime, fadeDuration } = child.userData;
                    const progress = Math.min(1, (now - fadeStartTime) / fadeDuration);
                    const eased = progress * (2 - progress); // ease-out quad
                    mat.opacity = targetOpacity * eased;

                    // Track matching orb position (orbs may breathe/drift)
                    const orbId = child.userData.orbId;
                    const pos = posMapRef.current.get(orbId);
                    if (pos) {
                        // Find the actual orb group to sync z-drift
                        // Aura follows the orb's current position via posMap (static) + small z offset
                        child.position.set(pos.x, pos.y, pos.z - 0.05);
                    }
                }
            }

            // ── Cluster cloud pulse ─────────────────────────────────────
            if (showClusters && clusterGroupRef.current) {
                let clusterIdx = 0;
                for (const child of clusterGroupRef.current.children) {
                    if (child instanceof THREE.Mesh) {
                        if (child.userData.baseScale === undefined) child.userData.baseScale = child.scale.x;
                        const phase = clusterIdx * 1.3;
                        const pulse = 1 + Math.sin(elapsed * 0.18 + phase) * 0.06;
                        const s = child.userData.baseScale * pulse;
                        child.scale.set(s, s, s);
                        clusterIdx++;
                    }
                }
            }

            renderer.render(scene, camera);
            gl.endFrameEXP();
        };

        setSceneReady(true);
        animate();
    }, []);

    // ── Full cleanup on unmount ──────────────────────────────────────────
    useEffect(() => {
        return () => {
            // Cancel render loop
            cancelAnimationFrame(rafIdRef.current);

            // Dispose orbs
            if (orbGroupRef.current) {
                orbGroupRef.current.traverse((child) => {
                    if (child instanceof THREE.Group && child !== orbGroupRef.current) disposeOrbMesh(child);
                });
            }

            // Dispose cluster clouds
            if (clusterGroupRef.current) {
                clusterGroupRef.current.traverse((child) => {
                    if (child instanceof THREE.Mesh) child.material.dispose();
                });
            }

            // Dispose edges (ambient removed, only focused selection edges remain)
            if (focusedEdgeGroupRef.current) disposeEdgeGroup(focusedEdgeGroupRef.current);

            // Dispose auras
            if (auraGroupRef.current) {
                auraGroupRef.current.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        child.geometry.dispose();
                        (child.material as THREE.Material).dispose();
                    }
                });
                auraGroupRef.current = null;
            }

            // Dispose shimmer
            if (shimmerLayerRef.current) {
                shimmerLayerRef.current.dispose();
                shimmerLayerRef.current = null;
            }

            // Dispose nebula ring
            if (cosmicFogRef.current) {
                cosmicFogRef.current.dispose();
                cosmicFogRef.current = null;
            }

            // Dispose renderer
            if (rendererRef.current) rendererRef.current.dispose();

            // Clear scene
            if (sceneRef.current) {
                sceneRef.current.clear();
                sceneRef.current = null;
            }

            // Clear refs
            cameraRef.current = null;
            rendererRef.current = null;
            orbGroupRef.current = null;
            clusterGroupRef.current = null;
            ambientEdgeGroupRef.current = null;
            focusedEdgeGroupRef.current = null;
            glRef.current = null;
        };
    }, []);

    return (
        <View style={styles.container} onLayout={onLayout}>
            <GLView style={styles.glView} onContextCreate={onContextCreate} />
        </View>
    );
}

// Static ref for parent raycast access
GalaxyCanvas._raycast = { current: () => null } as any;

const styles = StyleSheet.create({
    container: { flex: 1 },
    glView: { flex: 1 },
});

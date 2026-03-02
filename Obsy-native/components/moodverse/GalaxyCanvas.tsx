import React, { useRef, useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, LayoutChangeEvent } from 'react-native';
import { GLView, ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer } from 'expo-three';
import * as THREE from 'three';
import { createOrbMesh, createClusterCloud, disposeOrbMesh } from './OrbNode';
import { EDGE_COLORS } from './edgeCompute';
import { createShimmerLayer, ShimmerLayer } from './shimmerLayer';
import type { GalaxyOrb, GalaxyCluster, GalaxyEdge } from './galaxyTypes';

interface GalaxyCanvasProps {
    orbs: GalaxyOrb[];
    clusters: GalaxyCluster[];
    cameraZRef: React.MutableRefObject<number>;
    cameraOffsetRef: React.MutableRefObject<{ x: number; y: number }>;
    isPaused?: boolean;
    selectedIds?: Set<string>;
    highlightedIds?: Set<string>;
    /** Always-visible ambient mesh */
    ambientEdges?: GalaxyEdge[];
    /** On-selection focused edges */
    focusedEdges?: GalaxyEdge[];
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
        const points = curve.getPoints(20);
        const geometry = new THREE.BufferGeometry().setFromPoints(points);

        const semanticColor = EDGE_COLORS[edge.reason] || 0x7c3aed;

        const avgZ = (from.z + to.z) / 2;
        const depthFade = Math.max(0.3, 1.0 - Math.abs(avgZ) * 0.04);

        const opacity = brighten
            ? Math.max(0.2, edge.strength * 0.5 * depthFade)
            : baseOpacity * edge.strength * depthFade;

        const material = new THREE.LineBasicMaterial({
            color: semanticColor,
            transparent: true,
            opacity,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });

        const line = new THREE.Line(geometry, material);
        line.userData = {
            fromId: edge.fromId,
            toId: edge.toId,
            reason: edge.reason,
            strength: edge.strength,
            baseOpacity: opacity,
        };
        group.add(line);
    }

    return group;
}

function disposeEdgeGroup(group: THREE.Group) {
    group.traverse((child) => {
        if (child instanceof THREE.Line) {
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
    isPaused = false,
    selectedIds,
    highlightedIds,
    ambientEdges,
    focusedEdges,
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
    const shimmerLayerRef = useRef<ShimmerLayer | null>(null);
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
        for (const orb of orbs) {
            orbGroup.add(createOrbMesh(orb));
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

        const clusterGroup = new THREE.Group();
        clusterGroup.userData = { type: 'clusterGroup' };
        for (const cluster of clusters) {
            if (cluster.orbs.length === 0) continue;
            const colorCounts: Record<string, number> = {};
            for (const o of cluster.orbs) colorCounts[o.colorFrom] = (colorCounts[o.colorFrom] || 0) + 1;
            const topColor = Object.entries(colorCounts).sort((a, b) => b[1] - a[1])[0][0];
            clusterGroup.add(createClusterCloud(cluster.anchorX, cluster.anchorY, cluster.anchorZ, topColor, cluster.orbs.length));
        }
        scene.add(clusterGroup);
        clusterGroupRef.current = clusterGroup;
    }, [orbs, clusters, sceneReady]);

    // ── Rebuild ambient edges ────────────────────────────────────────────
    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene) return;

        if (ambientEdgeGroupRef.current) {
            disposeEdgeGroup(ambientEdgeGroupRef.current);
            scene.remove(ambientEdgeGroupRef.current);
            ambientEdgeGroupRef.current = null;
        }

        if (!ambientEdges || ambientEdges.length === 0) return;

        const group = buildEdgeGroup(ambientEdges, posMapRef.current, 0.08, false);
        group.userData = { type: 'ambientEdges' };
        scene.add(group);
        ambientEdgeGroupRef.current = group;

        // Update shimmer layer with new edges
        if (shimmerLayerRef.current) {
            shimmerLayerRef.current.setEdges(
                ambientEdges,
                posMapRef.current,
                orbClusterMapRef.current,
            );
        }
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

        const group = buildEdgeGroup(focusedEdges, posMapRef.current, 0.4, true);
        group.userData = { type: 'focusedEdges' };
        scene.add(group);
        focusedEdgeGroupRef.current = group;
    }, [focusedEdges, orbs, sceneReady]);

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

            const camX = gestureOffset.x + smoothCamOffset.current.x;
            const camY = gestureOffset.y + smoothCamOffset.current.y;
            camera.position.set(camX, camY, camZ);
            camera.lookAt(camX, camY, 0);

            const showClusters = camZ > LOD_THRESHOLD;
            if (orbGroupRef.current) orbGroupRef.current.visible = !showClusters;
            if (clusterGroupRef.current) clusterGroupRef.current.visible = showClusters;
            if (ambientEdgeGroupRef.current) ambientEdgeGroupRef.current.visible = !showClusters;
            if (focusedEdgeGroupRef.current) focusedEdgeGroupRef.current.visible = !showClusters;

            // Shimmer: visible only at orb level, always active
            if (shimmerLayerRef.current) {
                shimmerLayerRef.current.group.visible = !showClusters;
                if (!showClusters) {
                    shimmerLayerRef.current.update(elapsed);
                }
            }

            // ── Animate orbs ─────────────────────────────────────────────
            if (!showClusters && orbGroupRef.current) {
                const selIds = selectedIdsRef.current;
                const hlIds = highlightedIdsRef.current;
                const aiHlIds = aiHighlightRef.current;
                const hasSelection = selIds.size > 0;
                const hasAiHighlight = aiHlIds.size > 0;

                for (const child of orbGroupRef.current.children) {
                    if (!(child instanceof THREE.Group)) continue;

                    const orbId = child.userData.orbId;
                    const seed = child.userData.breathSeed || 0;
                    const isSelected = selIds.has(orbId);
                    const isHighlighted = hlIds.has(orbId);
                    const isAiHighlighted = aiHlIds.has(orbId);

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
                            if (isSelected || isAiHighlighted) {
                                mat.uniforms.colorFrom.value.copy(origCenter);
                                mat.uniforms.colorTo.value.copy(origEdge);
                                mat.uniforms.opacity.value = 1.0;
                            } else if (isHighlighted) {
                                mat.uniforms.colorFrom.value.copy(origCenter);
                                if (hlPhase > 0.5) mat.uniforms.colorFrom.value.multiplyScalar(1.3);
                                mat.uniforms.colorTo.value.copy(origEdge);
                                mat.uniforms.opacity.value = 1.0;
                            } else if (hasAiHighlight) {
                                mat.uniforms.colorFrom.value.copy(DIM_COLOR).lerp(origCenter, 0.2);
                                mat.uniforms.colorTo.value.copy(DIM_COLOR).lerp(origEdge, 0.2);
                                mat.uniforms.opacity.value = 0.2;
                            } else if (hasSelection) {
                                mat.uniforms.colorFrom.value.copy(DIM_COLOR).lerp(origCenter, 0.25);
                                mat.uniforms.colorTo.value.copy(DIM_COLOR).lerp(origEdge, 0.25);
                                mat.uniforms.opacity.value = 0.6;
                            } else {
                                mat.uniforms.colorFrom.value.copy(origCenter);
                                mat.uniforms.colorTo.value.copy(origEdge);
                                mat.uniforms.opacity.value = 1.0;
                            }
                        }
                    }
                }
            }

            // ── Dim ambient edges when selection or AI highlight active ──
            if (ambientEdgeGroupRef.current) {
                const hasSelection = selectedIdsRef.current.size > 0;
                const hasAiHl = aiHighlightRef.current.size > 0;
                for (const child of ambientEdgeGroupRef.current.children) {
                    if (child instanceof THREE.Line) {
                        const mat = child.material as THREE.LineBasicMaterial;
                        if (hasAiHl) {
                            // Check if this edge connects AI-highlighted orbs
                            const fromHl = aiHighlightRef.current.has(child.userData.fromId);
                            const toHl = aiHighlightRef.current.has(child.userData.toId);
                            if (fromHl && toHl) {
                                mat.opacity = (child.userData.baseOpacity || 0.08) * 3;
                            } else {
                                mat.opacity = (child.userData.baseOpacity || 0.08) * 0.15;
                            }
                        } else if (hasSelection) {
                            mat.opacity = (child.userData.baseOpacity || 0.08) * 0.2;
                        } else {
                            mat.opacity = child.userData.baseOpacity || 0.08;
                        }
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

            // Dispose edges
            if (ambientEdgeGroupRef.current) disposeEdgeGroup(ambientEdgeGroupRef.current);
            if (focusedEdgeGroupRef.current) disposeEdgeGroup(focusedEdgeGroupRef.current);

            // Dispose shimmer
            if (shimmerLayerRef.current) {
                shimmerLayerRef.current.dispose();
                shimmerLayerRef.current = null;
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

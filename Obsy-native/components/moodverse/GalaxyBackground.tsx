import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { GLView, ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer } from 'expo-three';
import * as THREE from 'three';
import { createOrbMesh, createClusterCloud, disposeOrbMesh } from './OrbNode';
import type { GalaxyOrb, GalaxyCluster } from './galaxyTypes';

interface GalaxyBackgroundProps {
    orbs: GalaxyOrb[];
    clusters: GalaxyCluster[];
    isPaused: boolean;
}

const BACKGROUND_COLOR = 0x050608;
const FOG_NEAR = 40;
const FOG_FAR = 100;
const CAMERA_Z = 34;
const DRIFT_SPEED = 0.015; // ~7 min per full circle
const DRIFT_RADIUS = 1.0;
const CAMERA_OFFSET_X = -4; // shift galaxy to the right on screen

// Minimum XY distance from center — keeps the CTA area clear
const CENTER_CLEAR_RADIUS = 5;

/**
 * Compute push delta for a cluster anchor so it's at least `minRadius` from origin.
 * Returns the delta (dx, dy) to apply to the cluster and all its orbs.
 */
function computeClusterPushDelta(
    anchorX: number,
    anchorY: number,
    minRadius: number,
): { dx: number; dy: number } {
    const dist = Math.sqrt(anchorX * anchorX + anchorY * anchorY);
    if (dist >= minRadius) return { dx: 0, dy: 0 };
    if (dist < 0.01) {
        // Dead center — push rightward
        return { dx: minRadius, dy: 0 };
    }
    const scale = minRadius / dist;
    return {
        dx: anchorX * scale - anchorX,
        dy: anchorY * scale - anchorY,
    };
}

/**
 * Lightweight, non-interactive galaxy renderer for the home screen background.
 *
 * Reuses the same orb/cluster primitives as the full MoodVerse but strips out
 * edges, shimmer, raycasting, selection, and gesture control.
 *
 * Clusters are pushed outward as cohesive units (preserving internal structure)
 * to ring around the CTA capture button.
 */
export function GalaxyBackground({ orbs, clusters, isPaused }: GalaxyBackgroundProps) {
    const [sceneReady, setSceneReady] = useState(false);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const rendererRef = useRef<Renderer | null>(null);
    const orbGroupRef = useRef<THREE.Group | null>(null);
    const clusterGroupRef = useRef<THREE.Group | null>(null);
    const rafIdRef = useRef<number>(0);
    const isPausedRef = useRef(isPaused);

    useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

    // ── Push clusters outward as cohesive units ─────────────────────────
    // Instead of pushing individual orbs (which fragments clusters),
    // compute a single push vector per cluster and apply it uniformly
    // to the cluster anchor and all its orbs.
    const { ringOrbs, ringClusters } = useMemo(() => {
        // Build cluster ID → push delta map
        const clusterDeltas = new Map<string, { dx: number; dy: number }>();
        const pushedClusters: GalaxyCluster[] = [];

        for (const cluster of clusters) {
            const delta = computeClusterPushDelta(
                cluster.anchorX,
                cluster.anchorY,
                CENTER_CLEAR_RADIUS,
            );
            clusterDeltas.set(cluster.id, delta);
            pushedClusters.push(
                delta.dx === 0 && delta.dy === 0
                    ? cluster
                    : {
                        ...cluster,
                        anchorX: cluster.anchorX + delta.dx,
                        anchorY: cluster.anchorY + delta.dy,
                        // Also push orbs within the cluster data
                        orbs: cluster.orbs.map(o => ({
                            ...o,
                            x: o.x + delta.dx,
                            y: o.y + delta.dy,
                        })),
                    },
            );
        }

        // Apply the same delta to each orb based on its cluster membership
        const pushedOrbs = orbs.map((orb) => {
            const delta = clusterDeltas.get(orb.clusterId);
            if (!delta || (delta.dx === 0 && delta.dy === 0)) return orb;
            return { ...orb, x: orb.x + delta.dx, y: orb.y + delta.dy };
        });

        return { ringOrbs: pushedOrbs, ringClusters: pushedClusters };
    }, [orbs, clusters]);

    // ── Rebuild orbs + clusters when data changes ───────────────────────
    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene) return;

        // Dispose old orbs
        if (orbGroupRef.current) {
            orbGroupRef.current.traverse((child) => {
                if (child instanceof THREE.Group && child !== orbGroupRef.current) {
                    disposeOrbMesh(child);
                }
            });
            scene.remove(orbGroupRef.current);
        }

        const orbGroup = new THREE.Group();
        for (const orb of ringOrbs) {
            orbGroup.add(createOrbMesh(orb));
        }
        scene.add(orbGroup);
        orbGroupRef.current = orbGroup;

        // Dispose old clusters
        if (clusterGroupRef.current) {
            clusterGroupRef.current.traverse((child) => {
                if (child instanceof THREE.Mesh) child.material.dispose();
            });
            scene.remove(clusterGroupRef.current);
        }

        // Nebula fog disabled - orbs now scatter within nebula radius instead
        const clusterGroup = new THREE.Group();
        scene.add(clusterGroup);
        clusterGroupRef.current = clusterGroup;
    }, [ringOrbs, ringClusters, sceneReady]);

    // ── GL context + render loop ────────────────────────────────────────
    const onContextCreate = useCallback(async (gl: ExpoWebGLRenderingContext) => {
        const renderer = new Renderer({ gl });
        renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
        renderer.setClearColor(BACKGROUND_COLOR, 1);
        rendererRef.current = renderer;

        const scene = new THREE.Scene();
        scene.fog = new THREE.Fog(BACKGROUND_COLOR, FOG_NEAR, FOG_FAR);
        sceneRef.current = scene;

        const aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
        const camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 300);
        camera.position.set(0, 0, CAMERA_Z);
        camera.lookAt(0, 0, 0);
        cameraRef.current = camera;

        scene.add(new THREE.AmbientLight(0xffffff, 0.4));

        const clock = new THREE.Clock();
        const LOD_THRESHOLD = 60;

        const animate = () => {
            rafIdRef.current = requestAnimationFrame(animate);
            if (isPausedRef.current) return;

            const elapsed = clock.getElapsedTime();

            // Slow auto-drift + horizontal offset
            const driftAngle = elapsed * DRIFT_SPEED;
            const camX = Math.cos(driftAngle) * DRIFT_RADIUS + CAMERA_OFFSET_X;
            const camY = Math.sin(driftAngle) * DRIFT_RADIUS;
            camera.position.set(camX, camY, CAMERA_Z);
            camera.lookAt(camX, camY, 0);

            const showClusters = CAMERA_Z > LOD_THRESHOLD;
            if (orbGroupRef.current) orbGroupRef.current.visible = !showClusters;
            if (clusterGroupRef.current) clusterGroupRef.current.visible = showClusters;

            // ── Orb breathing ───────────────────────────────────────────
            if (!showClusters && orbGroupRef.current) {
                for (const child of orbGroupRef.current.children) {
                    if (!(child instanceof THREE.Group)) continue;

                    const seed = child.userData.breathSeed || 0;
                    const baseZ = child.userData.baseZ ?? child.position.z;
                    if (child.userData.baseZ === undefined) child.userData.baseZ = child.position.z;

                    const zDrift = Math.sin(elapsed * 0.15 + seed * 3) * 0.15;
                    const distFromCam = Math.abs(CAMERA_Z - (baseZ + zDrift));
                    const depthScale = Math.max(0.7, Math.min(1.3, 40 / Math.max(distFromCam, 10)));
                    const breath = 1 + Math.sin(elapsed * 0.4 + seed) * 0.06;

                    child.scale.setScalar(breath * depthScale);
                    child.position.z = baseZ + zDrift;
                }
            }

            // ── Cluster pulse ───────────────────────────────────────────
            if (showClusters && clusterGroupRef.current) {
                let idx = 0;
                for (const child of clusterGroupRef.current.children) {
                    if (child instanceof THREE.Mesh) {
                        if (child.userData.baseScale === undefined) child.userData.baseScale = child.scale.x;
                        const phase = idx * 1.3;
                        const pulse = 1 + Math.sin(elapsed * 0.18 + phase) * 0.06;
                        const s = child.userData.baseScale * pulse;
                        child.scale.set(s, s, s);
                        idx++;
                    }
                }
            }

            renderer.render(scene, camera);
            gl.endFrameEXP();
        };

        setSceneReady(true);
        animate();
    }, []);

    // ── Cleanup on unmount ──────────────────────────────────────────────
    useEffect(() => {
        return () => {
            cancelAnimationFrame(rafIdRef.current);

            if (orbGroupRef.current) {
                orbGroupRef.current.traverse((child) => {
                    if (child instanceof THREE.Group && child !== orbGroupRef.current) {
                        disposeOrbMesh(child);
                    }
                });
            }

            if (clusterGroupRef.current) {
                clusterGroupRef.current.traverse((child) => {
                    if (child instanceof THREE.Mesh) child.material.dispose();
                });
            }

            if (rendererRef.current) rendererRef.current.dispose();

            if (sceneRef.current) {
                sceneRef.current.clear();
                sceneRef.current = null;
            }

            cameraRef.current = null;
            rendererRef.current = null;
            orbGroupRef.current = null;
            clusterGroupRef.current = null;
        };
    }, []);

    return (
        <View style={styles.container}>
            <GLView style={styles.glView} onContextCreate={onContextCreate} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    glView: { flex: 1 },
});

/**
 * shimmerLayer.ts
 *
 * Neuron shimmer — 6 tiny glowing dots traveling along
 * cluster-to-cluster ambient edges. Always active while on page.
 *
 * Uses small THREE.Mesh spheres with MeshBasicMaterial (additive blending)
 * since THREE.Sprite + textures don't work reliably in expo-gl.
 */

import * as THREE from 'three';
import type { GalaxyEdge } from './galaxyTypes';

const MAX_PARTICLES = 6;
const MIN_TRAVEL_MS = 2800;
const MAX_TRAVEL_MS = 5000;
const MIN_DELAY_MS = 400;
const MAX_DELAY_MS = 1800;
const PARTICLE_RADIUS = 0.06;
const PEAK_OPACITY = 0.45;

// Shared geometry — reused across all shimmer dots
const SHARED_SPHERE = new THREE.SphereGeometry(1, 8, 8);

// ── Easing ──────────────────────────────────────────────────────────────

function easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Opacity envelope: fade in first 20%, fade out last 20%, peak in middle */
function opacityEnvelope(t: number): number {
    if (t < 0.2) return (t / 0.2) * PEAK_OPACITY;
    if (t > 0.8) return ((1 - t) / 0.2) * PEAK_OPACITY;
    return PEAK_OPACITY;
}

// ── Particle state ──────────────────────────────────────────────────────

interface ShimmerParticle {
    mesh: THREE.Mesh;
    material: THREE.MeshBasicMaterial;
    curve: THREE.QuadraticBezierCurve3 | null;
    travelDuration: number;
    startTime: number;
    delayUntil: number;
    active: boolean;
}

// ── Edge hash (same as GalaxyCanvas) for consistent curvature ───────────

function edgeHash(fromId: string, toId: string): number {
    let hash = 5381;
    const key = fromId + toId;
    for (let i = 0; i < key.length; i++) {
        hash = ((hash << 5) + hash + key.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
}

function buildCurve(
    from: THREE.Vector3,
    to: THREE.Vector3,
    fromId: string,
    toId: string,
): THREE.QuadraticBezierCurve3 {
    const hash = edgeHash(fromId, toId);
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

    return new THREE.QuadraticBezierCurve3(from, mid, to);
}

// ── Public API ──────────────────────────────────────────────────────────

export interface ShimmerLayer {
    group: THREE.Group;
    /** Call every frame. */
    update: (elapsed: number) => void;
    /** Rebuild edge data when ambient edges change */
    setEdges: (
        edges: GalaxyEdge[],
        posMap: Map<string, THREE.Vector3>,
        orbClusterMap: Map<string, string>,
    ) => void;
    dispose: () => void;
}

export function createShimmerLayer(): ShimmerLayer {
    const group = new THREE.Group();
    group.userData = { type: 'shimmerLayer' };

    let interClusterEdges: Array<{
        edge: GalaxyEdge;
        curve: THREE.QuadraticBezierCurve3;
    }> = [];

    const particles: ShimmerParticle[] = [];

    // Initialize mesh particles
    for (let i = 0; i < MAX_PARTICLES; i++) {
        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        const mesh = new THREE.Mesh(SHARED_SPHERE, material);
        mesh.scale.setScalar(PARTICLE_RADIUS);
        mesh.visible = false;
        group.add(mesh);

        particles.push({
            mesh,
            material,
            curve: null,
            travelDuration: 0,
            startTime: 0,
            delayUntil: 0,
            active: false,
        });
    }

    function assignEdge(p: ShimmerParticle, nowMs: number) {
        if (interClusterEdges.length === 0) {
            p.active = false;
            p.mesh.visible = false;
            return;
        }
        const idx = Math.floor(Math.random() * interClusterEdges.length);
        const { curve } = interClusterEdges[idx];

        // Randomly reverse direction 50% of the time
        if (Math.random() > 0.5) {
            p.curve = new THREE.QuadraticBezierCurve3(curve.v2, curve.v1, curve.v0);
        } else {
            p.curve = curve;
        }

        p.travelDuration = MIN_TRAVEL_MS + Math.random() * (MAX_TRAVEL_MS - MIN_TRAVEL_MS);
        p.delayUntil = nowMs + MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
        p.startTime = 0;
        p.active = true;
        p.mesh.visible = false;
        p.material.opacity = 0;
    }

    function update(elapsed: number) {
        const nowMs = elapsed * 1000;

        for (const p of particles) {
            if (!p.active) {
                assignEdge(p, nowMs);
                continue;
            }

            // Waiting for delay
            if (nowMs < p.delayUntil) continue;

            // Start moving
            if (p.startTime === 0) {
                p.startTime = nowMs;
                p.mesh.visible = true;
            }

            const progress = (nowMs - p.startTime) / p.travelDuration;
            if (progress >= 1 || !p.curve) {
                p.mesh.visible = false;
                p.material.opacity = 0;
                assignEdge(p, nowMs);
                continue;
            }

            const eased = easeInOutCubic(progress);
            const pos = p.curve.getPoint(eased);
            p.mesh.position.copy(pos);
            p.material.opacity = opacityEnvelope(progress);
        }
    }

    function setEdges(
        edges: GalaxyEdge[],
        posMap: Map<string, THREE.Vector3>,
        orbClusterMap: Map<string, string>,
    ) {
        interClusterEdges = [];

        for (const edge of edges) {
            const fromCluster = orbClusterMap.get(edge.fromId);
            const toCluster = orbClusterMap.get(edge.toId);
            if (!fromCluster || !toCluster || fromCluster === toCluster) continue;

            const from = posMap.get(edge.fromId);
            const to = posMap.get(edge.toId);
            if (!from || !to) continue;

            interClusterEdges.push({
                edge,
                curve: buildCurve(from, to, edge.fromId, edge.toId),
            });
        }

        console.log(`[Shimmer] setEdges: ${edges.length} total → ${interClusterEdges.length} inter-cluster`);

        // Stagger initial particles with offsets so they don't all start together
        const nowMs = elapsed_fallback();
        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            p.active = false;
            p.mesh.visible = false;
            p.material.opacity = 0;
            // Stagger: each particle gets an extra offset so they appear at different times
            const staggerMs = i * 600;
            assignEdge(p, nowMs - staggerMs);
        }
    }

    /** Rough ms timestamp for initialization (before clock is available) */
    function elapsed_fallback(): number {
        // Return 0 so first delayUntil = 0 + delay, which will be quickly passed
        // once the clock starts ticking in the render loop
        return 0;
    }

    function dispose() {
        for (const p of particles) {
            p.material.dispose();
        }
        interClusterEdges = [];
    }

    return { group, update, setEdges, dispose };
}

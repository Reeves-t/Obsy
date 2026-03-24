/**
 * cosmicFog.ts — v3
 *
 * Subtle 3-tone fog layer sitting directly over the spiral.
 *
 * Technique: 3 large flat PlaneGeometry quads in the XY plane (same plane as
 * the spiral), each using a pre-baked FBM cloud texture. UV offset scrolls each
 * frame at a different angle and speed — no custom shaders, no InstancedMesh,
 * no per-frame matrix computation. Just 3 draw calls and 3 float additions.
 *
 * Colors: primary / secondary / accent from capture frequency (unchanged rules).
 * Blending: additive — layers mix additively, gaps let orbs show through.
 */

import * as THREE from 'three';
import type { GalaxyOrb } from './galaxyTypes';

// ── Public interface (unchanged) ──────────────────────────────────────────

export interface NebulaRingLayer {
    group: THREE.Group;
    update: (elapsed: number, cameraQuaternion: THREE.Quaternion) => void;
    setTintColor: (color: THREE.Color | null) => void;
    setMoodColors: (orbs: GalaxyOrb[]) => void;
    dispose: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────

const FALLBACK_COLOR  = new THREE.Color('#1a0a2e');
const TINT_LERP_SPEED = 0.025;
const FOG_Z           = 1.5;   // sit just above the orb layer

// 3 fog layers — different sizes, angles, speeds so they drift independently
const LAYER_CONFIGS = [
    { sizeScale: 2.4, scrollAngle: 0.44,  scrollSpeed: 0.028, opacity: 0.130 }, // primary
    { sizeScale: 2.9, scrollAngle: 2.27,  scrollSpeed: 0.018, opacity: 0.100 }, // secondary
    { sizeScale: 2.0, scrollAngle: 4.36,  scrollSpeed: 0.035, opacity: 0.085 }, // accent
] as const;

// ── CPU noise (texture baking only) ──────────────────────────────────────

function hashNoise(ix: number, iy: number): number {
    let h = (ix * 374761393 + iy * 668265263) | 0;
    h = ((h ^ (h >> 13)) * 1274126177) | 0;
    return ((h ^ (h >> 16)) & 0x7fffffff) / 0x7fffffff;
}

function noise2d(x: number, y: number): number {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return hashNoise(ix, iy)     * (1 - sx) * (1 - sy)
         + hashNoise(ix+1, iy)   * sx       * (1 - sy)
         + hashNoise(ix, iy+1)   * (1 - sx) * sy
         + hashNoise(ix+1, iy+1) * sx       * sy;
}

function fbm(x: number, y: number): number {
    return 0.500 * noise2d(x,       y)
         + 0.250 * noise2d(x * 2.0 + 5.2, y * 2.0 + 1.3)
         + 0.125 * noise2d(x * 4.0 + 2.8, y * 4.0 + 7.9)
         + 0.063 * noise2d(x * 8.0 + 9.1, y * 8.0 + 3.4);
}

// ── Fog texture ───────────────────────────────────────────────────────────

/**
 * 256×256 FBM field texture designed to tile with RepeatWrapping.
 * Covers the whole quad with varying cloud density rather than a single centered
 * puff — essential for seamless UV scrolling.
 */
function generateFogTexture(): THREE.DataTexture {
    const size = 256;
    const data = new Uint8Array(size * size * 4);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const u = x / size;
            const v = y / size;

            // Two-pass domain warp for organic cloud shapes
            const warpX = noise2d(u * 4.0 + 1.7, v * 4.0 + 9.2) - 0.5;
            const warpY = noise2d(u * 4.0 + 8.3, v * 4.0 + 2.1) - 0.5;
            const n = fbm(u * 2.5 + warpX * 0.4, v * 2.5 + warpY * 0.4);

            // Threshold + smooth ramp creates distinct patches with soft edges
            const cloudAlpha = Math.max(0, Math.min(1, (n - 0.38) * 3.2));

            // Circular radial falloff — fades to 0 at quad edges so the square
            // shape is never visible. Stays at full strength inside 65% radius,
            // then smooth-steps to 0 at 100% so the fade is gradual not abrupt.
            const cx2 = (u - 0.5) * 2; // -1..1
            const cy2 = (v - 0.5) * 2;
            const dist = Math.sqrt(cx2 * cx2 + cy2 * cy2);
            const fadeStart = 0.65;
            const t = Math.max(0, Math.min(1, (dist - fadeStart) / (1.0 - fadeStart)));
            const edgeFade = 1.0 - t * t * (3.0 - 2.0 * t); // smoothstep
            const alpha = cloudAlpha * edgeFade;

            const idx = (y * size + x) * 4;
            data[idx] = data[idx+1] = data[idx+2] = 255;
            data[idx+3] = Math.floor(alpha * 255);
        }
    }

    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; // required for seamless UV scroll
    tex.needsUpdate = true;
    tex.magFilter = tex.minFilter = THREE.LinearFilter;
    return tex;
}

// ── Color helpers ─────────────────────────────────────────────────────────

function computeFogColors(orbs: GalaxyOrb[]): [THREE.Color, THREE.Color, THREE.Color] {
    if (orbs.length === 0) {
        return [FALLBACK_COLOR.clone(), FALLBACK_COLOR.clone(), FALLBACK_COLOR.clone()];
    }

    const freq = new Map<string, { count: number; colorFrom: string }>();
    for (const orb of orbs) {
        const e = freq.get(orb.moodId);
        if (e) e.count++;
        else freq.set(orb.moodId, { count: 1, colorFrom: orb.colorFrom });
    }

    const sorted = [...freq.entries()].sort((a, b) => b[1].count - a[1].count);

    const primary   = new THREE.Color(sorted[0][1].colorFrom);
    const secondary = sorted.length > 1
        ? new THREE.Color(sorted[1][1].colorFrom)
        : primary.clone().offsetHSL(0.1, 0, 0);
    const accent = sorted.length > 2
        ? new THREE.Color(sorted[Math.floor(2 + Math.random() * (sorted.length - 2))][1].colorFrom)
        : primary.clone().offsetHSL(0.25, 0, 0);

    return [primary, secondary, accent];
}

// ── Fog layer state ───────────────────────────────────────────────────────

interface FogLayer {
    mesh: THREE.Mesh;
    material: THREE.MeshBasicMaterial;
    scrollAngle: number;
    scrollSpeed: number;
}

// ── createNebulaRing ──────────────────────────────────────────────────────

export function createNebulaRing(): NebulaRingLayer {
    const group = new THREE.Group();
    group.userData = { type: 'cosmicFog' };
    // No tilt — fog lies flat in the same XY plane as the spiral

    const fogTex = generateFogTexture();
    const layers: FogLayer[] = [];
    let currentMaxR = 0;

    // Tint state (selection highlight)
    let targetTintStrength  = 0.0;
    let currentTintStrength = 0.0;
    const currentTintColor = new THREE.Color(1, 1, 1);
    const targetTintColor  = new THREE.Color(1, 1, 1);
    const _work = new THREE.Color();

    // ── Build fog quads sized to the spiral ───────────────────────────────

    function buildLayers(maxR: number, colors: [THREE.Color, THREE.Color, THREE.Color]) {
        // Tear down existing
        for (const l of layers) {
            group.remove(l.mesh);
            l.material.dispose();
        }
        layers.length = 0;

        for (let i = 0; i < LAYER_CONFIGS.length; i++) {
            const cfg  = LAYER_CONFIGS[i];
            const size = maxR * cfg.sizeScale;

            // Each quad uses a different UV repeat scale so they don't tile-match
            const uvRepeat = 1.2 + i * 0.35;

            // Boost lightness so the fog reads as luminous glow, not just a tint
            const fogColor = colors[i].clone();
            fogColor.offsetHSL(0, 0.08, 0.18);

            const material = new THREE.MeshBasicMaterial({
                color:       fogColor,
                map:         fogTex,
                transparent: true,
                opacity:     cfg.opacity,
                blending:    THREE.AdditiveBlending,
                depthWrite:  false,
                side:        THREE.DoubleSide,
            });

            // Clone UV transform per layer (texture is shared, offsets are independent)
            material.map = fogTex.clone();
            material.map.wrapS = material.map.wrapT = THREE.RepeatWrapping;
            material.map.repeat.set(uvRepeat, uvRepeat);
            material.map.needsUpdate = true;

            const geo  = new THREE.PlaneGeometry(size, size);
            const mesh = new THREE.Mesh(geo, material);
            mesh.position.set(0, 0, FOG_Z - i * 0.3); // slight Z separation between layers
            mesh.renderOrder = -5;
            mesh.frustumCulled = false;
            group.add(mesh);

            layers.push({
                mesh,
                material,
                scrollAngle: cfg.scrollAngle,
                scrollSpeed: cfg.scrollSpeed,
            });
        }
    }

    // ── setMoodColors ─────────────────────────────────────────────────────

    function setMoodColors(orbs: GalaxyOrb[]) {
        let cx = 0, cy = 0;
        for (const orb of orbs) { cx += orb.x; cy += orb.y; }
        if (orbs.length > 0) { cx /= orbs.length; cy /= orbs.length; }
        group.position.set(cx, cy, 0);

        let maxR = 15;
        for (const orb of orbs) {
            const dx = orb.x - cx, dy = orb.y - cy;
            const r = Math.sqrt(dx * dx + dy * dy);
            if (r > maxR) maxR = r;
        }

        const colors = computeFogColors(orbs);

        if (layers.length === 0 || Math.abs(maxR - currentMaxR) > 3) {
            currentMaxR = maxR;
            buildLayers(maxR, colors);
        } else {
            // Just update colors without rebuilding geometry
            for (let i = 0; i < layers.length; i++) {
                layers[i].material.color.copy(colors[i]).offsetHSL(0, 0.08, 0.18);
            }
        }
    }

    // ── setTintColor ──────────────────────────────────────────────────────

    function setTintColor(color: THREE.Color | null) {
        if (color) {
            targetTintColor.copy(color);
            targetTintStrength = 0.12;
        } else {
            targetTintStrength = 0.0;
        }
    }

    // ── update ────────────────────────────────────────────────────────────

    function update(elapsed: number, _cameraQuaternion: THREE.Quaternion) {
        // Lerp tint
        currentTintStrength += (targetTintStrength - currentTintStrength) * TINT_LERP_SPEED;
        currentTintColor.lerp(targetTintColor, TINT_LERP_SPEED);

        for (const layer of layers) {
            // Scroll UV offset — each layer drifts in its own direction
            if (layer.material.map) {
                layer.material.map.offset.x = elapsed * layer.scrollSpeed * Math.cos(layer.scrollAngle);
                layer.material.map.offset.y = elapsed * layer.scrollSpeed * Math.sin(layer.scrollAngle);
            }

            // Selection tint
            if (currentTintStrength > 0.001) {
                _work.copy(layer.material.color);
                _work.lerp(currentTintColor, currentTintStrength);
                layer.material.color.copy(_work);
            }
        }
    }

    // ── dispose ───────────────────────────────────────────────────────────

    function dispose() {
        fogTex.dispose();
        for (const l of layers) {
            group.remove(l.mesh);
            l.mesh.geometry.dispose();
            if (l.material.map) l.material.map.dispose();
            l.material.dispose();
        }
        layers.length = 0;
    }

    return { group, update, setTintColor, setMoodColors, dispose };
}

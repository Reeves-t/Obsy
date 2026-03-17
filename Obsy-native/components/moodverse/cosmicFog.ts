/**
 * cosmicFog.ts
 *
 * Nebula ring system — structured ring formation wrapping the spiral.
 * Billboard quads with procedural textures (annular gradients + cloud puffs).
 * Mood colors derived from capture frequency — primary/secondary/accent/shadow.
 * No real Three.js PointLights (zero per-pixel lighting cost).
 *
 * Exports:
 *  - createNebulaRing()  — ring nebula (~19 quads), mood-colored
 */

import * as THREE from 'three';
import type { GalaxyOrb } from './galaxyTypes';

// ── Types ────────────────────────────────────────────────────────────────

export interface NebulaRingLayer {
    group: THREE.Group;
    update: (elapsed: number, cameraQuaternion: THREE.Quaternion) => void;
    setTintColor: (color: THREE.Color | null) => void;
    setMoodColors: (orbs: GalaxyOrb[]) => void;
    dispose: () => void;
}

// ── Noise functions ──────────────────────────────────────────────────────

function hashNoise(ix: number, iy: number): number {
    let h = (ix * 374761393 + iy * 668265263) | 0;
    h = ((h ^ (h >> 13)) * 1274126177) | 0;
    return ((h ^ (h >> 16)) & 0x7fffffff) / 0x7fffffff;
}

function noise2d(x: number, y: number): number {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const n00 = hashNoise(ix, iy);
    const n10 = hashNoise(ix + 1, iy);
    const n01 = hashNoise(ix, iy + 1);
    const n11 = hashNoise(ix + 1, iy + 1);
    return n00 * (1 - sx) * (1 - sy) + n10 * sx * (1 - sy) + n01 * (1 - sx) * sy + n11 * sx * sy;
}

function fbm(x: number, y: number, octaves: number): number {
    let value = 0, amplitude = 0.5, frequency = 1;
    for (let i = 0; i < octaves; i++) {
        value += amplitude * noise2d(x * frequency, y * frequency);
        frequency *= 2;
        amplitude *= 0.5;
    }
    return value;
}

// ── Seeded RNG ───────────────────────────────────────────────────────────

function overlayRng(seed: number) {
    let s = seed;
    return () => {
        s = (s * 16807 + 0) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

// ── Shared geometry & constants ──────────────────────────────────────────

const SHARED_PLANE = new THREE.PlaneGeometry(1, 1);
const FALLBACK_COLOR = new THREE.Color('#1a0a2e');
const TINT_LERP_SPEED = 0.03;
const TARGET_TINT_STRENGTH = 0.15;
const RING_TILT_X = 0.12; // ~7° tilt toward camera

// ── Procedural texture generators ────────────────────────────────────────

/** Cloud puff texture (256x256) — dual-warp FBM for organic wispy shapes */
function generateCloudTexture(): THREE.DataTexture {
    const size = 256;
    const data = new Uint8Array(size * size * 4);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const u = x / size;
            const v = y / size;

            const cx = (u - 0.45) * 2.2;
            const cy = (v - 0.52) * 2.0;

            const warp1 = fbm(u * 3 + 7.3, v * 3 + 2.8, 2) * 0.5;
            const warp2x = fbm((u + warp1) * 6 + 13.7, v * 6 + 5.1, 3) * 0.15;
            const warp2y = fbm(u * 6 + 1.9, (v + warp1) * 6 + 9.3, 3) * 0.15;
            const n = fbm((u + warp1 + warp2x) * 4, (v + warp1 + warp2y) * 4, 6);

            const dist = Math.sqrt(cx * cx * 1.2 + cy * cy * 0.9);
            const falloff = Math.max(0, 1 - dist * 0.88);
            const falloffSmooth = falloff * falloff * (3 - 2 * falloff);
            const alpha = Math.max(0, Math.min(1, n * falloffSmooth * 2.8));

            const idx = (y * size + x) * 4;
            data[idx] = 255;
            data[idx + 1] = 255;
            data[idx + 2] = 255;
            data[idx + 3] = Math.floor(alpha * 255);
        }
    }

    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.needsUpdate = true;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    return texture;
}

/**
 * Ring (annular) texture — 256x256.
 * innerR/outerR are in 0-1 UV space (0 = center, 1 = edge of quad).
 * Gaussian falloff at both edges + FBM noise modulation.
 */
function generateRingTexture(
    innerR: number,
    outerR: number,
    noiseAmt: number,
): THREE.DataTexture {
    const size = 256;
    const data = new Uint8Array(size * size * 4);
    // Glowing rim: full brightness at inner edge, exponential fade outward.
    // No ramp-up — light bleeds outward from the spiral edge into space.
    const bandWidth = outerR - innerR;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const u = (x / size) * 2 - 1; // -1 to 1
            const v = (y / size) * 2 - 1;
            const dist = Math.sqrt(u * u + v * v);

            let bandAlpha: number;
            if (dist < innerR) {
                // Inside the ring — hard cutoff, nothing renders
                bandAlpha = 0;
            } else if (dist > outerR) {
                // Beyond outer edge — nothing
                bandAlpha = 0;
            } else {
                // Within band: full bright at inner edge, exponential decay outward
                const t = (dist - innerR) / (bandWidth + 0.001); // 0 at inner, 1 at outer
                bandAlpha = Math.exp(-t * 3.0); // ~1.0 at inner edge, ~0.05 at outer edge
            }

            // Noise modulation for organic variation
            const angle = Math.atan2(v, u);
            const noiseVal = fbm(angle * 2 + 3.7, dist * 8 + 1.2, 4);
            const noiseMod = 1.0 + (noiseVal - 0.5) * noiseAmt;

            const alpha = Math.max(0, Math.min(1, bandAlpha * noiseMod));

            const idx = (y * size + x) * 4;
            data[idx] = 255;
            data[idx + 1] = 255;
            data[idx + 2] = 255;
            data[idx + 3] = Math.floor(alpha * 255);
        }
    }

    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.needsUpdate = true;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    return texture;
}

/** Radial gradient texture — 128x128. Tight center glow with configurable falloff. */
function generateRadialTexture(falloffPower: number): THREE.DataTexture {
    const size = 128;
    const data = new Uint8Array(size * size * 4);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const u = (x / size) * 2 - 1;
            const v = (y / size) * 2 - 1;
            const dist = Math.sqrt(u * u + v * v);
            const alpha = Math.max(0, Math.pow(Math.max(0, 1 - dist), falloffPower));

            const idx = (y * size + x) * 4;
            data[idx] = 255;
            data[idx + 1] = 255;
            data[idx + 2] = 255;
            data[idx + 3] = Math.floor(alpha * 255);
        }
    }

    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.needsUpdate = true;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    return texture;
}

// ── Color helpers ────────────────────────────────────────────────────────

function darkenColor(color: THREE.Color, amount: number): THREE.Color {
    const hsl = { h: 0, s: 0, l: 0 };
    color.getHSL(hsl);
    hsl.l = Math.max(0, hsl.l * (1 - amount));
    return new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l);
}

function brightenColor(color: THREE.Color, amount: number): THREE.Color {
    const hsl = { h: 0, s: 0, l: 0 };
    color.getHSL(hsl);
    hsl.l = Math.min(1, hsl.l + (1 - hsl.l) * amount);
    return new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l);
}

// ── Ring color computation ───────────────────────────────────────────────

// Ring colors derived from user's actual mood data.
// Primary = most captured mood. Secondary = 2nd most.
// Shadow = least captured moods darkened.
// All colors update on year change or data refresh.

interface RingColors {
    primaryFrom: THREE.Color;
    primaryTo: THREE.Color;
    secondaryFrom: THREE.Color;
    secondaryTo: THREE.Color;
    accent: THREE.Color;
    shadows: THREE.Color[];
}

function computeRingColors(orbs: GalaxyOrb[]): RingColors {
    const FB = FALLBACK_COLOR;
    if (orbs.length === 0) {
        return {
            primaryFrom: FB.clone(), primaryTo: FB.clone(),
            secondaryFrom: FB.clone(), secondaryTo: FB.clone(),
            accent: FB.clone(), shadows: [FB.clone()],
        };
    }

    const freq = new Map<string, { count: number; colorFrom: string; colorTo: string }>();
    for (const orb of orbs) {
        const entry = freq.get(orb.moodId);
        if (entry) entry.count++;
        else freq.set(orb.moodId, { count: 1, colorFrom: orb.colorFrom, colorTo: orb.colorTo });
    }

    const sorted = [...freq.entries()].sort((a, b) => b[1].count - a[1].count);

    console.log('[Moodverse Ring] Mood colors by capture frequency:');
    for (let i = 0; i < Math.min(3, sorted.length); i++) {
        const [moodId, { count, colorFrom, colorTo }] = sorted[i];
        const tier = i === 0 ? 'PRIMARY' : i === 1 ? 'SECONDARY' : 'ACCENT';
        console.log(`  ${tier}: moodId="${moodId}" count=${count} from=${colorFrom} to=${colorTo}`);
    }

    const primaryFrom = new THREE.Color(sorted[0][1].colorFrom);
    const primaryTo = new THREE.Color(sorted[0][1].colorTo);
    const secondaryFrom = sorted.length > 1
        ? new THREE.Color(sorted[1][1].colorFrom)
        : primaryFrom.clone();
    const secondaryTo = sorted.length > 1
        ? new THREE.Color(sorted[1][1].colorTo)
        : primaryTo.clone();

    // Accent: random remaining mood
    const accentIdx = sorted.length > 2
        ? Math.floor(2 + Math.random() * (sorted.length - 2))
        : 0;
    const accent = new THREE.Color(sorted[accentIdx][1].colorFrom);

    // Shadows: bottom 2-3 least captured moods, darkened 60%
    const shadows: THREE.Color[] = [];
    const sortedAsc = [...freq.entries()].sort((a, b) => a[1].count - b[1].count);
    for (let i = 0; i < Math.min(3, sortedAsc.length); i++) {
        shadows.push(darkenColor(new THREE.Color(sortedAsc[i][1].colorFrom), 0.60));
    }

    console.log(`[Moodverse Ring] Shadow moods (bottom ${shadows.length}):`);
    for (let i = 0; i < Math.min(3, sortedAsc.length); i++) {
        const [moodId, { count, colorFrom }] = sortedAsc[i];
        console.log(`  SHADOW ${i + 1}: moodId="${moodId}" count=${count} from=${colorFrom}`);
    }

    return { primaryFrom, primaryTo, secondaryFrom, secondaryTo, accent, shadows };
}

// ══════════════════════════════════════════════════════════════════════════
// Nebula Ring — ~19 billboard quads forming a ring nebula around the spiral
// ══════════════════════════════════════════════════════════════════════════

type QuadRole =
    | 'halo'
    | 'body'
    | 'bodyInner'
    | 'patch'
    | 'innerGlow'
    | 'tendril'
    | 'centerTint'
    | 'starlight';

interface RingQuad {
    mesh: THREE.Mesh;
    material: THREE.MeshBasicMaterial;
    role: QuadRole;
    baseOpacity: number;
    breathPhase: number;
    baseRotation: number; // For tendrils — z-rotation after billboard
    scaleX: number;
    scaleY: number;
}

export function createNebulaRing(): NebulaRingLayer {
    const group = new THREE.Group();
    group.userData = { type: 'nebulaRing' };
    group.rotation.x = RING_TILT_X;

    // Shared textures (size-independent)
    const cloudTex = generateCloudTexture();
    const radialTex = generateRadialTexture(3.0);
    const starlightTex = generateRadialTexture(6.0);

    // Size-dependent ring textures (regenerated when spiral size changes)
    let haloTex: THREE.DataTexture | null = null;
    let bodyTex: THREE.DataTexture | null = null;
    let innerGlowTex: THREE.DataTexture | null = null;

    const quads: RingQuad[] = [];
    let currentMaxR = 0;

    // ── Tint state ───────────────────────────────────────────────────────
    let targetTintStrength = 0.0;
    let currentTintStrength = 0.0;
    const currentTintColor = new THREE.Color(1, 1, 1);
    const targetTintColor = new THREE.Color(1, 1, 1);
    const _workColor = new THREE.Color();

    // ── Color state for per-frame use ────────────────────────────────────
    let ringColors: RingColors | null = null;

    // ── Quad builder ─────────────────────────────────────────────────────

    function addQuad(
        role: QuadRole,
        texture: THREE.DataTexture,
        color: THREE.Color,
        opacity: number,
        sizeX: number,
        sizeY: number,
        px: number, py: number, pz: number,
        renderOrder: number,
        rand: () => number,
        rotation: number = 0,
        blending: THREE.Blending = THREE.AdditiveBlending,
    ): RingQuad {
        const material = new THREE.MeshBasicMaterial({
            color: color.clone(),
            map: texture,
            transparent: true,
            opacity,
            depthWrite: false,
            blending,
            side: THREE.DoubleSide,
        });

        const mesh = new THREE.Mesh(SHARED_PLANE, material);
        mesh.scale.set(sizeX, sizeY, 1);
        mesh.position.set(px, py, pz);
        mesh.renderOrder = renderOrder;
        mesh.frustumCulled = false;

        const quad: RingQuad = {
            mesh, material, role,
            baseOpacity: opacity,
            breathPhase: rand() * Math.PI * 2,
            baseRotation: rotation,
            scaleX: sizeX,
            scaleY: sizeY,
        };
        quads.push(quad);
        group.add(mesh);
        return quad;
    }

    // ── Build ring geometry sized to spiral ───────────────────────────────

    function buildRing(maxR: number) {
        // Dispose old quads
        for (const q of quads) {
            group.remove(q.mesh);
            q.material.dispose();
        }
        quads.length = 0;

        // Dispose old size-dependent textures
        if (haloTex) haloTex.dispose();
        if (bodyTex) bodyTex.dispose();
        if (innerGlowTex) innerGlowTex.dispose();

        // ── Compute world radii from spiral bounds ───────────────────────
        // Ring hugs the outermost orb — innerHollow barely clears it.
        const innerHollow = maxR + 0;   // Start of ring band (exactly at outermost orb)
        const innerEdge   = maxR + 2;   // Inner bright rim
        const bodyOuter   = maxR + 8;   // Main body outer edge
        const haloOuter   = maxR + 14;  // Atmospheric halo outer edge

        // ── Generate ring textures with correct UV ratios ────────────────
        // Each ring texture quad is sized so its outer world radius fits.
        // UV radius = worldRadius / quadHalfSize

        // Halo
        const haloHalf = haloOuter * 1.02;
        const haloSize = haloHalf * 2;
        haloTex = generateRingTexture(
            bodyOuter / haloHalf,     // inner UV — starts where body ends
            haloOuter / haloHalf,     // outer UV
            0.6,
        );

        // Body
        const bodyHalf = bodyOuter * 1.02;
        const bodySize = bodyHalf * 2;
        bodyTex = generateRingTexture(
            innerHollow / bodyHalf,   // inner UV
            bodyOuter / bodyHalf,     // outer UV
            0.8,
        );

        // Inner glow (thin bright rim hugging the inner edge)
        const glowOuterWorld = innerEdge + 2;
        const glowInnerWorld = Math.max(maxR, innerEdge - 1.5);
        const glowHalf = glowOuterWorld * 1.02;
        const glowSize = glowHalf * 2;
        innerGlowTex = generateRingTexture(
            glowInnerWorld / glowHalf,  // inner UV
            glowOuterWorld / glowHalf,  // outer UV
            0.4,
        );

        // Deterministic RNG for quad placement
        const rand = overlayRng(42);

        // ── Layer 1: Outer atmospheric halo ──────────────────────────────
        addQuad('halo', haloTex, FALLBACK_COLOR, 0.30,
            haloSize, haloSize, 0, 0, 0, -3, rand);

        // ── Layer 2: Main ring body (2 overlapping for organic feel) ─────
        addQuad('body', bodyTex, FALLBACK_COLOR, 0.62,
            bodySize, bodySize, 0.5, -0.3, 0, -2, rand);
        addQuad('bodyInner', bodyTex, FALLBACK_COLOR, 0.55,
            bodySize * 0.98, bodySize * 0.98, -0.5, 0.3, 0.1, -2, rand);

        // ── Layer 2: Bright patches on ring band ─────────────────────────
        const PATCH_COUNT = 7;
        const patchBandCenter = innerHollow + (bodyOuter - innerHollow) * 0.35;
        for (let i = 0; i < PATCH_COUNT; i++) {
            const angle = (i / PATCH_COUNT) * Math.PI * 2 + rand() * 0.5;
            const r = patchBandCenter + (rand() - 0.5) * 3;
            const px = Math.cos(angle) * r;
            const py = Math.sin(angle) * r;
            const patchSize = 6 + rand() * 4;
            const patchOpacity = 0.30 + rand() * 0.10;
            addQuad('patch', cloudTex, FALLBACK_COLOR, patchOpacity,
                patchSize, patchSize, px, py, 0.2, -2, rand);
        }

        // ── Layer 3: Inner ring edge glow ────────────────────────────────
        addQuad('innerGlow', innerGlowTex!, FALLBACK_COLOR, 0.52,
            glowSize, glowSize, 0, 0, 0.05, -1, rand);

        // ── Layer 4: Wispy tendrils extending outward from ring ──────────
        const TENDRIL_COUNT = 6;
        for (let i = 0; i < TENDRIL_COUNT; i++) {
            const angle = (i / TENDRIL_COUNT) * Math.PI * 2 + rand() * 0.8;
            const anchorR = bodyOuter + rand() * 2;
            const tendrilLength = 8 + rand() * 6;
            const tendrilWidth = 2 + rand() * 2;
            const midR = anchorR + tendrilLength * 0.5;
            const px = Math.cos(angle) * midR;
            const py = Math.sin(angle) * midR;
            const tendrilOpacity = 0.15 + rand() * 0.10;
            addQuad('tendril', cloudTex, FALLBACK_COLOR, tendrilOpacity,
                tendrilWidth, tendrilLength, px, py, 0, -2, rand,
                angle + Math.PI / 2);
        }

        // ── Hollow center: very faint atmospheric tint ───────────────────
        const centerSize = innerHollow * 2;
        addQuad('centerTint', radialTex, FALLBACK_COLOR, 0.07,
            centerSize, centerSize, 0, 0, -0.1, -2, rand);

        // ── Starlight core ───────────────────────────────────────────────
        addQuad('starlight', starlightTex, new THREE.Color('#FFF5C0'), 0.24,
            7, 7, 0, 0, 0, 0, rand);

        console.log(`[Moodverse Ring] Built ring: maxSpiralR=${maxR.toFixed(1)}, innerHollow=${innerHollow.toFixed(1)}, bodyOuter=${bodyOuter.toFixed(1)}, haloOuter=${haloOuter.toFixed(1)}, quads=${quads.length}`);
    }

    // ── API ──────────────────────────────────────────────────────────────

    function setMoodColors(orbs: GalaxyOrb[]) {
        // Compute spiral centroid
        let cx = 0, cy = 0, cz = 0;
        for (const orb of orbs) { cx += orb.x; cy += orb.y; cz += orb.z; }
        if (orbs.length > 0) { cx /= orbs.length; cy /= orbs.length; cz /= orbs.length; }

        // Center ring group on spiral centroid
        group.position.set(cx, cy, cz);

        // Compute max spiral radius from centroid (not world origin)
        let maxR = 20; // Fallback for very small datasets
        for (const orb of orbs) {
            const dx = orb.x - cx, dy = orb.y - cy;
            const r = Math.sqrt(dx * dx + dy * dy);
            if (r > maxR) maxR = r;
        }

        console.log('[Moodverse Ring] maxSpiralRadius:', maxR, 'centroid:', cx.toFixed(2), cy.toFixed(2), cz.toFixed(2), 'orbCount:', orbs.length);

        // Rebuild ring if spiral size changed or first call
        if (quads.length === 0 || Math.abs(maxR - currentMaxR) > 2) {
            currentMaxR = maxR;
            buildRing(maxR);
        }

        // Apply mood colors
        ringColors = computeRingColors(orbs);

        let tendrilIdx = 0;
        for (const q of quads) {
            switch (q.role) {
                case 'halo':
                    q.material.color.copy(ringColors.primaryFrom);
                    break;
                case 'body':
                    q.material.color.copy(ringColors.primaryFrom);
                    break;
                case 'bodyInner':
                    q.material.color.copy(ringColors.primaryFrom).lerp(ringColors.secondaryFrom, 0.6);
                    break;
                case 'patch':
                    q.material.color.copy(brightenColor(ringColors.primaryTo, 0.15));
                    break;
                case 'innerGlow':
                    q.material.color.copy(brightenColor(ringColors.secondaryFrom, 0.2));
                    break;
                case 'tendril': {
                    if (tendrilIdx % 2 === 0) {
                        q.material.color.copy(ringColors.accent);
                    } else {
                        const shadowIdx = (tendrilIdx >> 1) % Math.max(1, ringColors.shadows.length);
                        q.material.color.copy(ringColors.shadows[shadowIdx] ?? FALLBACK_COLOR);
                    }
                    tendrilIdx++;
                    break;
                }
                case 'centerTint':
                    q.material.color.copy(ringColors.secondaryTo);
                    break;
                case 'starlight':
                    break;
            }
        }
    }

    function setTintColor(color: THREE.Color | null) {
        if (color) {
            targetTintColor.copy(color);
            targetTintStrength = TARGET_TINT_STRENGTH;
        } else {
            targetTintStrength = 0.0;
        }
    }

    function update(elapsed: number, cameraQuaternion: THREE.Quaternion) {
        // Lerp tint
        currentTintStrength += (targetTintStrength - currentTintStrength) * TINT_LERP_SPEED;
        currentTintColor.lerp(targetTintColor, TINT_LERP_SPEED);

        for (const q of quads) {
            // Billboard: face camera
            q.mesh.quaternion.copy(cameraQuaternion);

            // Tendrils: re-apply rotation after billboard
            if (q.baseRotation !== 0) {
                q.mesh.rotateZ(q.baseRotation);
            }

            // Breathing (patches + tendrils only — ring layers stay steady)
            if (q.role === 'patch' || q.role === 'tendril') {
                const breath = Math.sin(elapsed * 0.3 + q.breathPhase) * 0.5 + 0.5;
                q.material.opacity = q.baseOpacity * (0.7 + breath * 0.3);

                const scalePulse = 1.0 + Math.sin(elapsed * 0.2 + q.breathPhase * 1.3) * 0.05;
                q.mesh.scale.set(q.scaleX * scalePulse, q.scaleY * scalePulse, 1);
            }

            // Starlight: very gentle pulse
            if (q.role === 'starlight') {
                const glow = Math.sin(elapsed * 0.4 + 1.5) * 0.5 + 0.5;
                q.material.opacity = q.baseOpacity * (0.85 + glow * 0.15);
            }

            // Selection tint (skip starlight — always warm white)
            if (q.role !== 'starlight' && currentTintStrength > 0.001) {
                _workColor.copy(q.material.color);
                _workColor.lerp(currentTintColor, currentTintStrength);
                q.material.color.copy(_workColor);
            }
        }
    }

    function dispose() {
        if (haloTex) haloTex.dispose();
        if (bodyTex) bodyTex.dispose();
        if (innerGlowTex) innerGlowTex.dispose();
        cloudTex.dispose();
        radialTex.dispose();
        starlightTex.dispose();
        for (const q of quads) {
            q.material.dispose();
        }
        quads.length = 0;
    }

    return { group, update, setTintColor, setMoodColors, dispose };
}

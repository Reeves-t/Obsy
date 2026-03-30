import * as THREE from 'three';
import type { GalaxyOrb } from './galaxyTypes';

// Shared geometries — reused across all instances (unit spheres, scaled per orb)
const SHARED_SPHERE = new THREE.SphereGeometry(1, 64, 64); // High-res for smooth appearance at close range
const SHARED_GLOW_SPHERE = new THREE.SphereGeometry(1, 12, 12);
const SHARED_CLUSTER_SPHERE = new THREE.SphereGeometry(1, 12, 12);

// ── Size hierarchy ──────────────────────────────────────────────────────
const RADIUS_MIN = 0.12;  // 2x original base size for spiral formation
const RADIUS_MAX = 0.44;  // 2x original base size for spiral formation

// ── Orb types ───────────────────────────────────────────────────────────
type OrbType = 'bright' | 'soft' | 'faint';

interface OrbTypeConfig {
    coreLightness: number;  // how much to brighten center toward white
    edgeDarkness: number;   // how much to darken edge toward black
    specularIntensity: number; // brightness of specular highlight
    glowOpacity: number;    // outer glow opacity
}

const ORB_TYPES: Record<OrbType, OrbTypeConfig> = {
    bright: { coreLightness: 0.55, edgeDarkness: 0.2, specularIntensity: 0.7, glowOpacity: 0.18 },
    soft:   { coreLightness: 0.4,  edgeDarkness: 0.3, specularIntensity: 0.45, glowOpacity: 0.12 },
    faint:  { coreLightness: 0.25, edgeDarkness: 0.4, specularIntensity: 0.25, glowOpacity: 0.08 },
};

/** Simple hash to pick orb type deterministically */
function getOrbType(orbId: string): OrbType {
    let hash = 0;
    for (let i = 0; i < orbId.length; i++) {
        hash = ((hash << 5) - hash + orbId.charCodeAt(i)) | 0;
    }
    const bucket = Math.abs(hash) % 10;
    if (bucket < 3) return 'bright';
    if (bucket < 7) return 'soft';
    return 'faint';
}

/** Darken a color toward black by mixing factor (0 = original, 1 = black) */
function darken(color: THREE.Color, factor: number): THREE.Color {
    return new THREE.Color().copy(color).lerp(new THREE.Color(0x000000), factor);
}

/** Brighten a color toward white by mixing factor (0 = original, 1 = white) */
function brighten(color: THREE.Color, factor: number): THREE.Color {
    return new THREE.Color().copy(color).lerp(new THREE.Color(0xffffff), factor);
}

/** Increase saturation of a color */
function saturate(color: THREE.Color, factor: number): THREE.Color {
    const hsl = { h: 0, s: 0, l: 0 };
    color.getHSL(hsl);
    hsl.s = Math.min(1.0, hsl.s * factor);
    return new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l);
}

// ── Core orb shader with specular highlight (GLSL ES 1.0 / WebGL 1.0) ──

const VERTEX_SHADER = `
varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec3 vWorldPosition;

void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = mvPosition.xyz;
    vNormal = normalize(normalMatrix * normal);
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * mvPosition;
}
`;

const FRAGMENT_SHADER = `
uniform vec3 colorFrom;
uniform vec3 colorMid;
uniform vec3 colorTo;
uniform float specularIntensity;
uniform float opacity;
uniform float effectType; // 0 grain, 1 splash, 2 streak
uniform float grainOpacity;
uniform vec3 splashColor;
uniform vec2 splashCenter;
uniform float splashRadius;
uniform float splashOpacity;
uniform float streakAngle;
uniform float streakCount;
uniform float streakOpacity;
uniform vec3 streakColor;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;

varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec3 vWorldPosition;

float random(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    vec3 viewDir = normalize(-vViewPosition);
    float facing = clamp(dot(vNormal, viewDir), 0.0, 1.0);
    vec2 orbUv = normalize(vNormal).xy * 0.5 + 0.5;

    // ── 3-tone marble interior ───────────────────────────────────────
    // Radial 3-stop gradient: primary (center) → mid → secondary (edge)
    // Matches the SVG/design system: 0% = primary, 50% = mid, 100% = secondary

    // Radial factor: core-to-edge falloff (0 = center, 1 = edge)
    float radial = 1.0 - pow(facing, 0.6);

    // 3-stop blend: primary → mid in first half, mid → secondary in second half
    vec3 color;
    if (radial < 0.5) {
        color = mix(colorFrom, colorMid, radial * 2.0);
    } else {
        color = mix(colorMid, colorTo, (radial - 0.5) * 2.0);
    }

    // Specular highlight — offset slightly from center to simulate a light source
    // Light direction: upper-left
    vec3 lightDir = normalize(vec3(-0.4, 0.6, 0.7));
    float specAngle = max(0.0, dot(vNormal, lightDir));
    // Sharp specular falloff for a small, bright hotspot
    float specular = pow(specAngle, 32.0) * specularIntensity;
    color += vec3(specular);

    // Secondary softer rim-light on the opposite side for depth
    vec3 rimLightDir = normalize(vec3(0.3, -0.3, 0.5));
    float rimAngle = max(0.0, dot(vNormal, rimLightDir));
    float rimSpec = pow(rimAngle, 16.0) * specularIntensity * 0.3;
    color += vec3(rimSpec);

    // ── Surface effects (assigned once per orb and persisted) ───────────
    if (effectType < 0.5) {
        // Grain
        float grain = random(orbUv * 240.0);
        color += (grain - 0.5) * (grainOpacity * 0.7);
    } else if (effectType < 1.5) {
        // Color splash
        float d = distance(orbUv, splashCenter);
        float mask = 1.0 - smoothstep(0.0, splashRadius, d);
        float softened = smoothstep(0.0, 1.0, mask);
        color = mix(color, splashColor, softened * splashOpacity);
    } else {
        // Streak / aurora
        float angle = radians(streakAngle);
        vec2 dir = vec2(cos(angle), sin(angle));
        float coord = dot(orbUv - 0.5, dir);
        float pattern = 0.0;

        for (int i = 0; i < 4; i++) {
            if (float(i) >= streakCount) break;
            float f = float(i);
            float offset = (f - (streakCount - 1.0) * 0.5) * 0.12 + 0.02 * sin(f * 3.7);
            float streak = smoothstep(0.05, 0.0, abs(coord - offset));
            pattern += streak;
        }

        pattern = clamp(pattern, 0.0, 1.0);
        color = mix(color, streakColor, pattern * streakOpacity);
    }

    // Linear fog (matches scene fog)
    float fogDepth = length(vViewPosition);
    float fogFactor = smoothstep(fogNear, fogFar, fogDepth);
    color = mix(color, fogColor, fogFactor);

    gl_FragColor = vec4(color, opacity);
}
`;

// ── Outer glow shader ──────────────────────────────────────────────────

const GLOW_VERTEX_SHADER = `
varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = mvPosition.xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mvPosition;
}
`;

const GLOW_FRAGMENT_SHADER = `
uniform vec3 glowColor;
uniform float glowOpacity;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;

varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
    vec3 viewDir = normalize(-vViewPosition);
    float facing = clamp(dot(vNormal, viewDir), 0.0, 1.0);

    // Inverse rim: bright at edges, transparent at center
    // This creates the "glow into the void" effect
    float rim = 1.0 - facing;
    float glow = pow(rim, 2.0);

    // Fog
    float fogDepth = length(vViewPosition);
    float fogFactor = smoothstep(fogNear, fogFar, fogDepth);
    vec3 color = mix(glowColor, fogColor, fogFactor);

    float alpha = glow * glowOpacity * (1.0 - fogFactor);
    gl_FragColor = vec4(color, alpha);
}
`;

/**
 * Creates a Three.js Group for a single galaxy orb.
 *
 * Renders with:
 * - Core sphere: dual-tone marble interior using the mood's color pair
 *   (from = primary 75% dominant, to = secondary 25% accent with angular bias)
 * - Specular highlight: small bright spot offset from center simulating
 *   a light source for the sphere illusion
 * - Outer glow: soft additive halo matching the primary mood color
 */
export function createOrbMesh(orb: GalaxyOrb): THREE.Group {
    const group = new THREE.Group();

    const orbType = getOrbType(orb.id);
    const config = ORB_TYPES[orbType];

    const radius = RADIUS_MIN + orb.richness * (RADIUS_MAX - RADIUS_MIN);

    // Derive 3-tone colors from mood's gradient triple
    const fromColor = new THREE.Color(orb.colorFrom);
    const midColor  = new THREE.Color(orb.colorMid);
    const toColor   = new THREE.Color(orb.colorTo);

    // Primary color (center): brighten and saturate for glowing center
    const coreColor = brighten(saturate(fromColor, 1.2), config.coreLightness);
    // Mid color: subtle boost to keep the transition visible
    const midProcessed = saturate(midColor, 1.1);
    // Secondary color (edge): saturate to preserve hue contrast, darken less
    const edgeColor = saturate(darken(toColor, config.edgeDarkness * 0.6), 1.15);
    const effect: NonNullable<GalaxyOrb['orbEffect']> = orb.orbEffect ?? { type: 'grain', grainOpacity: 0.1 };
    const streakColor = brighten(fromColor, 0.25);
    const effectType = effect.type === 'splash' ? 1 : effect.type === 'streak' ? 2 : 0;

    // ── Core sphere ─────────────────────────────────────────────────────
    const coreMaterial = new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        uniforms: {
            colorFrom: { value: coreColor },
            colorMid:  { value: midProcessed },
            colorTo:   { value: edgeColor },
            specularIntensity: { value: config.specularIntensity },
            opacity: { value: 1.0 },
            effectType: { value: effectType },
            grainOpacity: { value: effect.grainOpacity ?? 0.1 },
            splashColor: { value: new THREE.Color(effect.splashColor ?? '#84C1C4') },
            splashCenter: {
                value: new THREE.Vector2(
                    0.5 + (effect.splashOffsetX ?? 0.14),
                    0.5 + (effect.splashOffsetY ?? -0.12),
                ),
            },
            splashRadius: { value: effect.splashRadius ?? 0.14 },
            splashOpacity: { value: effect.splashOpacity ?? 0.22 },
            streakAngle: { value: effect.streakAngle ?? 38.0 },
            streakCount: { value: effect.streakCount ?? 3 },
            streakOpacity: { value: effect.streakOpacity ?? 0.16 },
            streakColor: { value: streakColor },
            fogColor: { value: new THREE.Color(0x050608) },
            fogNear: { value: 40.0 },
            fogFar: { value: 120.0 },
        },
        transparent: true,
        depthWrite: true,
    });

    const coreMesh = new THREE.Mesh(SHARED_SPHERE, coreMaterial);
    coreMesh.scale.setScalar(radius);
    coreMesh.userData = { isCore: true };
    group.add(coreMesh);

    // Outer glow layer removed — orb's internal gradient provides sufficient glow

    group.position.set(orb.x, orb.y, orb.z);
    group.userData = {
        orbId: orb.id,
        moodId: orb.moodId,
        moodLabel: orb.moodLabel,
        colorHex: orb.colorSolid,
        colorFromHex: orb.colorFrom,
        colorMidHex: orb.colorMid,
        colorToHex: orb.colorTo,
        timestamp: orb.timestamp,
        tags: orb.tags,
        notePreview: orb.notePreview,
        breathSeed: Math.random() * Math.PI * 2,
        radius,
        orbType,
        // Original shader colors (for restore after dim/highlight)
        origCenter: coreColor.clone(),
        origMid: midProcessed.clone(),
        origEdge: edgeColor.clone(),
        orbEffect: effect,
    };

    return group;
}

/**
 * Creates a subtle nebula fog mesh for each month cluster.
 * Renders as a soft, volumetric cloud with the blended average color of the month's moods.
 */
export function createClusterCloud(
    x: number,
    y: number,
    z: number,
    color: string,
    orbCount: number,
    nebulaRadius?: number,
): THREE.Mesh {
    const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(color),
        transparent: true,
        opacity: 0.12, // Subtle but visible fog (12%)
        depthWrite: false, // Allow fog to blend softly behind orbs
        side: THREE.FrontSide,
        blending: THREE.NormalBlending,
    });
    const mesh = new THREE.Mesh(SHARED_CLUSTER_SPHERE, material);
    // Large soft sphere ~1.5x the cluster scatter radius
    const size = nebulaRadius ? nebulaRadius * 1.5 : Math.min(8, 3.5 + orbCount * 0.12);
    mesh.scale.set(size, size, size * 0.8); // Slightly flattened cloud
    mesh.renderOrder = -1; // Render behind orbs
    mesh.position.set(x, y, z);
    mesh.userData = { isCluster: true, isNebula: true };
    return mesh;
}

/**
 * Disposes all materials in an orb group.
 */
export function disposeOrbMesh(group: THREE.Group): void {
    group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
            child.material.dispose();
        }
    });
}

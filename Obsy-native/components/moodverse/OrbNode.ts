import * as THREE from 'three';
import type { GalaxyOrb } from './galaxyTypes';

// Shared geometries — reused across all instances (unit spheres, scaled per orb)
const SHARED_SPHERE = new THREE.SphereGeometry(1, 16, 16);
const SHARED_GLOW_SPHERE = new THREE.SphereGeometry(1, 12, 12);
const SHARED_CLUSTER_SPHERE = new THREE.SphereGeometry(1, 12, 12);

// ── Size hierarchy ──────────────────────────────────────────────────────
const RADIUS_MIN = 0.06;
const RADIUS_MAX = 0.22;

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
uniform vec3 colorTo;
uniform float specularIntensity;
uniform float opacity;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;

varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
    vec3 viewDir = normalize(-vViewPosition);
    float facing = clamp(dot(vNormal, viewDir), 0.0, 1.0);

    // Radial gradient: lighter/saturated core -> deeper/darker edge
    // Use a steeper curve so the bright core is concentrated
    float t = 1.0 - pow(facing, 0.55);
    vec3 color = mix(colorFrom, colorTo, t);

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
 * - Core sphere: radial gradient using the mood's two-tone color pair
 *   (from = lighter/saturated core, to = deeper/darker edge)
 * - Specular highlight: small bright spot offset from center simulating
 *   a light source for the sphere illusion
 * - Outer glow: soft additive halo matching the base mood color
 */
export function createOrbMesh(orb: GalaxyOrb): THREE.Group {
    const group = new THREE.Group();

    const orbType = getOrbType(orb.id);
    const config = ORB_TYPES[orbType];

    const radius = RADIUS_MIN + orb.richness * (RADIUS_MAX - RADIUS_MIN);

    // Derive center + edge colors from mood's two-tone gradient pair
    const fromColor = new THREE.Color(orb.colorFrom);
    const toColor = new THREE.Color(orb.colorTo);

    // Core color: brighten and saturate the "from" color for the glowing center
    const coreColor = brighten(saturate(fromColor, 1.2), config.coreLightness);
    // Edge color: darken the "to" color for the deep outer ring
    const edgeColor = darken(toColor, config.edgeDarkness);

    // ── Core sphere ─────────────────────────────────────────────────────
    const coreMaterial = new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        uniforms: {
            colorFrom: { value: coreColor },
            colorTo: { value: edgeColor },
            specularIntensity: { value: config.specularIntensity },
            opacity: { value: 1.0 },
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

    // ── Outer glow layer ────────────────────────────────────────────────
    // Slightly larger sphere with inverted rim lighting and additive blending
    const glowColor = new THREE.Color(orb.colorFrom);
    const glowMaterial = new THREE.ShaderMaterial({
        vertexShader: GLOW_VERTEX_SHADER,
        fragmentShader: GLOW_FRAGMENT_SHADER,
        uniforms: {
            glowColor: { value: glowColor },
            glowOpacity: { value: config.glowOpacity },
            fogColor: { value: new THREE.Color(0x050608) },
            fogNear: { value: 40.0 },
            fogFar: { value: 120.0 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
    });

    // Store original glow opacity for animation restore
    glowMaterial.userData = { origGlowOpacity: config.glowOpacity };

    const glowMesh = new THREE.Mesh(SHARED_GLOW_SPHERE, glowMaterial);
    // Glow sphere is 60% larger than core for soft halo
    glowMesh.scale.setScalar(radius * 1.6);
    glowMesh.userData = { isGlow: true };
    group.add(glowMesh);

    group.position.set(orb.x, orb.y, orb.z);
    group.userData = {
        orbId: orb.id,
        moodId: orb.moodId,
        moodLabel: orb.moodLabel,
        colorHex: orb.colorSolid,
        colorFromHex: orb.colorFrom,
        colorToHex: orb.colorTo,
        timestamp: orb.timestamp,
        tags: orb.tags,
        notePreview: orb.notePreview,
        breathSeed: Math.random() * Math.PI * 2,
        radius,
        orbType,
        // Original shader colors (for restore after dim/highlight)
        origCenter: coreColor.clone(),
        origEdge: edgeColor.clone(),
    };

    return group;
}

/**
 * Creates a cluster cloud mesh for LOD (zoomed-out view).
 */
export function createClusterCloud(
    x: number,
    y: number,
    z: number,
    color: string,
    orbCount: number,
): THREE.Mesh {
    const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(color),
        transparent: true,
        opacity: Math.min(0.25, 0.06 + orbCount * 0.012),
    });
    const mesh = new THREE.Mesh(SHARED_CLUSTER_SPHERE, material);
    const size = Math.min(3, 0.8 + orbCount * 0.06);
    mesh.scale.set(size, size, size);
    mesh.position.set(x, y, z);
    mesh.userData = { isCluster: true };
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

import * as THREE from 'three';
import type { GalaxyOrb } from './galaxyTypes';

// Shared geometries — reused across all instances (unit spheres, scaled per orb)
const SHARED_SPHERE = new THREE.SphereGeometry(1, 14, 14);
const SHARED_CLUSTER_SPHERE = new THREE.SphereGeometry(1, 12, 12);

// ── Size hierarchy ──────────────────────────────────────────────────────
const RADIUS_MIN = 0.06;
const RADIUS_MAX = 0.22;

// ── Orb types ───────────────────────────────────────────────────────────
type OrbType = 'bright' | 'soft' | 'faint';

interface OrbTypeConfig {
    coreLightness: number;  // how much to brighten center toward white
    edgeSaturation: number; // saturation multiplier for edge color
}

const ORB_TYPES: Record<OrbType, OrbTypeConfig> = {
    bright: { coreLightness: 0.5, edgeSaturation: 1.0 },
    soft:   { coreLightness: 0.35, edgeSaturation: 0.85 },
    faint:  { coreLightness: 0.2, edgeSaturation: 0.7 },
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

/** Desaturate a color toward gray */
function desaturate(color: THREE.Color, factor: number): THREE.Color {
    const hsl = { h: 0, s: 0, l: 0 };
    color.getHSL(hsl);
    hsl.s *= factor;
    return new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l);
}

/** Brighten a color toward white by mixing factor (0 = original, 1 = white) */
function brighten(color: THREE.Color, factor: number): THREE.Color {
    return new THREE.Color().copy(color).lerp(new THREE.Color(0xffffff), factor);
}

// ── Radial gradient shader (GLSL ES 1.0 for WebGL 1.0 / expo-gl) ───────

const VERTEX_SHADER = `
varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = mvPosition.xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mvPosition;
}
`;

const FRAGMENT_SHADER = `
uniform vec3 colorCenter;
uniform vec3 colorEdge;
uniform float opacity;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;

varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
    vec3 viewDir = normalize(-vViewPosition);
    float facing = clamp(dot(vNormal, viewDir), 0.0, 1.0);

    // Radial gradient: bright center -> mood color at silhouette edge
    float t = 1.0 - pow(facing, 0.6);
    vec3 color = mix(colorCenter, colorEdge, t);

    // Linear fog (matches scene fog)
    float fogDepth = length(vViewPosition);
    float fogFactor = smoothstep(fogNear, fogFar, fogDepth);
    color = mix(color, fogColor, fogFactor);

    gl_FragColor = vec4(color, opacity);
}
`;

/**
 * Creates a Three.js Group for a single galaxy orb.
 *
 * Uses a custom ShaderMaterial with a view-dependent radial gradient:
 *   Center (facing camera) — bright, white-tinted mood color
 *   Edge (silhouette) — deeper mood color
 *
 * No outer glow or halo layers — just the core sphere.
 */
export function createOrbMesh(orb: GalaxyOrb): THREE.Group {
    const group = new THREE.Group();

    const orbType = getOrbType(orb.id);
    const config = ORB_TYPES[orbType];

    const radius = RADIUS_MIN + orb.richness * (RADIUS_MAX - RADIUS_MIN);

    // Derive center + edge colors from mood palette
    const solidColor = new THREE.Color(orb.colorSolid);
    const centerColor = brighten(solidColor, config.coreLightness);
    const edgeColor = desaturate(new THREE.Color(orb.colorFrom), config.edgeSaturation);

    const material = new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        uniforms: {
            colorCenter: { value: centerColor },
            colorEdge: { value: edgeColor },
            opacity: { value: 1.0 },
            fogColor: { value: new THREE.Color(0x050608) },
            fogNear: { value: 40.0 },
            fogFar: { value: 120.0 },
        },
        transparent: true,
        depthWrite: true,
    });

    const mesh = new THREE.Mesh(SHARED_SPHERE, material);
    mesh.scale.setScalar(radius);
    mesh.userData = { isCore: true };
    group.add(mesh);

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
        origCenter: centerColor.clone(),
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

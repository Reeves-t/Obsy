export interface OrbData {
    id: number;
    cx: number;
    cy: number;
    r: number;
    // Screen-wide scatter positions (in viewport units, but can be way outside 0-100)
    scatterX: number;
    scatterY: number;
    convergeDelay: number;
    layer: 'back' | 'front';
}

export const ORB_VIEWPORT_SIZE = 100;
const CENTER = 50;

// Reference Image (6-fold symmetry):
// - 6 LARGE orbs define the ring shape
// - 6 MEDIUM orbs in the OUTER grooves between large orbs
// - 6 SMALL orbs in the INNER grooves (opposite side from medium)

const R_OUTER_LARGE = 38;
const R_OUTER_MEDIUM = 40;
const R_INNER_SMALL = 22;

// Helper to calculate position on a circle
const pos = (angle: number, radius: number) => ({
    cx: Math.round((CENTER + radius * Math.cos((angle * Math.PI) / 180)) * 10) / 10,
    cy: Math.round((CENTER + radius * Math.sin((angle * Math.PI) / 180)) * 10) / 10,
});

// Seeded random for deterministic scatter positions
// Using a simple LCG (Linear Congruential Generator)
const seed = 42;
let rngState = seed;
const seededRandom = () => {
    rngState = (rngState * 1664525 + 1013904223) % 4294967296;
    return rngState / 4294967296;
};

// Generate screen-wide scatter positions
// Values are in viewport units but way outside 0-100 to represent screen edges
// Negative = left/top of container, Large positive = right/bottom
const generateScatter = (id: number) => {
    // Reset RNG state based on orb ID for determinism
    rngState = seed + id * 12345;

    // Random angle for scatter direction
    const angle = seededRandom() * 360;
    // Distance: 150-300 viewport units (way off screen)
    const distance = 150 + seededRandom() * 150;

    return {
        scatterX: Math.round(distance * Math.cos((angle * Math.PI) / 180)),
        scatterY: Math.round(distance * Math.sin((angle * Math.PI) / 180)),
    };
};

export const SPLASH_ORBS: OrbData[] = [
    // === 6 LARGE ORBS (Define the ring shape) ===
    { id: 1, ...pos(270, R_OUTER_LARGE), r: 12.0, ...generateScatter(1), convergeDelay: 0, layer: 'back' },
    { id: 2, ...pos(330, R_OUTER_LARGE), r: 12.0, ...generateScatter(2), convergeDelay: 100, layer: 'back' },
    { id: 3, ...pos(30, R_OUTER_LARGE), r: 12.0, ...generateScatter(3), convergeDelay: 200, layer: 'back' },
    { id: 4, ...pos(90, R_OUTER_LARGE), r: 12.0, ...generateScatter(4), convergeDelay: 300, layer: 'back' },
    { id: 5, ...pos(150, R_OUTER_LARGE), r: 12.0, ...generateScatter(5), convergeDelay: 400, layer: 'back' },
    { id: 6, ...pos(210, R_OUTER_LARGE), r: 12.0, ...generateScatter(6), convergeDelay: 500, layer: 'back' },

    // === 6 MEDIUM ORBS (Outer grooves between large orbs) ===
    { id: 7, ...pos(300, R_OUTER_MEDIUM), r: 7.0, ...generateScatter(7), convergeDelay: 50, layer: 'back' },
    { id: 8, ...pos(0, R_OUTER_MEDIUM), r: 7.0, ...generateScatter(8), convergeDelay: 150, layer: 'back' },
    { id: 9, ...pos(60, R_OUTER_MEDIUM), r: 7.0, ...generateScatter(9), convergeDelay: 250, layer: 'back' },
    { id: 10, ...pos(120, R_OUTER_MEDIUM), r: 7.0, ...generateScatter(10), convergeDelay: 350, layer: 'back' },
    { id: 11, ...pos(180, R_OUTER_MEDIUM), r: 7.0, ...generateScatter(11), convergeDelay: 450, layer: 'back' },
    { id: 12, ...pos(240, R_OUTER_MEDIUM), r: 7.0, ...generateScatter(12), convergeDelay: 550, layer: 'back' },

    // === 6 SMALL ORBS (Inner grooves - opposite side from medium) ===
    { id: 13, ...pos(300, R_INNER_SMALL), r: 4.5, ...generateScatter(13), convergeDelay: 75, layer: 'front' },
    { id: 14, ...pos(0, R_INNER_SMALL), r: 4.5, ...generateScatter(14), convergeDelay: 175, layer: 'front' },
    { id: 15, ...pos(60, R_INNER_SMALL), r: 4.5, ...generateScatter(15), convergeDelay: 275, layer: 'front' },
    { id: 16, ...pos(120, R_INNER_SMALL), r: 4.5, ...generateScatter(16), convergeDelay: 375, layer: 'front' },
    { id: 17, ...pos(180, R_INNER_SMALL), r: 4.5, ...generateScatter(17), convergeDelay: 475, layer: 'front' },
    { id: 18, ...pos(240, R_INNER_SMALL), r: 4.5, ...generateScatter(18), convergeDelay: 575, layer: 'front' },
];

// Sorted for render order: back first, front last
export const SPLASH_ORBS_SORTED = [
    ...SPLASH_ORBS.filter(o => o.layer === 'back'),
    ...SPLASH_ORBS.filter(o => o.layer === 'front'),
];

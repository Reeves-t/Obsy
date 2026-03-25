import { Capture } from '@/types/capture';
import { getMoodTheme } from '@/lib/moods';
import { getMoodLabel } from '@/lib/moodUtils';
import { format } from 'date-fns';
import type { GalaxyOrb, GalaxyCluster, TimeOfDayBucket } from './galaxyTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Seeded RNG — simple linear congruential generator
// ─────────────────────────────────────────────────────────────────────────────

function djb2(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
}

class SeededRNG {
    private state: number;

    constructor(seed: number) {
        this.state = seed;
    }

    next(): number {
        this.state = (this.state * 1664525 + 1013904223) | 0;
        return (this.state >>> 0) / 4294967296;
    }

    range(min: number, max: number): number {
        return min + this.next() * (max - min);
    }

    pick<T>(arr: T[]): T {
        return arr[Math.floor(this.next() * arr.length)];
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

function getTimeOfDayBucket(hour: number): TimeOfDayBucket {
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
}

function getWeekOfYear(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 1);
    const diff = date.getTime() - start.getTime();
    return Math.ceil((diff / 86400000 + start.getDay() + 1) / 7);
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout algorithm
// ─────────────────────────────────────────────────────────────────────────────

const MAX_ORBS = 1000;
// Single Archimedean spiral constants
const SPIRAL_TIGHTNESS = 0.18;      // Radians per orb (controls arm openness)
const SPIRAL_START_RADIUS = 1.0;    // Starting radius at center
const SPIRAL_GROWTH = 0.08;         // Radius growth per orb (arm expansion rate)

// Collision detection constants
const MAX_ORB_DIAMETER = 0.88;      // 2x RADIUS_MAX from OrbNode.ts
const MIN_ORB_DISTANCE = MAX_ORB_DIAMETER * 2; // 2x max diameter in 3D space
const COLLISION_CHECK_STEP = 0.02;  // Radians to advance spiral when collision detected
const MAX_COLLISION_ATTEMPTS = 200; // Safety limit for collision resolution

/** Calculate 3D Euclidean distance between two points */
function distance3D(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dz = z2 - z1;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export interface LayoutResult {
    orbs: GalaxyOrb[];
    clusters: GalaxyCluster[];
}

/**
 * Computes a deterministic galaxy layout for the given captures.
 * Same userId + year + captures always produces the same positions.
 */
export function computeGalaxyLayout(
    captures: Capture[],
    userId: string,
    year: number,
): LayoutResult {
    const seed = djb2(`${userId}:${year}`);
    const rng = new SeededRNG(seed);

    // ── Step 1: Sort chronologically (oldest first) with mood-affinity secondary sort ──
    const yearCaptures = captures
        .filter((c) => {
            const d = new Date(c.created_at);
            return d.getFullYear() === year && c.mood_id;
        })
        .sort((a, b) => {
            const timeA = new Date(a.created_at).getTime();
            const timeB = new Date(b.created_at).getTime();
            const timeDiff = timeA - timeB;

            // If captures are within 7 days, group by mood for affinity
            if (Math.abs(timeDiff) < 7 * 24 * 60 * 60 * 1000) {
                return a.mood_id.localeCompare(b.mood_id);
            }
            return timeDiff;
        })
        .slice(0, MAX_ORBS);

    // ── Step 2: Calculate mood frequencies across entire dataset ──
    const moodFreq: Record<string, number> = {};
    for (const c of yearCaptures) {
        moodFreq[c.mood_id] = (moodFreq[c.mood_id] || 0) + 1;
    }
    const maxFreq = Math.max(...Object.values(moodFreq), 1);

    // Sort moods by frequency to determine tiers
    const moodsSortedByFreq = Object.entries(moodFreq)
        .sort((a, b) => b[1] - a[1])
        .map(([moodId]) => moodId);

    const totalMoods = moodsSortedByFreq.length;
    const topThirdThreshold = Math.floor(totalMoods / 3);
    const middleThirdThreshold = Math.floor((totalMoods * 2) / 3);

    const allOrbs: GalaxyOrb[] = [];

    // ── Step 3: Position each orb on the continuous Archimedean spiral ──
    for (let i = 0; i < yearCaptures.length; i++) {
        const capture = yearCaptures[i];
        const theme = getMoodTheme(capture.mood_id);
        const label = getMoodLabel(capture.mood_id, capture.mood_name_snapshot);
        const date = new Date(capture.created_at);

        // ── Step 4: Radial offset based on mood frequency ──
        const moodRank = moodsSortedByFreq.indexOf(capture.mood_id);
        let offsetMagnitude: number;

        if (moodRank < topThirdThreshold) {
            // Common moods - on the spiral spine
            offsetMagnitude = 0.0;
        } else if (moodRank < middleThirdThreshold) {
            // Medium frequency moods - slight offset
            offsetMagnitude = 0.3;
        } else {
            // Rare/one-off moods - larger offset (outlier stars)
            offsetMagnitude = rng.range(0.6, 0.8);
        }

        // Alternate offset direction (both sides of spiral arm)
        const offsetSign = (i % 2 === 0) ? 1 : -1;

        // ── Z-axis variation for genuine 3D spacing ──────────────────────────
        // All orbs get z-variation to prevent overlap from tilted camera angles
        let zVariation: number;
        if (moodRank < topThirdThreshold) {
            // Common moods - subtle z-alternation above/below spine
            zVariation = offsetSign * 0.25;
        } else if (moodRank < middleThirdThreshold) {
            // Medium frequency moods - moderate z-spread
            zVariation = offsetSign * rng.range(0.4, 0.6);
        } else {
            // Rare/one-off moods - larger z-spread matching XY offset
            zVariation = offsetSign * rng.range(0.7, 1.0);
        }

        // ── Step 5: Collision-aware placement (advance-and-check) ────────────
        // Find first clear position on spiral that maintains minimum distance from all placed orbs
        let finalX = 0;
        let finalY = 0;
        let finalZ = 0;
        let spiralAngle = i * SPIRAL_TIGHTNESS;
        let attempts = 0;
        let positionFound = false;

        while (attempts < MAX_COLLISION_ATTEMPTS && !positionFound) {
            const radius = SPIRAL_START_RADIUS + (spiralAngle / SPIRAL_TIGHTNESS) * SPIRAL_GROWTH;

            // Calculate perpendicular offset (perpendicular to radial direction)
            const perpendicularAngle = spiralAngle + Math.PI / 2;
            const offsetX = Math.cos(perpendicularAngle) * offsetMagnitude * offsetSign;
            const offsetY = Math.sin(perpendicularAngle) * offsetMagnitude * offsetSign;

            // Candidate position (3D spiral with z-depth)
            const candidateX = Math.cos(spiralAngle) * radius + offsetX;
            const candidateY = Math.sin(spiralAngle) * radius + offsetY;
            const candidateZ = zVariation;

            // Check distance against all previously placed orbs
            let hasCollision = false;
            for (const placedOrb of allOrbs) {
                const dist = distance3D(
                    candidateX, candidateY, candidateZ,
                    placedOrb.x, placedOrb.y, placedOrb.z
                );
                if (dist < MIN_ORB_DISTANCE) {
                    hasCollision = true;
                    break;
                }
            }

            if (!hasCollision) {
                // Clear position found
                finalX = candidateX;
                finalY = candidateY;
                finalZ = candidateZ;
                positionFound = true;
            } else {
                // Collision detected — advance spiral angle and try again
                spiralAngle += COLLISION_CHECK_STEP;
                attempts++;
            }
        }

        // Fallback: if no clear position found after max attempts, use last candidate
        // (This should rarely happen with proper constants, but ensures termination)
        if (!positionFound) {
            const radius = SPIRAL_START_RADIUS + (spiralAngle / SPIRAL_TIGHTNESS) * SPIRAL_GROWTH;
            const perpendicularAngle = spiralAngle + Math.PI / 2;
            const offsetX = Math.cos(perpendicularAngle) * offsetMagnitude * offsetSign;
            const offsetY = Math.sin(perpendicularAngle) * offsetMagnitude * offsetSign;
            finalX = Math.cos(spiralAngle) * radius + offsetX;
            finalY = Math.sin(spiralAngle) * radius + offsetY;
            finalZ = zVariation;
        }

        const x = finalX;
        const y = finalY;
        const z = finalZ;

        // Calculate orb metadata
        const freq = moodFreq[capture.mood_id] || 1;
        const novelty = 1 - (freq / maxFreq);

        // Richness: note length + tags + photo presence → 0-1
        const noteLen = capture.note ? Math.min(capture.note.length, 200) : 0;
        const richness = Math.min(1, (noteLen / 200) * 0.4 + (capture.tags?.length || 0) * 0.15 + (capture.image_url ? 0.2 : 0));

        const orb: GalaxyOrb = {
            id: capture.id,
            timestamp: date.getTime(),
            dateKey: format(date, 'yyyy-MM-dd'),
            moodId: capture.mood_id,
            moodLabel: label,
            colorFrom: theme.gradient.from,
            colorTo: theme.gradient.to,
            colorSolid: theme.solid,
            notePreview: capture.note ? capture.note.slice(0, 80) : null,
            tags: capture.tags || [],
            photoUri: capture.image_url || null,
            includeInInsights: capture.includeInInsights,
            year,
            month: new Date(capture.created_at).getMonth(),
            weekOfYear: getWeekOfYear(date),
            timeOfDayBucket: getTimeOfDayBucket(date.getHours()),
            clusterId: `spiral-${year}`,  // Single spiral cluster
            x,
            y,
            z,
            bridgeScore: 0,
            noveltyScore: novelty,
            richness,
        };

        allOrbs.push(orb);
    }

    // Create single spiral cluster metadata
    const allClusters: GalaxyCluster[] = [{
        id: `spiral-${year}`,
        month: 0,  // Not month-based
        label: `${year}`,
        anchorX: 0,
        anchorY: 0,
        anchorZ: 0,
        orbs: allOrbs,
        nebulaColor: '#5A0C8A',  // Default purple
        nebulaRadius: 0,  // Not used in spiral mode
    }];

    // ── Center galaxy on the centroid of placed orbs ───────────────────────
    if (allOrbs.length > 0) {
        let cx = 0, cy = 0, cz = 0;
        for (const o of allOrbs) { cx += o.x; cy += o.y; cz += o.z; }
        cx /= allOrbs.length;
        cy /= allOrbs.length;
        cz /= allOrbs.length;

        for (const o of allOrbs) { o.x -= cx; o.y -= cy; o.z -= cz; }
        for (const c of allClusters) {
            c.anchorX -= cx;
            c.anchorY -= cy;
            c.anchorZ -= cz;
        }
    }

    return { orbs: allOrbs, clusters: allClusters };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock data generator
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_MOODS = [
    'calm', 'happy', 'grateful', 'content', 'peaceful', 'hopeful',
    'anxious', 'sad', 'stressed', 'tired', 'lonely', 'frustrated',
    'creative', 'motivated', 'excited', 'confident', 'loved',
    'melancholic', 'numb', 'overwhelmed', 'bored', 'nostalgic',
];

const MOCK_TAGS = [
    'work', 'family', 'health', 'exercise', 'food', 'sleep',
    'friends', 'music', 'nature', 'meditation', 'reading',
    'travel', 'therapy', 'journaling', 'rain', 'sunshine',
];

const MOCK_NOTES = [
    'Felt really good about the progress today.',
    'Hard morning but the afternoon turned around.',
    'Quiet day, just processing things.',
    'Great conversation that shifted my perspective.',
    'Woke up with this heavy feeling I can\'t explain.',
    'The walk in the park helped clear my head.',
    'Trying to stay present, one moment at a time.',
    'Something about today felt different, lighter.',
    'Overwhelming day at work but managed through it.',
    'Small wins. That\'s what matters.',
    null, null, null, // some captures have no notes
];

/**
 * Generates realistic mock captures spanning the given year.
 * Uses seeded RNG for deterministic output.
 */
export function generateMockCaptures(userId: string, year: number, count = 500): Capture[] {
    const seed = djb2(`mock:${userId}:${year}`);
    const rng = new SeededRNG(seed);
    const captures: Capture[] = [];

    for (let i = 0; i < count; i++) {
        const month = Math.floor(rng.next() * 12);
        const day = 1 + Math.floor(rng.next() * 28);
        const hour = Math.floor(rng.next() * 24);
        const minute = Math.floor(rng.next() * 60);
        const date = new Date(year, month, day, hour, minute);

        const moodId = rng.pick(MOCK_MOODS);
        const tagCount = Math.floor(rng.next() * 3);
        const tags: string[] = [];
        for (let t = 0; t < tagCount; t++) {
            const tag = rng.pick(MOCK_TAGS);
            if (!tags.includes(tag)) tags.push(tag);
        }

        captures.push({
            id: `mock-${year}-${i}`,
            user_id: userId,
            created_at: date.toISOString(),
            mood_id: moodId,
            mood_name_snapshot: moodId.charAt(0).toUpperCase() + moodId.slice(1),
            note: rng.pick(MOCK_NOTES),
            image_url: '',
            tags,
            includeInInsights: rng.next() > 0.1,
            usePhotoForInsight: false,
        });
    }

    return captures.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
}

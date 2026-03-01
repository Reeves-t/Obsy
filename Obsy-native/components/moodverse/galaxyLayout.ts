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
const MIN_ORB_DISTANCE = 0.4;

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

    const yearCaptures = captures
        .filter((c) => {
            const d = new Date(c.created_at);
            return d.getFullYear() === year && c.mood_id;
        })
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, MAX_ORBS);

    // Count mood frequencies for novelty scoring
    const moodFreq: Record<string, number> = {};
    for (const c of yearCaptures) {
        moodFreq[c.mood_id] = (moodFreq[c.mood_id] || 0) + 1;
    }
    const maxFreq = Math.max(...Object.values(moodFreq), 1);

    const byMonth: Map<number, Capture[]> = new Map();
    for (const c of yearCaptures) {
        const month = new Date(c.created_at).getMonth();
        if (!byMonth.has(month)) byMonth.set(month, []);
        byMonth.get(month)!.push(c);
    }

    // Generate 12 month cluster anchors using golden angle spiral
    const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
    const monthAnchors: Array<{ x: number; y: number; z: number }> = [];
    for (let m = 0; m < 12; m++) {
        const angle = m * GOLDEN_ANGLE + rng.range(-0.15, 0.15);
        const radius = 4 + Math.sqrt((m + 1) / 12) * 5 + rng.range(-0.5, 0.5);
        const z = (m - 5.5) * 1.5;
        monthAnchors.push({
            x: Math.cos(angle) * radius,
            y: Math.sin(angle) * radius,
            z,
        });
    }

    const allOrbs: GalaxyOrb[] = [];
    const allClusters: GalaxyCluster[] = [];
    const placedPositions: Array<{ x: number; y: number; z: number }> = [];

    for (let m = 0; m < 12; m++) {
        const monthCaptures = byMonth.get(m) || [];
        const anchor = monthAnchors[m];
        const clusterId = `month-${m}`;
        const clusterOrbs: GalaxyOrb[] = [];

        const byMood: Map<string, Capture[]> = new Map();
        for (const c of monthCaptures) {
            if (!byMood.has(c.mood_id)) byMood.set(c.mood_id, []);
            byMood.get(c.mood_id)!.push(c);
        }

        let moodIdx = 0;
        for (const [, moodCaptures] of byMood) {
            const subAngle = (moodIdx / Math.max(byMood.size, 1)) * Math.PI * 2 + rng.range(-0.3, 0.3);
            const subRadius = rng.range(0.8, 2.0);
            const subAnchor = {
                x: anchor.x + Math.cos(subAngle) * subRadius,
                y: anchor.y + Math.sin(subAngle) * subRadius,
                z: anchor.z + rng.range(-1.2, 1.2),
            };

            for (const capture of moodCaptures) {
                const theme = getMoodTheme(capture.mood_id);
                const label = capture.mood_name_snapshot || getMoodLabel(capture.mood_id);
                const date = new Date(capture.created_at);

                let px = subAnchor.x + rng.range(-0.6, 0.6);
                let py = subAnchor.y + rng.range(-0.6, 0.6);
                let pz = subAnchor.z + rng.range(-0.8, 0.8);

                for (let attempt = 0; attempt < 5; attempt++) {
                    let tooClose = false;
                    for (const placed of placedPositions) {
                        const dx = px - placed.x;
                        const dy = py - placed.y;
                        const dz = pz - placed.z;
                        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                        if (dist < MIN_ORB_DISTANCE) {
                            const pushFactor = (MIN_ORB_DISTANCE - dist + 0.1);
                            px += (dx / (dist || 0.01)) * pushFactor;
                            py += (dy / (dist || 0.01)) * pushFactor;
                            pz += (dz / (dist || 0.01)) * pushFactor * 0.2;
                            tooClose = true;
                            break;
                        }
                    }
                    if (!tooClose) break;
                }

                const freq = moodFreq[capture.mood_id] || 1;
                const novelty = 1 - (freq / maxFreq); // rare moods = higher novelty

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
                    month: m,
                    weekOfYear: getWeekOfYear(date),
                    timeOfDayBucket: getTimeOfDayBucket(date.getHours()),
                    clusterId,
                    x: px,
                    y: py,
                    z: pz,
                    bridgeScore: 0,
                    noveltyScore: novelty,
                    richness,
                };

                allOrbs.push(orb);
                clusterOrbs.push(orb);
                placedPositions.push({ x: px, y: py, z: pz });
            }
            moodIdx++;
        }

        allClusters.push({
            id: clusterId,
            month: m,
            label: MONTH_NAMES[m],
            anchorX: anchor.x,
            anchorY: anchor.y,
            anchorZ: anchor.z,
            orbs: clusterOrbs,
        });
    }

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

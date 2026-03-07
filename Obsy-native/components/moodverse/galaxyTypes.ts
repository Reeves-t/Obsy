/**
 * Shared types for the Moodverse galaxy system.
 */

export type TimeOfDayBucket = 'morning' | 'afternoon' | 'evening' | 'night';
export type SelectionMode = 'single' | 'multi' | 'cluster';

export interface GalaxyOrb {
    // ── Core capture data ───────────────────────────────────────────────────
    id: string;
    timestamp: number;
    dateKey: string;                 // YYYY-MM-DD
    moodId: string;
    moodLabel: string;
    colorFrom: string;
    colorTo: string;
    colorSolid: string;
    notePreview: string | null;
    tags: string[];
    photoUri: string | null;
    includeInInsights: boolean;

    // ── Derived for Moodverse ───────────────────────────────────────────────
    year: number;
    month: number;                   // 0-11
    weekOfYear: number;
    timeOfDayBucket: TimeOfDayBucket;
    clusterId: string;               // "month-{m}" for now
    x: number;
    y: number;
    z: number;

    // ── Placeholder scores ──────────────────────────────────────────────────
    bridgeScore: number;             // 0 = not a bridge, higher = more bridging
    noveltyScore: number;            // 0 = common, higher = unusual
    richness: number;                // 0-1, drives orb size (note+tags+photo = richer)
}

export interface GalaxyCluster {
    id: string;
    month: number;
    label: string;                   // e.g. "March"
    anchorX: number;
    anchorY: number;
    anchorZ: number;
    orbs: GalaxyOrb[];
    nebulaColor?: string;            // Blended avg color of month's moods (for fog)
    nebulaRadius?: number;           // Scatter radius for volumetric fog
}

export interface GalaxyEdge {
    fromId: string;
    toId: string;
    reason: 'mood' | 'tags' | 'time' | 'cluster';
    strength: number;                // 0-1
}

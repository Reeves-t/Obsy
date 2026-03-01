import type { GalaxyOrb, GalaxyEdge } from './galaxyTypes';

const MAX_EDGES_PER_ORB = 10;
const MAX_AMBIENT_EDGES = 250;
const EDGES_PER_ORB_AMBIENT = 2;

// ── Semantic edge colors (GitNexus-inspired) ─────────────────────────────

export const EDGE_COLORS: Record<GalaxyEdge['reason'], number> = {
    mood: 0x7c3aed,     // purple — emotional resonance
    tags: 0x06b6d4,     // cyan — shared context
    time: 0x10b981,     // emerald — temporal proximity
    cluster: 0x475569,  // slate — same month/cluster
};

// ── Helpers ──────────────────────────────────────────────────────────────

function scoreEdge(a: GalaxyOrb, b: GalaxyOrb): { score: number; reason: GalaxyEdge['reason'] } {
    let bestScore = 0;
    let bestReason: GalaxyEdge['reason'] = 'cluster';

    // Same mood = strong connection
    if (b.moodId === a.moodId) {
        const s = 0.8;
        if (s > bestScore) { bestScore = s; bestReason = 'mood'; }
    }

    // Shared tags
    const sharedTags = a.tags.filter((t) => b.tags.includes(t));
    if (sharedTags.length > 0) {
        const s = Math.min(0.9, 0.4 + sharedTags.length * 0.2);
        if (s > bestScore) { bestScore = s; bestReason = 'tags'; }
    }

    // Close in time (within 24 hours)
    const timeDiff = Math.abs(b.timestamp - a.timestamp);
    const hoursDiff = timeDiff / (1000 * 60 * 60);
    if (hoursDiff < 24) {
        const s = 0.7 * (1 - hoursDiff / 24);
        if (s > bestScore) { bestScore = s; bestReason = 'time'; }
    }

    // Same cluster (month)
    if (b.clusterId === a.clusterId && bestScore < 0.3) {
        bestScore = 0.2;
        bestReason = 'cluster';
    }

    return { score: bestScore, reason: bestReason };
}

// ── Per-orb edges (selection) ────────────────────────────────────────────

/**
 * Computes connection edges for a selected orb.
 * Links by: same mood, shared tags, close time, same cluster.
 */
export function computeEdgesForOrb(
    selectedOrb: GalaxyOrb,
    allOrbs: GalaxyOrb[],
): GalaxyEdge[] {
    const scored: Array<{ orb: GalaxyOrb; score: number; reason: GalaxyEdge['reason'] }> = [];

    for (const other of allOrbs) {
        if (other.id === selectedOrb.id) continue;
        const { score, reason } = scoreEdge(selectedOrb, other);
        if (score > 0.15) {
            scored.push({ orb: other, score, reason });
        }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, MAX_EDGES_PER_ORB).map((s) => ({
        fromId: selectedOrb.id,
        toId: s.orb.id,
        reason: s.reason,
        strength: s.score,
    }));
}

// ── Ambient mesh (always-visible network) ────────────────────────────────

/**
 * Computes a sparse global mesh of connections across all orbs.
 * Each orb gets its top N strongest connections, deduplicated.
 * Creates the constellation / web look inspired by GitNexus.
 */
export function computeAmbientMesh(orbs: GalaxyOrb[]): GalaxyEdge[] {
    if (orbs.length < 2) return [];

    const edgeSet = new Map<string, GalaxyEdge>();

    for (const orb of orbs) {
        const candidates: Array<{ id: string; score: number; reason: GalaxyEdge['reason'] }> = [];

        for (const other of orbs) {
            if (other.id === orb.id) continue;
            const { score, reason } = scoreEdge(orb, other);
            if (score > 0.25) {
                candidates.push({ id: other.id, score, reason });
            }
        }

        candidates.sort((a, b) => b.score - a.score);
        for (const c of candidates.slice(0, EDGES_PER_ORB_AMBIENT)) {
            // Canonical key so A→B and B→A are the same edge
            const key = orb.id < c.id ? `${orb.id}|${c.id}` : `${c.id}|${orb.id}`;
            if (!edgeSet.has(key)) {
                edgeSet.set(key, {
                    fromId: orb.id,
                    toId: c.id,
                    reason: c.reason,
                    strength: c.score,
                });
            }
        }
    }

    // Cap total edges for performance
    const all = [...edgeSet.values()];
    if (all.length <= MAX_AMBIENT_EDGES) return all;
    all.sort((a, b) => b.strength - a.strength);
    return all.slice(0, MAX_AMBIENT_EDGES);
}

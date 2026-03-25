import type { GalaxyOrb } from './galaxyTypes';

export interface TransitionEntry {
    moodId: string;
    moodLabel: string;
    colorSolid: string;
    count: number;
}

export interface TransitionData {
    before: TransitionEntry[];   // moods that precede the selected mood, sorted by count desc
    after: TransitionEntry[];    // moods that follow the selected mood, sorted by count desc
}

/**
 * Aura assignment for transition-related orbs in the 3D scene.
 * Maps moodId → aura color hex + opacity.
 */
export interface TransitionAura {
    moodId: string;
    color: number;       // THREE.js hex color
    opacity: number;
    role: 'after1' | 'after2' | 'before1' | 'before2';
}

// Aura color constants
const GOLD    = 0xFFD700;
const SILVER  = 0xC0C0C0;
const BLUE    = 0x4A9EDE;
const TEAL    = 0x2AAA8A;

const MIN_OCCURRENCE = 2; // Only show auras for transitions with 2+ occurrences

/**
 * Compute before/after mood transitions for a given mood across all orbs.
 * Orbs are treated as a chronological sequence — consecutive captures form transitions.
 */
export function computeTransitions(
    selectedMoodId: string,
    allOrbs: GalaxyOrb[],
): TransitionData {
    // Sort all orbs chronologically
    const sorted = [...allOrbs].sort((a, b) => a.timestamp - b.timestamp);

    const beforeCounts = new Map<string, { label: string; color: string; count: number }>();
    const afterCounts = new Map<string, { label: string; color: string; count: number }>();

    for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].moodId !== selectedMoodId) continue;

        // What comes before
        if (i > 0) {
            const prev = sorted[i - 1];
            const existing = beforeCounts.get(prev.moodId);
            if (existing) {
                existing.count++;
            } else {
                beforeCounts.set(prev.moodId, {
                    label: prev.moodLabel,
                    color: prev.colorSolid,
                    count: 1,
                });
            }
        }

        // What comes after
        if (i < sorted.length - 1) {
            const next = sorted[i + 1];
            const existing = afterCounts.get(next.moodId);
            if (existing) {
                existing.count++;
            } else {
                afterCounts.set(next.moodId, {
                    label: next.moodLabel,
                    color: next.colorSolid,
                    count: 1,
                });
            }
        }
    }

    const toSorted = (map: Map<string, { label: string; color: string; count: number }>): TransitionEntry[] =>
        [...map.entries()]
            .map(([moodId, { label, color, count }]) => ({ moodId, moodLabel: label, colorSolid: color, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 3);

    return {
        before: toSorted(beforeCounts),
        after: toSorted(afterCounts),
    };
}

/**
 * Derive aura assignments from transition data.
 * Returns up to 4 aura entries (2 after + 2 before), filtered by MIN_OCCURRENCE.
 * If a moodId appears in both before and after, after takes priority.
 */
export function computeTransitionAuras(
    transitions: TransitionData,
    selectedMoodId: string,
): TransitionAura[] {
    const auras: TransitionAura[] = [];
    const claimed = new Set<string>();

    // After auras (gold, silver)
    const afterFiltered = transitions.after.filter(t => t.count >= MIN_OCCURRENCE);
    if (afterFiltered.length >= 1) {
        auras.push({ moodId: afterFiltered[0].moodId, color: GOLD, opacity: 0.20, role: 'after1' });
        claimed.add(afterFiltered[0].moodId);
    }
    if (afterFiltered.length >= 2) {
        auras.push({ moodId: afterFiltered[1].moodId, color: SILVER, opacity: 0.14, role: 'after2' });
        claimed.add(afterFiltered[1].moodId);
    }

    // Before auras (blue, teal) — skip if already claimed by after
    const beforeFiltered = transitions.before.filter(t => t.count >= MIN_OCCURRENCE && !claimed.has(t.moodId));
    if (beforeFiltered.length >= 1) {
        auras.push({ moodId: beforeFiltered[0].moodId, color: BLUE, opacity: 0.16, role: 'before1' });
    }
    if (beforeFiltered.length >= 2) {
        auras.push({ moodId: beforeFiltered[1].moodId, color: TEAL, opacity: 0.12, role: 'before2' });
    }

    return auras;
}

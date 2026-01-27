import { MOODS } from '@/constants/Moods';
import { resolveMoodColor } from '@/lib/moodColorUtils';
import { moodCache } from '@/lib/moodCache';
import { Mood } from '@/types/mood';

/**
 * Resolves a mood ID to its full Mood object.
 * Uses the database-backed mood cache for reliable resolution
 * independent of Zustand store hydration state.
 */
export function resolveMood(moodId: string): Mood | null {
    return moodCache.getMoodById(moodId);
}

/**
 * Gets a human-readable label for a mood ID.
 * Priority: nameSnapshot (historical truth) > resolved mood from store > capitalized ID.
 */
export function getMoodLabel(moodId: string, nameSnapshot?: string): string {
    // 1. If we have a snapshot, it's the most reliable source for "what the user meant at the time"
    // and it's available even before stores hydrate.
    if (nameSnapshot && nameSnapshot !== moodId) {
        return nameSnapshot;
    }

    // 2. Try resolving from store
    const mood = resolveMood(moodId);
    if (mood) return mood.name;

    // 3. Last fallback: capitalize the ID (e.g. "happy" -> "Happy")
    // If it looks like a custom ID (has custom_), just return the snapshot or ID
    if (moodId.startsWith('custom_')) return nameSnapshot || 'Custom Mood';
    return moodId.charAt(0).toUpperCase() + moodId.slice(1);
}

/**
 * Resolves a color for a mood ID.
 */
export function resolveMoodColorById(moodId: string, nameSnapshot?: string): string {
    const mood = resolveMood(moodId);
    if (mood) return resolveMoodColor(mood);

    if (nameSnapshot) {
        // Deterministic color based on snapshot name
        return resolveMoodColor({ name: nameSnapshot, type: 'custom' } as Mood);
    }

    return "#9CA3AF"; // Default gray
}

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
 * Priority: nameSnapshot (historical truth) > resolved mood from cache > capitalized ID.
 */
export function getMoodLabel(moodId: string, nameSnapshot?: string): string {
    // 1. If we have a valid snapshot (not the ID itself, not starting with custom_), use it
    if (nameSnapshot && nameSnapshot !== moodId && !nameSnapshot.startsWith('custom_')) {
        return nameSnapshot;
    }

    // 2. Try resolving from mood cache (includes custom moods)
    const mood = resolveMood(moodId);
    if (mood) return mood.name;

    // 3. For custom moods, try harder before falling back
    if (moodId.startsWith('custom_')) {
        // Last resort: use snapshot if available, even if it looks like an ID
        if (nameSnapshot && nameSnapshot.length > 0) {
            return nameSnapshot;
        }
        // Only show "Custom Mood" if truly nothing else available
        return 'Custom Mood';
    }

    // 4. Capitalize the ID for system moods (e.g. "happy" -> "Happy")
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

/**
 * Backward-compatible mood color API.
 * Delegates to the canonical gradient system in lib/moods/.
 *
 * Prefer importing from '@/lib/moods' directly for new code.
 */
import { MoodId } from '@/constants/Moods';
import { getMoodTheme, MOOD_GRADIENT_MAP } from './moods';

/**
 * Flat color map derived from gradient midpoints.
 * Kept for backward compatibility — new code should use getMoodTheme().
 */
export const MOOD_COLOR_MAP: Record<MoodId, string> = Object.fromEntries(
    (Object.keys(MOOD_GRADIENT_MAP) as MoodId[]).map(id => [id, getMoodTheme(id).solid])
) as Record<MoodId, string>;

/**
 * Get the solid (midpoint) color for a given mood ID.
 */
export function getMoodColor(moodId: string): string {
    return getMoodTheme(moodId).solid;
}

/**
 * Get all mood labels for AI summary word banning.
 */
export function getBannedMoodWords(): string[] {
    return [
        // Low energy
        'calm', 'relaxed', 'peaceful', 'tired', 'drained', 'bored', 'reflective',
        'melancholy', 'nostalgic', 'lonely', 'depressed', 'numb', 'safe',
        // Medium energy
        'neutral', 'focused', 'grateful', 'hopeful', 'curious', 'scattered',
        'annoyed', 'unbothered', 'awkward', 'tender',
        // High energy
        'productive', 'creative', 'inspired', 'confident', 'joyful', 'social',
        'busy', 'restless', 'stressed', 'overwhelmed', 'anxious', 'angry',
        'pressured', 'enthusiastic', 'hyped', 'manic', 'playful',
    ];
}

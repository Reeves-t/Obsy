/**
 * Backward-compatible custom mood color API.
 * Delegates to the canonical gradient system in lib/moods/.
 *
 * Prefer importing from '@/lib/moods' directly for new code.
 */
import { getMoodTheme } from './moods';
import { Mood } from '@/types/mood';

/**
 * Get deterministic hex color for a custom mood name.
 * Returns the solid (midpoint) of its generated gradient.
 */
export function getMoodColor(name: string): string {
    return getMoodTheme(name).solid;
}

/**
 * Get mood color for both system and custom moods.
 * Returns the solid (midpoint) derived from the mood's gradient.
 */
export function resolveMoodColor(mood: Mood): string {
    const key = mood.type === 'system' ? mood.id : mood.name;
    return getMoodTheme(key).solid;
}

import { MOOD_COLOR_MAP, getMoodColor as getSystemMoodColor } from './moodColors';
import { Mood } from '@/types/mood';

/**
 * Hash a string to a number (simple djb2 algorithm)
 */
function hashString(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) + str.charCodeAt(i);
    }
    return hash >>> 0; // Convert to unsigned 32-bit int
}

/**
 * Generate deterministic hue from mood name
 * @param name - Mood name
 * @returns Hue value 0-360
 */
export function getMoodHue(name: string): number {
    const hash = hashString(name.toLowerCase().trim());
    return hash % 360;
}

/**
 * Generate full HSL color for a mood
 * Clamped to Obsy palette range for consistency
 */
export function getMoodColor(name: string): string {
    const hue = getMoodHue(name);
    const saturation = 65; // Fixed saturation for consistency
    const lightness = 55;  // Fixed lightness for readability
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * Get mood color for both system and custom moods
 */
export function resolveMoodColor(mood: Mood): string {
    if (mood.type === 'system') {
        // Use existing system mood color logic
        return getSystemMoodColor(mood.id);
    }
    // Generate deterministic color for custom moods
    return getMoodColor(mood.name);
}

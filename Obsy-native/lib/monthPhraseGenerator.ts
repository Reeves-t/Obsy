/**
 * Energy categorization for moods
 */
const HIGH_ENERGY_MOODS = [
    "productive", "creative", "inspired", "confident", "joyful",
    "social", "busy", "restless", "stressed", "overwhelmed", "anxious",
    "angry", "pressured", "enthusiastic", "hyped", "manic", "playful"
];
const LOW_ENERGY_MOODS = [
    "calm", "relaxed", "peaceful", "tired", "drained",
    "bored", "reflective", "melancholy", "nostalgic", "lonely",
    "depressed", "numb", "safe"
];

/**
 * Categorize moods into energy levels
 */
function categorizeMoodEnergy(moodTotals: Record<string, number>): {
    highEnergy: number;
    mediumEnergy: number;
    lowEnergy: number;
    total: number;
} {
    let highEnergy = 0;
    let lowEnergy = 0;
    let mediumEnergy = 0;
    let total = 0;

    for (const [mood, count] of Object.entries(moodTotals)) {
        total += count;
        if (HIGH_ENERGY_MOODS.includes(mood)) {
            highEnergy += count;
        } else if (LOW_ENERGY_MOODS.includes(mood)) {
            lowEnergy += count;
        } else {
            mediumEnergy += count;
        }
    }

    return { highEnergy, mediumEnergy, lowEnergy, total };
}

/**
 * Validate that a phrase is exactly 2 words and contains no banned words
 */
export function validateMonthPhrase(phrase: string, bannedWords: string[]): boolean {
    const words = phrase.trim().split(/\s+/);
    if (words.length !== 2) {
        return false;
    }

    const lowerPhrase = phrase.toLowerCase();
    return !bannedWords.some(word => lowerPhrase.includes(word.toLowerCase()));
}

/**
 * Deterministic fallback phrase generator based on mood distribution
 */
export function deterministicMonthPhrase(moodTotals: Record<string, number>): string {
    const { highEnergy, mediumEnergy, lowEnergy, total } = categorizeMoodEnergy(moodTotals);

    if (total === 0) {
        return "Quiet Pause";
    }

    const highPct = (highEnergy / total) * 100;
    const lowPct = (lowEnergy / total) * 100;

    // High energy dominant
    if (highPct > 60) {
        return "Bright Surge";
    }
    if (highPct > 40) {
        return "Vivid Momentum";
    }

    // Low energy dominant
    if (lowPct > 60) {
        return "Silent Current";
    }
    if (lowPct > 40) {
        return "Gentle Drift";
    }

    // Balanced
    if (highPct > 30 && lowPct > 30) {
        return "Shifting Tides";
    }

    return "Steady Flow";
}

/**
 * Generate a 2-word phrase that captures the month's emotional essence
 * NOTE: Temporarily using deterministic fallback until secure edge function is available
 */
export async function generateMonthPhrase(
    moodTotals: Record<string, number>,
    bannedWords: string[]
): Promise<string> {
    // Temporarily use deterministic fallback until secure edge function is available
    return deterministicMonthPhrase(moodTotals);
}


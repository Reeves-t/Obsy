import { callGemini } from "@/services/ai";

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
 * Generate a 2-word phrase using AI that captures the month's emotional essence
 */
export async function generateMonthPhrase(
    moodTotals: Record<string, number>,
    bannedWords: string[]
): Promise<string> {
    const { highEnergy, mediumEnergy, lowEnergy, total } = categorizeMoodEnergy(moodTotals);

    if (total === 0) {
        return deterministicMonthPhrase(moodTotals);
    }

    const highPct = Math.round((highEnergy / total) * 100);
    const medPct = Math.round((mediumEnergy / total) * 100);
    const lowPct = Math.round((lowEnergy / total) * 100);

    const prompt = `Generate a 2-word phrase (exactly 2 words, Title Case) that captures this month's emotional essence.

Rules:
- EXACTLY 2 words, no more, no less
- Title Case (e.g., "Silent Current")
- Do NOT use these words: ${bannedWords.join(", ")}
- Minimal, aesthetic, creative tone
- NOT therapy-ish or self-help
- Return ONLY the 2-word phrase, nothing else

Mood distribution:
- High energy: ${highPct}%
- Medium energy: ${medPct}%
- Low energy: ${lowPct}%

Output format: Two Words`;

    try {
        const response = await callGemini([{ text: prompt }]);
        const phrase = response.trim();

        // Validate the response
        if (validateMonthPhrase(phrase, bannedWords)) {
            return phrase;
        }

        // Retry once with stricter prompt
        const retryPrompt = `${prompt}\n\nIMPORTANT: Previous response was invalid. Return ONLY 2 words in Title Case. No punctuation.`;
        const retryResponse = await callGemini([{ text: retryPrompt }]);
        const retryPhrase = retryResponse.trim();

        if (validateMonthPhrase(retryPhrase, bannedWords)) {
            return retryPhrase;
        }

        // Fallback to deterministic
        return deterministicMonthPhrase(moodTotals);
    } catch (error) {
        console.error("[monthPhraseGenerator] AI generation failed:", error);
        return deterministicMonthPhrase(moodTotals);
    }
}


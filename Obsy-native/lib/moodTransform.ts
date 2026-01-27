import { MoodId } from '@/constants/Moods';

/**
 * Transforms raw mood IDs into natural language descriptions.
 * This prevents mood label leakage in AI prompts - instead of exposing
 * the exact mood vocabulary (e.g., "grateful", "scattered"), the AI
 * receives descriptive prose that conveys the feeling without using
 * the exact label words.
 */

const MOOD_DESCRIPTIONS: Record<MoodId, string> = {
    // Low energy moods
    calm: "a settled, unhurried state",
    relaxed: "loose and at ease",
    peaceful: "quiet and undisturbed",
    tired: "low on energy, needing rest",
    drained: "depleted and running on empty",
    bored: "unstimulated and looking for engagement",
    reflective: "turned inward, contemplating",
    melancholy: "a heavy, wistful stillness",
    nostalgic: "dwelling in distant memories",
    lonely: "disconnected and seeking presence",
    depressed: "weighed down and withdrawn",
    numb: "emotionally distant and muted",
    safe: "settled and protected",

    // Medium energy moods
    neutral: "steady and unremarkable",
    focused: "locked in and attentive",
    grateful: "a quiet sense of appreciation",
    hopeful: "looking forward with anticipation",
    curious: "drawn to explore and understand",
    scattered: "pulled in multiple directions",
    annoyed: "mildly irritated and impatient",
    unbothered: "indifferent and unfazed",
    awkward: "uncomfortable and unsure",
    tender: "soft and emotionally open",

    // High energy moods
    productive: "in motion and getting things done",
    creative: "generative and imaginative",
    inspired: "sparked and full of ideas",
    confident: "self-assured and capable",
    joyful: "bright and lighthearted",
    social: "energized by connection",
    busy: "occupied and in demand",
    restless: "unable to settle, seeking motion",
    stressed: "pressured and on edge",
    overwhelmed: "flooded with too much at once",
    anxious: "tense and alert to threat",
    angry: "hot and resistant",
    pressured: "pushed by external demands",
    enthusiastic: "eager and forward-leaning",
    hyped: "buzzing with anticipation",
    manic: "accelerated and hard to contain",
    playful: "light and mischievous",
};

/**
 * Converts a mood ID into natural language description.
 * @param moodId - The raw mood identifier from the capture
 * @returns A descriptive phrase that conveys the feeling without using the exact mood word
 */
export function transformMoodToNaturalLanguage(moodId: string | undefined | null): string {
    if (!moodId) {
        return "a complex emotional state";
    }

    const description = MOOD_DESCRIPTIONS[moodId as MoodId];
    return description || "a complex emotional state";
}

/**
 * Gets the list of all mood IDs that should be banned from AI output.
 * Used for validation and constraint enforcement.
 */
export function getBannedMoodLabels(): string[] {
    return Object.keys(MOOD_DESCRIPTIONS);
}


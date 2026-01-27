import { MoodId } from "@/constants/Moods";

/**
 * Color mapping for moods based on energy tone
 * - Low tone moods: Cool blues/purples
 * - Medium tone moods: Neutral/warm grays
 * - High tone moods: Warm oranges/yellows/reds
 */
export const MOOD_COLOR_MAP: Record<MoodId, string> = {
    // Low energy - Cool tones, desaturated
    numb: "#8B99A6",        // Cool slate (lowest saturation)
    relaxed: "#5EBAAB",     // Soft teal-green (clean, distinct)
    calm: "#6A9FB5",        // Ocean blue
    peaceful: "#7CB3D1",    // Lighter sky blue
    tired: "#7B8AB8",       // Dusty denim
    drained: "#5C6A9E",     // Deep navy-gray
    bored: "#949CB0",       // Muted lavender-gray
    lonely: "#5B6FA0",      // Somber blue
    depressed: "#4A5690",   // Darkest indigo

    // Refined Low energy - Purples/Lit hues
    reflective: "#9FA8DA",  // Soft purple-blue
    melancholy: "#8A7FB5",  // Muted Royal purple
    nostalgic: "#C4A7C7",   // Soft lavender
    safe: "#9EB7E5",        // Gentle powder blue

    // Neutral energy - Anchors & Transitions
    neutral: "#A9A9A9",     // True neutral gray
    hopeful: "#7EC8E3",     // Clear sky blue (optimistic)
    focused: "#829AB1",     // Steel blue
    grateful: "#A3B18A",    // Sage green
    curious: "#B992D0",     // Bright orchid
    scattered: "#D1D5DB",   // Light fog gray
    annoyed: "#A5A5A5",     // Warm gray
    unbothered: "#B0BCC8",  // Air blue
    awkward: "#9CA3AF",     // Medium gray
    tender: "#E2B6CF",      // Dusty rose

    // High energy - Warm, vibrant
    productive: "#0EA5E9",  // Electric blue (high energy focus)
    creative: "#FBBF24",    // Amber yellow
    inspired: "#F59E0B",    // Golden orange
    confident: "#FB923C",   // Sunset orange
    joyful: "#F472B6",     // Pink hibiscus
    social: "#FB7185",      // Watermelon
    busy: "#F43F5E",        // Rose red
    restless: "#EF4444",    // Bright red
    stressed: "#DC2626",    // Blood orange
    overwhelmed: "#B91C1C", // Deep crimson
    anxious: "#E11D48",     // Hot pink-red
    angry: "#991B1B",       // Darkest red
    pressured: "#E53E3E",   // Warning red
    enthusiastic: "#F6AD55",// Peach
    hyped: "#FFD700",       // Pure gold
    manic: "#FF00FF",       // Electric magenta
    playful: "#F97316",     // Safety orange
};

/**
 * Get the color for a given mood ID
 * @param moodId - The mood identifier
 * @returns Hex color string
 */
export function getMoodColor(moodId: string): string {
    return MOOD_COLOR_MAP[moodId as MoodId] ?? "#9CA3AF";
}

/**
 * Get all banned words (mood labels) for AI summary generation
 * These words should not appear in the AI-generated monthly summaries
 */
export function getBannedMoodWords(): string[] {
    return [
        // Low energy
        "calm", "relaxed", "peaceful", "tired", "drained", "bored", "reflective",
        "melancholy", "nostalgic", "lonely", "depressed", "numb", "safe",
        // Medium energy
        "neutral", "focused", "grateful", "hopeful", "curious", "scattered",
        "annoyed", "unbothered", "awkward", "tender",
        // High energy
        "productive", "creative", "inspired", "confident", "joyful", "social",
        "busy", "restless", "stressed", "overwhelmed", "anxious", "angry",
        "pressured", "enthusiastic", "hyped", "manic", "playful"
    ];
}


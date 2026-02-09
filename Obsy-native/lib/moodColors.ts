import { MoodId } from "@/constants/Moods";

/**
 * Color mapping for moods based on energy tone with improved differentiation
 *
 * - Low energy moods: Cool tones distributed across teal (165°) → blue (220°) → purple (285°)
 *   Creates distinct visual zones to prevent similar blues from blending together
 *
 * - Neutral energy moods: Varied neutral tones with subtle warm/cool biases
 *   Eliminates gray redundancy while maintaining neutral emotional quality
 *
 * - High energy moods: Warm tones with reds spread from burgundy (345°) → orange-red (30°)
 *   Maintains intensity while ensuring reds are visually distinguishable
 *
 * All colors maintain semantic meaning (calm feels calm, stressed feels intense)
 * while providing sufficient visual contrast for quick identification.
 */
export const MOOD_COLOR_MAP: Record<MoodId, string> = {
    // Low energy - Cool tones with better hue distribution (teal → blue → purple)
    numb: "#8B9CA6",        // Cool slate (lowest saturation)
    relaxed: "#5EBAAB",     // Soft teal-green (165° - distinct)
    calm: "#6BA5D4",        // True sky blue (210° - clearer separation)
    peaceful: "#87D4D4",    // Cyan/aqua (180° - unique in palette)
    tired: "#8B88C4",       // Periwinkle (240° - distinct purple-blue)
    drained: "#6B7C9E",     // Navy-gray (slightly warmer blue)
    bored: "#A4A4BE",       // Cool lavender-gray (desaturated purple)
    lonely: "#5A7AA8",      // Medium blue (215° - between calm/tired)
    depressed: "#4A5580",   // Darker indigo (235° - somber depth)

    // Refined Low energy - Purples/Lilac hues (250°-285°)
    reflective: "#A4A0E0",  // Soft purple (250° - contemplative)
    melancholy: "#8978C8",  // Richer purple (265° - emotional depth)
    nostalgic: "#C4A0D8",   // Orchid/lilac (285° - wistful)
    safe: "#9AC4C4",        // Soft teal (180° - calm sanctuary)

    // Neutral energy - Anchors & Transitions with varied neutral tones
    neutral: "#A8A8A8",     // True neutral gray (pure, no hue bias)
    hopeful: "#7EC8E3",     // Clear sky blue (optimistic, already distinct)
    focused: "#829AB1",     // Steel blue (concentration, already distinct)
    grateful: "#A3B18A",    // Sage green (grounded warmth, already distinct)
    curious: "#B992D0",     // Bright orchid (exploration, already distinct)
    scattered: "#C8C8BE",   // Warm beige-gray (unfocused warmth)
    annoyed: "#B8A890",     // Taupe/tan (irritated warmth)
    unbothered: "#B0BCC8",  // Air blue (detached coolness)
    awkward: "#B0A8B0",     // Mauve-gray (uncomfortable neutrality)
    tender: "#E2B6CF",      // Dusty rose (gentle affection, already distinct)

    // High energy - Warm, vibrant with better red distribution
    productive: "#0EA5E9",  // Electric blue (high energy focus, already distinct)
    creative: "#FBBF24",    // Amber yellow (already distinct)
    inspired: "#F59E0B",    // Golden orange (already distinct)
    confident: "#FB923C",   // Sunset orange (already distinct)
    joyful: "#F472B6",      // Pink hibiscus (already distinct)
    social: "#FB7185",      // Watermelon (already distinct)
    busy: "#FF6B6B",        // Coral-red (15° - softer, less harsh)
    restless: "#FF7A59",    // Orange-red (12° - agitated energy)
    stressed: "#DC2626",    // Blood red (0° - alarm, intense)
    overwhelmed: "#991C3D", // Burgundy (345° - heavy, oppressive)
    anxious: "#D946A6",     // Hot pink-magenta (320° - nervous energy)
    angry: "#991B1B",       // Darkest red (0° - pure rage)
    pressured: "#F25C54",   // Tomato red (5° - urgent tension)
    enthusiastic: "#F6AD55",// Peach (already distinct)
    hyped: "#FFD700",       // Pure gold (already distinct)
    manic: "#FF00FF",       // Electric magenta (already distinct)
    playful: "#F97316",     // Safety orange (already distinct)
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


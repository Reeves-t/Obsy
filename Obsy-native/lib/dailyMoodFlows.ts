import { Capture } from "@/types/capture";
import { resolveMoodColorById, getMoodLabel } from "@/lib/moodUtils";

/**
 * A segment in the mood flow bar (old/legacy format)
 */
export interface MoodSegment {
    mood: string;
    percentage: number;
    color: string;
    context?: string;
}

/**
 * A named mood flow reading (new format)
 */
export interface MoodFlowReading {
    title: string;
    subtitle: string;
    confidence: number;
    tags?: string[];
}

/**
 * Union type for mood flow data - supports both old and new formats
 */
export type MoodFlowData = MoodSegment[] | MoodFlowReading;

/**
 * Type guard to check if mood flow data is in the new Reading format
 */
export function isMoodFlowReading(data: any): data is MoodFlowReading {
    return data && typeof data === 'object' && !Array.isArray(data) &&
           typeof data.title === 'string' && typeof data.subtitle === 'string';
}

/**
 * Type guard to check if mood flow data is in the old Segments format
 */
export function isMoodFlowSegments(data: any): data is MoodSegment[] {
    return Array.isArray(data) && (data.length === 0 ||
           (data[0] && typeof data[0].mood === 'string' && typeof data[0].percentage === 'number'));
}

/**
 * Daily mood flow data structure
 */
export interface DailyMoodFlowData {
    segments: MoodSegment[];
    dominant: string;
    totalCaptures: number;
}

/**
 * Format a Date object to YYYY-MM-DD date key
 */
export function formatDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

/**
 * Extract date portion from ISO string as local date key
 * Note: This extracts the date as it appears in the ISO string,
 * which may differ from local date. Use with caution.
 */
export function getLocalDateKey(isoString: string): string {
    // Parse as local date to get correct date key
    const date = new Date(isoString);
    return formatDateKey(date);
}

/**
 * Compute daily mood flow data from captures
 * @param captures - Array of captures for a single day
 * @returns DailyMoodFlowData with segments, dominant mood, and total count
 */
export function computeDailyMoodFlow(captures: Capture[]): DailyMoodFlowData {
    if (captures.length === 0) {
        return {
            segments: [],
            dominant: "neutral",
            totalCaptures: 0,
        };
    }

    // Sort captures chronologically by created_at
    const sortedCaptures = [...captures].sort((a, b) => {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    // Count occurrences of each mood ID
    const moodCounts: Record<string, number> = {};
    const moodLastIndex: Record<string, number> = {};
    const moodSnapshots: Record<string, string> = {};
    const moodNotes: Record<string, string[]> = {};

    sortedCaptures.forEach((capture, index) => {
        const moodId = capture.mood_id || "neutral";
        moodCounts[moodId] = (moodCounts[moodId] || 0) + 1;
        moodLastIndex[moodId] = index;
        if (capture.mood_name_snapshot) {
            moodSnapshots[moodId] = capture.mood_name_snapshot;
        }
        // Collect notes for context-aware naming
        if (capture.note) {
            if (!moodNotes[moodId]) moodNotes[moodId] = [];
            moodNotes[moodId].push(capture.note);
        }
    });

    const totalCaptures = sortedCaptures.length;

    // Helper to validate and resolve mood labels
    const resolveLabel = (moodId: string): string => {
        const snapshot = moodSnapshots[moodId];
        // If snapshot looks like a raw ID (e.g., "custom_abc123"), resolve it
        const isValidSnapshot = snapshot && !snapshot.startsWith('custom_') && snapshot !== moodId;
        return isValidSnapshot ? snapshot : getMoodLabel(moodId, snapshot);
    };

    // Build segments array with percentages and descriptive names
    const segments: MoodSegment[] = Object.entries(moodCounts)
        .map(([moodId, count]) => {
            const label = resolveLabel(moodId);
            const notes = moodNotes[moodId] || [];
            const descriptiveName = getDescriptiveMoodName(moodId, label, notes);
            // Use first note as context if available
            const context = notes.length > 0 ? notes[0].slice(0, 80) : undefined;
            return {
                mood: descriptiveName,
                percentage: (count / totalCaptures) * 100,
                color: resolveMoodColorById(moodId, label),
                context,
            };
        })
        .sort((a, b) => b.percentage - a.percentage);

    // Determine dominant mood (most frequent)
    // Tie-breaker: most recently used mood
    let dominantId = "neutral";
    let maxCount = 0;
    let latestIndex = -1;

    for (const [moodId, count] of Object.entries(moodCounts)) {
        const lastIndex = moodLastIndex[moodId];
        if (count > maxCount || (count === maxCount && lastIndex > latestIndex)) {
            dominantId = moodId;
            maxCount = count;
            latestIndex = lastIndex;
        }
    }

    return {
        segments,
        dominant: resolveLabel(dominantId),
        totalCaptures,
    };
}

/**
 * Filter captures for a specific date key
 * @param captures - All captures
 * @param dateKey - Date key in YYYY-MM-DD format
 * @returns Captures matching the date key
 */
export function filterCapturesForDate(captures: Capture[], dateKey: string): Capture[] {
    return captures.filter((capture) => {
        const captureDate = getLocalDateKey(capture.created_at);
        return captureDate === dateKey;
    });
}

/**
 * Get all unique date keys from captures
 */
export function getUniqueDateKeys(captures: Capture[]): string[] {
    const dateKeys = new Set<string>();
    captures.forEach((capture) => {
        dateKeys.add(getLocalDateKey(capture.created_at));
    });
    return Array.from(dateKeys).sort();
}

/**
 * Format a month key from a Date object
 */
export function formatMonthKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
}

/**
 * Descriptive mood name mapping for mood flow segments.
 * Transforms generic mood labels into evocative phrases that capture the feeling.
 */
const DESCRIPTIVE_MOOD_NAMES: Record<string, string[]> = {
    calm: ["quiet stillness", "settled ease", "soft composure"],
    relaxed: ["easy drift", "gentle unwinding", "loose calm"],
    peaceful: ["deep serenity", "still contentment", "tranquil presence"],
    tired: ["heavy weight", "slow fatigue", "dull weariness"],
    drained: ["spent energy", "hollow exhaustion", "fading reserves"],
    bored: ["idle restlessness", "flat stillness", "empty waiting"],
    reflective: ["inward gaze", "quiet contemplation", "thoughtful pause"],
    melancholy: ["soft ache", "wistful longing", "gentle heaviness"],
    nostalgic: ["distant warmth", "fading echoes", "bittersweet recall"],
    lonely: ["quiet absence", "hollow distance", "solitary hush"],
    depressed: ["deep weight", "muted presence", "sunken stillness"],
    numb: ["flat detachment", "hollow quiet", "absent feeling"],
    safe: ["grounded warmth", "sheltered ease", "quiet security"],
    neutral: ["steady baseline", "even keel", "unremarkable flow"],
    focused: ["sharp intent", "locked attention", "clear direction"],
    grateful: ["warm appreciation", "quiet thankfulness", "gentle abundance"],
    hopeful: ["rising optimism", "forward glow", "bright possibility"],
    curious: ["eager wonder", "open inquiry", "searching interest"],
    scattered: ["loose threads", "fragmented attention", "scattered drift"],
    annoyed: ["prickly edge", "simmering friction", "sharp irritation"],
    unbothered: ["easy indifference", "light detachment", "cool composure"],
    awkward: ["uneasy shift", "clumsy tension", "off-balance moment"],
    tender: ["soft vulnerability", "gentle openness", "delicate warmth"],
    productive: ["steady output", "active momentum", "purposeful drive"],
    creative: ["sparked imagination", "flowing invention", "vibrant creation"],
    inspired: ["lifted vision", "bright spark", "elevated thinking"],
    confident: ["bold assurance", "steady certainty", "grounded strength"],
    joyful: ["bright delight", "rising joy", "warm elation"],
    social: ["lively connection", "warm exchange", "vibrant togetherness"],
    busy: ["constant motion", "packed momentum", "relentless pace"],
    restless: ["fidgeting energy", "unsettled drive", "churning motion"],
    stressed: ["taut pressure", "mounting tension", "tight unease"],
    overwhelmed: ["crushing flood", "breaking point", "total saturation"],
    anxious: ["buzzing worry", "restless unease", "nervous anticipation"],
    angry: ["hot intensity", "burning edge", "fierce friction"],
    pressured: ["building weight", "closing walls", "forced urgency"],
    enthusiastic: ["surging excitement", "bright eagerness", "forward energy"],
    hyped: ["electric charge", "peak intensity", "raw excitement"],
    manic: ["wild acceleration", "uncontained surge", "frantic pulse"],
    playful: ["light mischief", "carefree spark", "bouncing energy"],
};

/**
 * Get a descriptive mood name for mood flow segments.
 * Uses the mood label (lowercased) to find a random evocative phrase.
 * Falls back to original label if no mapping exists.
 */
export function getDescriptiveMoodName(moodId: string, label: string, notes?: string[]): string {
    const key = label.toLowerCase().trim();
    const options = DESCRIPTIVE_MOOD_NAMES[key];

    if (!options || options.length === 0) {
        return label; // Fallback to original label
    }

    // Use a simple hash of moodId + notes to get consistent but varied selection
    const hash = (moodId + (notes?.join('') || '')).split('').reduce((acc, char) => {
        return ((acc << 5) - acc) + char.charCodeAt(0);
    }, 0);

    const index = Math.abs(hash) % options.length;
    return options[index];
}


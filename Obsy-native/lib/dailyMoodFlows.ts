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

    sortedCaptures.forEach((capture, index) => {
        const moodId = capture.mood_id || "neutral";
        moodCounts[moodId] = (moodCounts[moodId] || 0) + 1;
        moodLastIndex[moodId] = index;
        if (capture.mood_name_snapshot) {
            moodSnapshots[moodId] = capture.mood_name_snapshot;
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

    // Build segments array with percentages
    const segments: MoodSegment[] = Object.entries(moodCounts)
        .map(([moodId, count]) => {
            const label = resolveLabel(moodId);
            return {
                mood: label,
                percentage: (count / totalCaptures) * 100,
                color: resolveMoodColorById(moodId, label),
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


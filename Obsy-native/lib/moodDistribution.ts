import { getMoodTheme } from "@/lib/moods";
import { DailyMoodFlowData } from "@/lib/dailyMoodFlows";

export const HEX_COLOR_RE = /^#?[0-9A-Fa-f]{6}$/;

/** Fallback color drawn when a month has no captures at all. */
export const EMPTY_MONTH_COLOR = "#3f3f46";

export interface MoodDistributionEntry {
    mood: string;
    percentage: number;
    color: string;
}

/**
 * Ensure a color string is a valid 6-digit hex.
 * Returns the color if valid, otherwise a fallback.
 */
export function safeHex(color: string | undefined, fallback = "#9CA3AF"): string {
    if (color && HEX_COLOR_RE.test(color)) return color.startsWith("#") ? color : `#${color}`;
    return fallback;
}

/**
 * Format date key for a specific day in month
 */
export function getDateKeyForDay(year: number, month: number, day: number): string {
    const m = String(month + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    return `${year}-${m}-${d}`;
}

/**
 * Compute mood distribution from daily flows for the month
 * Uses full segment totals per mood (not just dominant) for accurate distribution
 */
export function computeMoodDistribution(
    dailyFlows: Record<string, DailyMoodFlowData>,
    daysInMonth: number,
    monthYear: { year: number; month: number }
): MoodDistributionEntry[] {
    const moodTotals: Record<string, number> = {};
    const moodColors: Record<string, string> = {};
    const moodLabels: Record<string, string> = {};
    let totalWeight = 0;

    // Aggregate by moodId (original ID) instead of descriptive name to avoid
    // splitting the same mood across multiple entries with different labels
    for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = getDateKeyForDay(monthYear.year, monthYear.month, day);
        const flowData = dailyFlows[dateKey];
        if (flowData && flowData.segments && flowData.segments.length > 0) {
            for (const segment of flowData.segments) {
                const weight = segment.percentage * flowData.totalCaptures / 100;
                // Use moodId as the aggregation key when available; fall back to mood name
                const key = segment.moodId || segment.mood;
                moodTotals[key] = (moodTotals[key] || 0) + weight;
                // Resolve color from the canonical theme using moodId
                if (!moodColors[key]) {
                    if (segment.moodId) {
                        moodColors[key] = getMoodTheme(segment.moodId).solid;
                    } else if (segment.color && HEX_COLOR_RE.test(segment.color)) {
                        moodColors[key] = segment.color;
                    }
                }
                if (!moodLabels[key]) {
                    moodLabels[key] = segment.mood;
                }
                totalWeight += weight;
            }
        }
    }

    if (totalWeight === 0) {
        return [{ mood: "neutral", percentage: 100, color: EMPTY_MONTH_COLOR }];
    }

    const distribution = Object.entries(moodTotals)
        .map(([key, weight]) => {
            const color = (moodColors[key] && HEX_COLOR_RE.test(moodColors[key]))
                ? moodColors[key]
                : getMoodTheme(key).solid;
            return { mood: moodLabels[key] || key, percentage: (weight / totalWeight) * 100, color };
        })
        .sort((a, b) => b.percentage - a.percentage);

    return distribution;
}

/** Max color stops the ring shader accepts (its uniform arrays are fixed-size). */
export const MAX_GRADIENT_STOPS = 8;

export interface GradientStops {
    /** Number of active stops (1..MAX_GRADIENT_STOPS). */
    count: number;
    /** RGB vec3s (0..1), padded to MAX_GRADIENT_STOPS entries. */
    colors: Array<[number, number, number]>;
    /** Cumulative midpoint positions (0..1), padded to MAX_GRADIENT_STOPS entries. */
    mids: number[];
}

export function hexToRgba(hex: string, alpha: number): string {
    const h = safeHex(hex).replace("#", "");
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

function hexToVec3(hex: string): [number, number, number] {
    const h = safeHex(hex).replace("#", "");
    const n = parseInt(h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * Convert a mood distribution (sorted desc by percentage) into fixed-size
 * gradient stop arrays for the ring shader. Distributions with more than
 * MAX_GRADIENT_STOPS moods are truncated to the top stops and renormalized —
 * the tail is visually invisible on the ring anyway.
 */
export function distributionToGradientStops(distribution: MoodDistributionEntry[]): GradientStops {
    const kept = distribution.slice(0, MAX_GRADIENT_STOPS);
    const total = kept.reduce((sum, item) => sum + item.percentage, 0) || 1;

    const colors: Array<[number, number, number]> = [];
    const mids: number[] = [];
    let cumulative = 0;
    for (const item of kept) {
        const pct = item.percentage / total;
        mids.push(cumulative + pct / 2);
        colors.push(hexToVec3(item.color));
        cumulative += pct;
    }

    const count = kept.length;
    while (colors.length < MAX_GRADIENT_STOPS) {
        colors.push(colors[colors.length - 1] ?? [0.25, 0.25, 0.27]);
        mids.push(1);
    }

    return { count, colors, mids };
}

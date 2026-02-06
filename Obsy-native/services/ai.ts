import { AiToneId, getToneDefinition, DEFAULT_AI_TONE_ID } from "@/lib/aiTone";
import { AlbumContextEntry } from "@/lib/albumEngine";
import { PRIVACY_FLAGS } from "@/lib/privacyFlags";
import {
    CaptureForInsight,
    getTimeBucketForDate,
    getDayPart,
    formatLocalTimeLabel,
    WeekSummaryForInsight,
    MonthSummaryForInsight,
    DaySummaryForInsight
} from "@/lib/insightTime";
import {
    buildDailyInsightPrompt,
    buildWeeklyInsightPrompt,
    buildMonthlyInsightPrompt,
    DailyInsightContext,
    WeeklyInsightContext,
    MonthlyInsightContext,
    LANGUAGE_CONSTRAINTS,
    CUSTOM_TONE_WRAPPER
} from "@/lib/insightPrompts";

import { transformMoodToNaturalLanguage } from "@/lib/moodTransform";
import { getCustomToneById } from "@/lib/customTone";
import { isPresetTone } from "@/lib/aiTone";

/**
 * ⚠️ DEPRECATED - MIGRATION COMPLETE ⚠️
 *
 * This file is kept for reference only. All functions throw runtime errors.
 * All AI generation has been successfully migrated to services/secureAI.ts
 *
 * Security Issues (RESOLVED):
 * ✓ API keys no longer exposed in client bundle
 * ✓ Prompts hidden from users
 * ✓ Server-side rate limiting enforced
 * ✓ Authentication required for all AI calls
 *
 * Migration Completed:
 * ✓ generateDailySummary() → generateDailyInsightSecure()
 * ✓ generateWeeklyInsight() → generateWeeklyInsightSecure()
 * ✓ generateMonthlyInsight() → generateMonthlyInsightSecure()
 * ✓ generateCaptureInsight() → generateCaptureInsightSecure()
 * ✓ generateAlbumInsight() → generateAlbumInsightSecure()
 * ✓ generateTagReflection() → generateTagInsightSecure()
 * ✓ AiSettings type → moved to services/secureAI.ts
 * ✓ InsightSentence type → available in services/dailyInsights.ts
 *
 * This file will be removed in a future cleanup.
 * See: services/secureAI.ts and SECURITY_SETUP.md
 */

export interface CaptureInsightInput {
    imageDescription?: string; // Opt-in premium photo description
    mood?: string;
    note?: string;
    capturedAt?: string; // ISO string
    tags?: string[];
    imageUrl?: string; // Sourced from local storage, only used if usePhotoForInsight is true
    usePhotoForInsight?: boolean;
}

export interface DailySummaryInput {
    dateLabel: string; // e.g., "Wednesday, Nov 19"
    captures: CaptureInsightInput[];
    dominantMood?: string;
}

export interface AiSettings {
    tone: AiToneId;
    selectedCustomToneId?: string; // New field
    autoDailyInsights: boolean;
    useJournalInInsights: boolean;
}


// Helper to map input to CaptureForInsight
function mapToCaptureForInsight(input: CaptureInsightInput, index: number): CaptureForInsight {
    const date = input.capturedAt ? new Date(input.capturedAt) : new Date();
    return {
        id: `cap-${index}`,
        capturedAt: input.capturedAt || date.toISOString(),
        localTimeLabel: formatLocalTimeLabel(date),
        timeBucket: getTimeBucketForDate(date),
        dayPart: getDayPart(date),
        mood: input.mood || "neutral",
        hasJournal: !!input.note,
        journalSnippet: input.note,
        tags: input.tags,
        imageDescription: input.imageDescription,
        usePhotoForInsight: !!input.usePhotoForInsight,
    };
}

/** @deprecated Image processing has been moved to the secure edge function */
export async function fetchImageAsBase64(imageUrl: string): Promise<string | null> {
    throw new Error(
        "DEPRECATED: fetchImageAsBase64() is no longer available. " +
        "Image processing has been moved to the secure edge function. " +
        "See SECURITY_SETUP.md for migration guide."
    );
}

// Interface for the new sentence-based insight format
export interface InsightSentence {
    text: string;
    highlight: boolean;
    color?: 'emerald' | 'purple' | 'orange';
}

export interface InsightMeta {
    type: 'daily' | 'weekly';
    entryCount: number;
    weekRange?: string;
}

export interface DailySummaryResult {
    summary: string; // Plain text summary (for backwards compatibility)
    sentences: InsightSentence[]; // Structured sentences with highlights
    vibe_tags: string[];
    mood_colors: string[];
    mood_flow: any[];
    meta?: InsightMeta;
}

// Helper to convert sentences array to plain text summary
function sentencesToSummary(sentences: InsightSentence[]): string {
    return sentences.map(s => s.text).join(' ');
}

/** @deprecated Use generateDailyInsightSecure from services/secureAI.ts */
export async function generateDailySummary(
    input: DailySummaryInput,
    settings: AiSettings
): Promise<DailySummaryResult> {
    throw new Error(
        "DEPRECATED: generateDailySummary() is no longer available. " +
        "Use generateDailyInsightSecure() from services/secureAI.ts instead. " +
        "See SECURITY_SETUP.md for migration guide."
    );
}

/** @deprecated Use generateCaptureInsightSecure from services/secureAI.ts */
export async function generateCaptureInsight(
    capture: CaptureInsightInput,
    settings: AiSettings
): Promise<string> {
    throw new Error(
        "DEPRECATED: generateCaptureInsight() is no longer available. " +
        "Use generateCaptureInsightSecure() from services/secureAI.ts instead. " +
        "See SECURITY_SETUP.md for migration guide."
    );
}

/** @deprecated Use secure edge function instead */
export async function generateCompletion(parts: any[]): Promise<string> {
    throw new Error(
        "DEPRECATED: generateCompletion() is no longer available. " +
        "Use the secure edge function from services/secureAI.ts instead. " +
        "See SECURITY_SETUP.md for migration guide."
    );
}

/** @deprecated Use secure edge function instead */
export async function callGemini(parts: any[]): Promise<string> {
    throw new Error(
        "DEPRECATED: callGemini() is no longer available. " +
        "This file (services/ai.ts) has been deprecated for security reasons. " +
        "Use the secure functions from services/secureAI.ts instead. " +
        "See SECURITY_SETUP.md for migration guide."
    );
}

// --- Weekly & Monthly Insight Logic ---

export interface WeeklyInsightInput {
    startDate: string;
    endDate: string;
    captures: CaptureInsightInput[];
    weekLabel?: string;
}

function groupCapturesByDay(captures: CaptureInsightInput[]): DaySummaryForInsight[] {
    const grouped: Record<string, CaptureInsightInput[]> = {};

    captures.forEach(c => {
        const dateStr = c.capturedAt ? c.capturedAt.split('T')[0] : new Date().toISOString().split('T')[0];
        if (!grouped[dateStr]) grouped[dateStr] = [];
        grouped[dateStr].push(c);
    });

    const sortedDates = Object.keys(grouped).sort();

    return sortedDates.map(dateStr => {
        const dayCaptures = grouped[dateStr];
        // Sort captures by time
        dayCaptures.sort((a, b) => new Date(a.capturedAt || 0).getTime() - new Date(b.capturedAt || 0).getTime());

        const dateObj = new Date(dateStr);
        const primaryMoods = Array.from(new Set(dayCaptures.map(c => c.mood || 'neutral')));

        return {
            dateISO: dateStr,
            dateLabel: dateObj.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }),
            weekdayLabel: dateObj.toLocaleDateString(undefined, { weekday: 'long' }),
            primaryMoods,
            captures: dayCaptures.map(mapToCaptureForInsight)
        };
    });
}

export interface WeeklyInsightResult {
    content: string; // Plain text summary (for backwards compatibility)
    sentences: InsightSentence[]; // Structured sentences with highlights
    meta?: InsightMeta;
}

/** @deprecated Use generateWeeklyInsightSecure from services/secureAI.ts */
export async function generateWeeklyInsight(
    input: WeeklyInsightInput,
    settings: AiSettings
): Promise<WeeklyInsightResult> {
    throw new Error(
        "DEPRECATED: generateWeeklyInsight() is no longer available. " +
        "Use generateWeeklyInsightSecure() from services/secureAI.ts instead. " +
        "See SECURITY_SETUP.md for migration guide."
    );
}

import { MonthSignals } from "./monthlySummaries";

export interface MonthlyInsightInput {
    monthLabel: string; // e.g. "November 2024"
    signals: MonthSignals;
}

/** @deprecated Use generateMonthlyInsightSecure from services/secureAI.ts */
export async function generateMonthlyInsight(
    input: MonthlyInsightInput,
    settings: AiSettings
): Promise<string> {
    throw new Error(
        "DEPRECATED: generateMonthlyInsight() is no longer available. " +
        "Use generateMonthlyInsightSecure() from services/secureAI.ts instead. " +
        "See SECURITY_SETUP.md for migration guide."
    );
}

/** @deprecated Use generateTagInsightSecure from services/secureAI.ts */
export async function generateTagReflection(
    tag: string,
    captures: CaptureInsightInput[],
    settings: AiSettings
): Promise<string> {
    throw new Error(
        "DEPRECATED: generateTagReflection() is no longer available. " +
        "Use generateTagInsightSecure() from services/secureAI.ts instead. " +
        "See SECURITY_SETUP.md for migration guide."
    );
}

/** @deprecated Migrate to secure edge function */
export async function generateObsyNote(
    imageUrl: string,
    mood: string,
    isPremium: boolean = false,
    userConsentGiven: boolean = false
): Promise<string | null> {
    throw new Error(
        "DEPRECATED: generateObsyNote() is no longer available. " +
        "This feature has been migrated to generateCaptureInsightSecure(). " +
        "See app/capture/review.tsx for the new implementation."
    );
}

/** @deprecated Use generateAlbumInsightSecure from services/secureAI.ts */
export async function generateAlbumInsight(
    context: AlbumContextEntry[],
    tone: AiToneId
): Promise<string> {
    throw new Error(
        "DEPRECATED: generateAlbumInsight() is no longer available. " +
        "Use generateAlbumInsightSecure() from services/secureAI.ts instead. " +
        "See SECURITY_SETUP.md for migration guide."
    );
}

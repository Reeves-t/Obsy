/**
 * Secure AI Service
 * 
 * Calls the Supabase Edge Function instead of Gemini directly.
 * This keeps API keys and prompts server-side.
 * 
 * Benefits:
 * - API key never exposed to client
 * - Prompts hidden from users
 * - Rate limiting enforced server-side
 * - Authentication required
 */

import { supabase } from '@/lib/supabase';
import { AiToneId } from '@/lib/aiTone';

export type InsightType = 'daily' | 'weekly' | 'capture' | 'album' | 'tag' | 'month';

export interface AiSettings {
    tone: AiToneId;
    selectedCustomToneId?: string;
    autoDailyInsights: boolean;
    useJournalInInsights: boolean;
}

export interface CaptureData {
    mood: string;
    note?: string;
    capturedAt: string;
    tags?: string[];
    timeBucket?: string;
}

export interface AlbumEntry {
    user_name: string;
    mood: string;
    description: string;
    time: string;
}

export interface MonthSignals {
    dominantMood: string;
    runnerUpMood?: string;
    activeDays: number;
    volatilityScore: number;
    last7DaysShift: string;
}

export interface InsightRequest {
    type: InsightType;
    data: {
        captures?: CaptureData[];
        dateLabel?: string;
        weekLabel?: string;
        monthLabel?: string;
        tag?: string;
        albumContext?: AlbumEntry[];
        signals?: MonthSignals;
    };
    tone: string;
    customTonePrompt?: string;
}

export interface InsightResponse {
    result?: string;
    error?: string;
    limit?: number;
    current?: number;
    tier?: string;
}

/**
 * Generate an AI insight via the secure edge function
 * 
 * @throws Error if not authenticated or rate limited
 */
export async function generateSecureInsight(request: InsightRequest): Promise<string> {
    // Get current session for auth header
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
        throw new Error('Authentication required for AI insights');
    }

    const response = await supabase.functions.invoke<InsightResponse>('generate-insight', {
        body: request,
        headers: {
            Authorization: `Bearer ${session.access_token}`
        }
    });

    if (response.error) {
        console.error('[SecureAI] Edge function error:', response.error);
        throw new Error(response.error.message || 'AI generation failed');
    }

    const data = response.data;

    if (!data) {
        throw new Error('No response from AI service');
    }

    if (data.error) {
        if (data.error === 'Rate limit exceeded') {
            throw new Error(`Rate limit reached (${data.current}/${data.limit} for ${data.tier} tier)`);
        }
        throw new Error(data.error);
    }

    if (!data.result) {
        throw new Error('Empty response from AI service');
    }

    return data.result;
}

/**
 * Generate a daily insight
 */
export async function generateDailyInsightSecure(
    dateLabel: string,
    captures: CaptureData[],
    tone: string,
    customTonePrompt?: string
): Promise<{ insight: string; vibe_tags?: string[]; mood_colors?: string[] }> {
    const result = await generateSecureInsight({
        type: 'daily',
        data: { dateLabel, captures },
        tone,
        customTonePrompt,
    });

    // Try to parse JSON response
    try {
        const cleaned = result.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleaned);
    } catch {
        // Return plain text as insight
        return { insight: result };
    }
}

/**
 * Generate a weekly insight
 */
export async function generateWeeklyInsightSecure(
    weekLabel: string,
    captures: CaptureData[],
    tone: string,
    customTonePrompt?: string
): Promise<{ insight: string }> {
    const result = await generateSecureInsight({
        type: 'weekly',
        data: { weekLabel, captures },
        tone,
        customTonePrompt,
    });

    try {
        const cleaned = result.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleaned);
    } catch {
        return { insight: result };
    }
}

/**
 * Generate a monthly narrative
 */
export async function generateMonthlyInsightSecure(
    monthLabel: string,
    signals: MonthSignals,
    tone: string,
    customTonePrompt?: string
): Promise<string> {
    return generateSecureInsight({
        type: 'month',
        data: { monthLabel, signals },
        tone,
        customTonePrompt,
    });
}

/**
 * Generate a single-capture reflection
 */
export async function generateCaptureInsightSecure(
    capture: CaptureData,
    tone: string,
    customTonePrompt?: string
): Promise<string> {
    return generateSecureInsight({
        type: 'capture',
        data: { captures: [capture] },
        tone,
        customTonePrompt,
    });
}

/**
 * Generate an album insight
 */
export async function generateAlbumInsightSecure(
    albumContext: AlbumEntry[],
    tone: string
): Promise<string> {
    return generateSecureInsight({
        type: 'album',
        data: { albumContext },
        tone,
    });
}

/**
 * Generate a tag reflection
 */
export async function generateTagInsightSecure(
    tag: string,
    captures: CaptureData[],
    tone: string
): Promise<string> {
    return generateSecureInsight({
        type: 'tag',
        data: { tag, captures },
        tone,
    });
}

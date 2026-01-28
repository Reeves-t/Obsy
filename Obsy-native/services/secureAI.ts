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
import { AiToneId, getToneDefinition, isPresetTone } from '@/lib/aiTone';
import { getCustomToneById } from '@/lib/customTone';

export type InsightType = 'daily' | 'weekly' | 'capture' | 'album' | 'tag' | 'month';

/**
 * Resolves a tone ID to its actual prompt text.
 * - For preset tones: returns styleGuidelines from aiTone.ts
 * - For custom tones: fetches prompt from custom_ai_tones table
 * Returns both the name and prompt for custom tones.
 */
export async function resolveTonePrompt(
    toneId: string,
    selectedCustomToneId?: string
): Promise<{ resolvedTone: string; resolvedPrompt: string; toneName?: string }> {
    // If a custom tone is selected, fetch its prompt from the database
    if (selectedCustomToneId) {
        try {
            const customTone = await getCustomToneById(selectedCustomToneId);
            if (customTone?.prompt) {
                console.log('[SecureAI] Using custom tone:', customTone.name);
                return {
                    resolvedTone: customTone.name, // Return actual custom tone name, not "custom"
                    resolvedPrompt: customTone.prompt,
                    toneName: customTone.name
                };
            }
        } catch (error) {
            console.error('[SecureAI] Failed to fetch custom tone, falling back to preset:', error);
        }
    }

    // For preset tones, get the styleGuidelines
    if (isPresetTone(toneId)) {
        const definition = getToneDefinition(toneId as AiToneId);
        console.log('[SecureAI] Using preset tone:', definition.label);
        return {
            resolvedTone: toneId,
            resolvedPrompt: definition.styleGuidelines,
            toneName: definition.label
        };
    }

    // Fallback to neutral
    const neutralDef = getToneDefinition('neutral');
    console.log('[SecureAI] Falling back to neutral tone');
    return {
        resolvedTone: 'neutral',
        resolvedPrompt: neutralDef.styleGuidelines,
        toneName: neutralDef.label
    };
}

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
    // Try to get session, refreshing if needed
    let { data: { session } } = await supabase.auth.getSession();

    // If no session, try refreshing (handles expired access tokens)
    if (!session) {
        console.log('[SecureAI] No session found, attempting refresh...');
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) {
            console.error('[SecureAI] Session refresh failed:', refreshError.message);
        }
        session = refreshData.session;
    }

    // Still no session? User needs to log in
    if (!session) {
        // Double-check with getUser() as a fallback
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            throw new Error('Authentication required for AI insights. Please sign in.');
        }
        // User exists but no session - this shouldn't happen, but handle it
        throw new Error('Session expired. Please sign out and sign back in.');
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

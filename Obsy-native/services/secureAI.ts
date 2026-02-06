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
import { MoodSegment, MoodFlowReading, MoodFlowData } from '@/lib/dailyMoodFlows';

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

async function invokeGenerateInsight(request: InsightRequest): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        throw new Error('Authentication required for AI insights. Please sign in.');
    }

    const response = await supabase.functions.invoke<InsightResponse>('generate-insight', {
        body: request,
        headers: {
            Authorization: `Bearer ${session.access_token}`
        }
    });

    if (response.error) {
        throw new Error(response.error.message || 'AI generation failed');
    }

    const data = response.data;
    if (!data) {
        throw new Error('No response from AI service');
    }
    if (!data.ok && data.error) {
        throw new Error(`[${data.error.stage}] ${data.error.message}`);
    }
    if (!data.result) {
        throw new Error('Empty response from AI service');
    }
    return data.result;
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
    dayPart?: string;
    localTimeLabel?: string;
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
    ok: boolean;
    result?: string;
    requestId?: string;
    error?: {
        stage: 'auth' | 'fetch' | 'model' | 'parse' | 'validate' | 'unknown';
        message: string;
        requestId: string;
        status: number;
    };
}


/**
 * Generate fallback mood flow from captures when AI fails to provide one.
 * Groups captures by mood, calculates percentages, and assigns colors.
 * Exported for testing purposes.
 */
export function generateFallbackMoodFlow(captures: CaptureData[]): MoodSegment[] {
    if (!captures || captures.length === 0) {
        return [];
    }

    // Sort captures chronologically
    const sortedCaptures = [...captures].sort((a, b) =>
        new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
    );

    // Group by mood and count occurrences
    const moodCounts: Record<string, { count: number; firstIndex: number }> = {};
    sortedCaptures.forEach((c, index) => {
        const mood = c.mood || 'neutral';
        if (!moodCounts[mood]) {
            moodCounts[mood] = { count: 0, firstIndex: index };
        }
        moodCounts[mood].count++;
    });

    // Convert to segments with percentages
    const totalCaptures = sortedCaptures.length;
    const segments: MoodSegment[] = Object.entries(moodCounts)
        .sort(([, a], [, b]) => a.firstIndex - b.firstIndex) // Sort by first occurrence (chronological)
        .map(([mood, data]) => {
            const percentage = Math.round((data.count / totalCaptures) * 100);
            // Use a simple color mapping for fallback
            const color = getFallbackMoodColor(mood);
            return {
                mood: formatMoodPhrase(mood),
                percentage,
                color
            };
        });

    // Ensure percentages sum to 100
    const totalPercentage = segments.reduce((sum, s) => sum + s.percentage, 0);
    if (totalPercentage !== 100 && segments.length > 0) {
        segments[segments.length - 1].percentage += (100 - totalPercentage);
    }

    console.log('[generateFallbackMoodFlow] Generated fallback with', segments.length, 'segments');
    return segments;
}

/**
 * Get a fallback color for a mood (used when AI doesn't provide one)
 */
function getFallbackMoodColor(mood: string): string {
    const moodLower = mood.toLowerCase();
    // Simple color mapping for common moods
    const colorMap: Record<string, string> = {
        'happy': '#FFD93D',
        'content': '#A8E6CF',
        'calm': '#87CEEB',
        'peaceful': '#B4D7E8',
        'excited': '#FF6B6B',
        'energetic': '#FF8C42',
        'anxious': '#9B59B6',
        'stressed': '#E74C3C',
        'sad': '#5DADE2',
        'tired': '#95A5A6',
        'frustrated': '#E67E22',
        'neutral': '#9CA3AF'
    };
    return colorMap[moodLower] || '#9CA3AF';
}

/**
 * Format a raw mood label into a descriptive phrase
 */
function formatMoodPhrase(mood: string): string {
    const phraseMap: Record<string, string> = {
        'happy': 'quiet contentment',
        'content': 'settled satisfaction',
        'calm': 'gentle stillness',
        'peaceful': 'serene ease',
        'excited': 'bright energy',
        'energetic': 'vibrant momentum',
        'anxious': 'restless undercurrent',
        'stressed': 'tense pressure',
        'sad': 'heavy weight',
        'tired': 'quiet fatigue',
        'frustrated': 'simmering tension',
        'neutral': 'steady baseline'
    };
    return phraseMap[mood.toLowerCase()] || mood;
}

/**
 * Generate a daily insight
 * Supports both old schema (mood_flow array) and new schema (mood_flow object)
 */
/**
 * Generate a single-capture reflection
 */
export async function generateCaptureInsightSecure(
    capture: CaptureData,
    tone: string,
    customTonePrompt?: string
): Promise<string> {
    return invokeGenerateInsight({
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
    return invokeGenerateInsight({
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
    return invokeGenerateInsight({
        type: 'tag',
        data: { tag, captures },
        tone,
    });
}

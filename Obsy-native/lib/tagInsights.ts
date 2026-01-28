import { Capture } from '@/types/capture';
import { AiSettings, generateTagInsightSecure, CaptureData } from '@/services/secureAI';
import { getMoodLabel } from '@/lib/moodUtils';

export interface TagInsight {
    tag: string;
    count: number;
    captures: Capture[];
    reflection: string | null;
}

export async function generateTagInsight(
    captures: Capture[],
    tag: string,
    settings: AiSettings
): Promise<string> {
    // Convert Captures to CaptureData format for secure AI
    // Use mood_name_snapshot as primary source, fallback to getMoodLabel for resolution
    const insightInputs: CaptureData[] = captures.map(c => ({
        mood: c.mood_name_snapshot || getMoodLabel(c.mood_id || 'neutral'),
        note: c.note || undefined,
        capturedAt: c.created_at,
        tags: c.tags,
        // Note: secureAI doesn't support image analysis yet, so we omit imageUrl
    }));

    try {
        return await generateTagInsightSecure(tag, insightInputs, settings.tone);
    } catch (error: any) {
        console.error("Error generating tag insight:", error);

        // Handle rate limit errors
        if (error.message?.includes("Rate limit")) {
            return "Rate limit reached. Upgrade to Vanguard for unlimited tag insights.";
        }
        // Handle auth errors
        if (error.message?.includes("Authentication required")) {
            return "Authentication required. Please sign in again.";
        }
        // Handle all other errors
        return "Failed to generate tag insight. Please try again.";
    }
}

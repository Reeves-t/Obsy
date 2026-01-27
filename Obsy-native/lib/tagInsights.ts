import { Capture } from '@/types/capture';
import { AiSettings, generateTagReflection } from '@/services/ai';
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
    // Convert Captures to CaptureInsightInput
    // Use mood_name_snapshot as primary source, fallback to getMoodLabel for resolution
    const insightInputs = captures.map(c => ({
        mood: c.mood_name_snapshot || getMoodLabel(c.mood_id || 'neutral'),
        note: c.note || undefined,
        capturedAt: c.created_at,
        imageUrl: c.image_url,
        tags: c.tags,
    }));

    return await generateTagReflection(tag, insightInputs, settings);
}

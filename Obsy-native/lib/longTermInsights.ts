import { AiSettings } from "@/services/secureAI";
import { getCustomToneById } from "@/lib/customTone";

/**
 * Helper function to extract tone and custom tone prompt from AiSettings.
 * Retained for downstream callers that still rely on tone resolution.
 */
export async function extractToneSettings(settings: AiSettings): Promise<{ tone: string; customTonePrompt?: string }> {
    const tone = settings.tone;
    let customTonePrompt: string | undefined;

    if (settings.selectedCustomToneId) {
        const customTone = await getCustomToneById(settings.selectedCustomToneId);
        if (customTone) {
            customTonePrompt = customTone.prompt;
        }
    }

    return { tone, customTonePrompt };
}

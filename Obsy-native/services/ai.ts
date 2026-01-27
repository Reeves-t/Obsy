import { AiToneId, getToneDefinition, DEFAULT_AI_TONE_ID } from "@/lib/aiTone";
import { AlbumContextEntry } from "@/lib/albumEngine";
import { PRIVACY_FLAGS } from "@/lib/privacyFlags";
import {
    CaptureForInsight,
    getTimeBucketForDate,
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
        mood: input.mood || "neutral",
        hasJournal: !!input.note,
        journalSnippet: input.note,
        tags: input.tags,
        imageDescription: input.imageDescription,
        usePhotoForInsight: !!input.usePhotoForInsight,
    };
}

export async function fetchImageAsBase64(imageUrl: string): Promise<string | null> {
    try {
        const res = await fetch(imageUrl);
        if (!res.ok) return null;
        const blob = await res.blob();
        return await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result;
                if (typeof result === "string") {
                    // result is like "data:image/jpeg;base64,XXXXX"
                    const [, base64] = result.split(",");
                    resolve(base64);
                } else {
                    reject(new Error("Unexpected FileReader result"));
                }
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (err) {
        console.error("[AI] Failed to fetch image as base64", err);
        return null;
    }
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

export async function generateDailySummary(
    input: DailySummaryInput,
    settings: AiSettings
): Promise<DailySummaryResult> {

    // 1. Sort captures by time ASC
    const sortedCaptures = [...input.captures].sort((a, b) => {
        const tA = new Date(a.capturedAt || 0).getTime();
        const tB = new Date(b.capturedAt || 0).getTime();
        return tA - tB;
    });

    // 2. Map to CaptureForInsight
    const capturesForInsight = sortedCaptures.map(mapToCaptureForInsight);

    // 3. Resolve Tone Prompt
    let styleGuidelines = '';
    const isCustom = !isPresetTone(settings.tone);

    if (isCustom && settings.selectedCustomToneId) {
        const customTone = await getCustomToneById(settings.selectedCustomToneId);
        if (customTone) {
            styleGuidelines = CUSTOM_TONE_WRAPPER.replace('{CUSTOM_TONE_TEXT}', customTone.prompt);
        }
    }

    const toneDef = getToneDefinition(isCustom ? 'neutral' : settings.tone);
    if (!styleGuidelines) {
        styleGuidelines = toneDef.styleGuidelines;
    }

    // 4. Build Prompt
    // Note: We need a way to pass custom styleGuidelines to prompt builders.
    // For now, let's manually build the final prompt text or modify insightPrompts.ts
    // to accept styleGuidelines override. I'll stick to the plan: modify ai.ts to use the wrapper.

    const ctx: DailyInsightContext = {
        dateLabel: input.dateLabel,
        captures: capturesForInsight,
        aiToneId: isCustom ? 'neutral' : settings.tone
    };

    let promptText = buildDailyInsightPrompt(ctx);

    // Inject custom style guidelines if present
    if (isCustom && styleGuidelines) {
        // TONE STYLE: dynamic injection after rules but before content
        // Since DAILY builder doesn't have TONE STYLE section, we inject it after Hard Constraints
        promptText = promptText.replace('ENTRY COUNT & LENGTH RULES (HARD CONSTRAINTS):', `TONE STYLE:\n${styleGuidelines}\n\nENTRY COUNT & LENGTH RULES (HARD CONSTRAINTS):`);
    } else if (!isCustom) {
        // Standard tone guidelines injection
        promptText = promptText.replace('ENTRY COUNT & LENGTH RULES (HARD CONSTRAINTS):', `TONE STYLE:\n${toneDef.styleGuidelines}\n\nENTRY COUNT & LENGTH RULES (HARD CONSTRAINTS):`);
    }

    const parts: any[] = [];

    // Privacy Guard: Transient Image Processing for Photo Descriptions
    // We only send images that the user explicitly opted-in for per-capture.
    const imagesToSend = input.captures
        .filter(c => c.usePhotoForInsight === true && c.imageUrl)
        .slice(0, 3); // Limit to 3 to avoid payload bloat

    console.log(`[AI] Photo guardrail: ${imagesToSend.length} of ${input.captures.length} photos included for insight`);

    for (const cap of imagesToSend) {
        if (cap.imageUrl) {
            const base64 = await fetchImageAsBase64(cap.imageUrl);
            if (base64) {
                parts.push({
                    inlineData: {
                        mimeType: "image/jpeg",
                        data: base64
                    }
                });
            }
        }
    }

    parts.push({ text: promptText });

    const responseText = await callGemini(parts);

    try {
        // Clean up potential markdown code blocks
        const cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
        const data = JSON.parse(cleanJson);

        // Handle new simplified format
        const insightText = data.insight || data.summary || "No insight generated.";

        // Convert plain text insight to legacy sentences array for UI compatibility
        // until components are fully updated to just use text.
        const sentences: InsightSentence[] = insightText
            .split(/(?<=[.!?])\s+/)
            .map((text: string) => ({ text, highlight: false }));

        return {
            summary: insightText,
            sentences,
            vibe_tags: Array.isArray(data.vibe_tags) ? data.vibe_tags : [],
            mood_colors: Array.isArray(data.mood_colors) ? data.mood_colors : [],
            mood_flow: Array.isArray(data.mood_flow) ? data.mood_flow : [],
            meta: data.meta
        };
    } catch (e) {
        console.error("Failed to parse AI JSON response", e);
        // Fallback for plain text or failed parse
        return {
            summary: responseText,
            sentences: [{ text: responseText, highlight: false }],
            vibe_tags: [],
            mood_colors: [],
            mood_flow: []
        };
    }
}

export async function generateCaptureInsight(
    capture: CaptureInsightInput,
    settings: AiSettings
): Promise<string> {
    // For single capture, we can also use vision if we want, but for now keeping it text-based 
    // or we can upgrade it too. Let's keep it simple for now as requested, but using the new callGemini structure.

    const lengthInstructions =
        settings.tone === "neutral"
            ? "Write 1 short sentence."
            : "Write 1–2 concise sentences.";


    const safetyInstructions = `
You are generating a tiny reflection for a single captured moment.
Do NOT give advice or therapy.
Keep it aesthetic and observational.
`;

    const journalInstruction = settings.useJournalInInsights
        ? "You MAY lightly reference the note if it helps describe the moment."
        : "Ignore the note and focus only on the mood and visual impression.";

    const mood = capture.mood ? `Mood: ${capture.mood}.` : "";
    const note =
        capture.note && settings.useJournalInInsights
            ? `Note from user: "${capture.note.slice(0, 160)}".`
            : "";

    const baseDescription =
        capture.imageDescription ??
        "A single captured object or scene from the user's day.";

    const isCustom = !isPresetTone(settings.tone);
    let styleGuidelines = '';
    let toneLabel = '';

    if (isCustom && settings.selectedCustomToneId) {
        const customTone = await getCustomToneById(settings.selectedCustomToneId);
        if (customTone) {
            styleGuidelines = CUSTOM_TONE_WRAPPER.replace('{CUSTOM_TONE_TEXT}', customTone.prompt);
            toneLabel = customTone.name;
        }
    }

    const toneConfig = getToneDefinition(isCustom ? DEFAULT_AI_TONE_ID : settings.tone);


    if (!styleGuidelines) {
        styleGuidelines = toneConfig.styleGuidelines;
    }
    if (!toneLabel) {
        toneLabel = toneConfig.label;
    }

    const prompt = `
${safetyInstructions}

Tone: ${toneLabel}
Style Guidelines: ${styleGuidelines}
${lengthInstructions}
${journalInstruction}

Moment description: ${baseDescription}
${mood}
${note}

Write a tiny reflection for this moment.
`;


    return await callGemini([{ text: prompt }]);
}

// Exported wrapper for generic completion
export async function generateCompletion(parts: any[]): Promise<string> {
    return await callGemini(parts);
}

export async function callGemini(parts: any[]): Promise<string> {
    const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("EXPO_PUBLIC_GEMINI_API_KEY is missing");
    }

    // Helper to make the actual fetch
    const makeRequest = async (model: string, contentParts: any[]) => {
        console.log(`Attempting to call Gemini API with model: ${model}...`);
        // console.log('Request parts:', JSON.stringify(contentParts, null, 2));

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ parts: contentParts }] }),
            }
        );

        const data = await response.json();
        // console.log('Gemini API Response:', JSON.stringify(data, null, 2));

        if (!response.ok) {
            // If it's a 404, it means model not found. Throw specific error to trigger retry.
            if (response.status === 404) {
                throw new Error(`Model ${model} not found (404)`);
            }
            throw new Error(data.error?.message || `Failed to generate content with ${model}`);
        }

        if (data.promptFeedback?.blockReason) {
            console.error("Gemini blocked content:", data.promptFeedback);
            throw new Error(`AI content blocked: ${data.promptFeedback.blockReason}`);
        }

        const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!generatedText) {
            console.error('No text in AI response. Full response:', data);
            console.error('Candidates:', data.candidates);
            if (data.candidates?.[0]) {
                console.error('First candidate:', data.candidates[0]);
                console.error('Finish reason:', data.candidates[0].finishReason);
            }
        }

        return generatedText || "No content generated.";
    };

    // List of models to try in order of preference
    // We try specific versions first as they are sometimes more stable than aliases
    const candidateModels = [
        "gemini-flash-latest",
        "gemini-pro-latest",
        "gemini-1.5-flash",
        "gemini-1.5-flash-001",
        "gemini-1.5-flash-002",
        "gemini-1.5-pro",
        "gemini-1.5-pro-001",
        "gemini-1.5-pro-002",
        "gemini-1.0-pro" // Fallback to 1.0 pro
    ];

    // Try each model
    for (const model of candidateModels) {
        try {
            return await makeRequest(model, parts);
        } catch (error: any) {
            console.warn(`Model ${model} failed:`, error.message);
            // If it's not a 404 (e.g. 400 Bad Request, 403 Forbidden), it might be a payload issue or key issue.
            // But we continue trying other models just in case.
            // Exception: If it's a 403, it might be the key itself, but different models might have different permissions? Unlikely but possible.
        }
    }

    // If all failed, try to list models to help debug
    try {
        console.log("All models failed. Listing available models...");
        const listResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        );
        const listData = await listResponse.json();
        console.log("Available Models:", listData);

        if (listData.models) {
            const availableNames = listData.models.map((m: any) => m.name).join(", ");
            throw new Error(`All attempted models failed. Available models: ${availableNames}`);
        }
    } catch (listError) {
        console.error("Failed to list models:", listError);
    }

    throw new Error("AI generation failed. Could not find a working Gemini model.");
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

export async function generateWeeklyInsight(
    input: WeeklyInsightInput,
    settings: AiSettings
): Promise<WeeklyInsightResult> {
    const days = groupCapturesByDay(input.captures);

    const weekSummary: WeekSummaryForInsight = {
        weekLabel: input.weekLabel || `Week of ${input.startDate} - ${input.endDate}`,
        days
    };

    const isCustom = settings.tone.includes('-');
    let styleGuidelines = '';

    if (isCustom && settings.selectedCustomToneId) {
        const customTone = await getCustomToneById(settings.selectedCustomToneId);
        if (customTone) {
            styleGuidelines = CUSTOM_TONE_WRAPPER.replace('{CUSTOM_TONE_TEXT}', customTone.prompt);
        }
    }

    const toneDef = getToneDefinition(isCustom ? 'neutral' : settings.tone);
    if (!styleGuidelines) {
        styleGuidelines = toneDef.styleGuidelines;
    }

    const ctx: WeeklyInsightContext = {
        week: weekSummary,
        aiToneId: isCustom ? 'neutral' : settings.tone
    };

    let prompt = buildWeeklyInsightPrompt(ctx);

    // Inject custom style guidelines
    if (isCustom && styleGuidelines) {
        // Find existing tone section if any or insert before constraints
        prompt = prompt.replace(/TONE STYLE:[\s\S]*?(?=LANGUAGE CONSTRAINTS|GENERAL RULES|ENTRY COUNT)/, `TONE STYLE:\n${styleGuidelines}\n\n`);
    }

    const responseText = await callGemini([{ text: prompt }]);


    try {
        // Clean up potential markdown code blocks
        const cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
        const data = JSON.parse(cleanJson);

        // Handle new simplified format
        const insightText = data.insight || data.content || responseText;

        // Convert to legacy sentences for UI compatibility
        const sentences: InsightSentence[] = insightText
            .split(/(?<=[.!?])\s+/)
            .map((text: string) => ({ text, highlight: false }));

        return {
            content: insightText,
            sentences,
            meta: data.meta
        };
    } catch (e) {
        console.error("Failed to parse weekly insight JSON response", e);
        // Fallback for plain text or failed parse
        return {
            content: responseText,
            sentences: [{ text: responseText, highlight: false }]
        };
    }
}

import { MonthSignals } from "./monthlySummaries";

export interface MonthlyInsightInput {
    monthLabel: string; // e.g. "November 2024"
    signals: MonthSignals;
}

export async function generateMonthlyInsight(
    input: MonthlyInsightInput,
    settings: AiSettings
): Promise<string> {
    const { signals, monthLabel } = input;

    const isCustom = !isPresetTone(settings.tone);
    let styleGuidelines = "";
    let toneLabel = "";

    if (isCustom && settings.selectedCustomToneId) {
        const customTone = await getCustomToneById(settings.selectedCustomToneId);
        if (customTone) {
            styleGuidelines = CUSTOM_TONE_WRAPPER.replace("{CUSTOM_TONE_TEXT}", customTone.prompt);
            toneLabel = customTone.name;
        }
    }

    const toneDef = getToneDefinition(isCustom ? DEFAULT_AI_TONE_ID : settings.tone);
    if (!styleGuidelines) {
        styleGuidelines = toneDef.styleGuidelines;
    }
    if (!toneLabel) {
        toneLabel = toneDef.label;
    }

    const prompt = `You are an insightful observer analyzing a month's worth of life experiences.
    
    MONTH: ${monthLabel}
    TONE: ${toneLabel}
    STYLE GUIDELINES:
    ${styleGuidelines}

    DATA SIGNALS:
    - Dominant Mood: ${signals.dominantMood}
    - Runner up: ${signals.runnerUpMood || "none"}
    - Active days: ${signals.activeDays}
    - Volatility: ${Math.round(signals.volatilityScore * 100)}%
    - Recent momentum: ${signals.last7DaysShift}

    TASK: Write a summarized reflection of this month using the selected tone.

    RULES:
    ${LANGUAGE_CONSTRAINTS}
    - Use the selected tone strictly.
    - Focus on the internal narrative, emotional arc, and rhythm of the month.
    - DO NOT include raw numbers or list data points (e.g., avoid "15 days", "30 captures", etc.).
    - Paint a picture of how the month felt and evolved.
    - NEVER mention "journal", "photos", "entries", "captures", or "captured".
    - Base your insight ONLY on the provided data signals.
    - 3–5 sentences max.

    Write the monthly narrative now.`;

    return await callGemini([{ text: prompt }]);
}

export async function generateTagReflection(
    tag: string,
    captures: CaptureInsightInput[],
    settings: AiSettings
): Promise<string> {
    const isCustom = !isPresetTone(settings.tone);
    let styleGuidelines = '';
    let toneLabel = '';

    if (isCustom && settings.selectedCustomToneId) {
        const customTone = await getCustomToneById(settings.selectedCustomToneId);
        if (customTone) {
            styleGuidelines = CUSTOM_TONE_WRAPPER.replace('{CUSTOM_TONE_TEXT}', customTone.prompt);
            toneLabel = customTone.name;
        }
    }

    const toneConfig = getToneDefinition(isCustom ? DEFAULT_AI_TONE_ID : settings.tone);
    if (!styleGuidelines) {
        styleGuidelines = toneConfig.styleGuidelines;
    }

    // Filter captures that actually have this tag (just in case)
    const relevantCaptures = captures.filter(c => c.tags?.includes(tag));

    if (relevantCaptures.length === 0) {
        return `No captures found for tag #${tag}.`;
    }

    // Transform moods to natural language descriptions to prevent label leakage
    const descriptions = relevantCaptures.map(c => {
        const date = c.capturedAt ? new Date(c.capturedAt).toLocaleDateString() : 'Unknown date';
        const feelingDesc = c.mood ? transformMoodToNaturalLanguage(c.mood) : '';
        const feeling = feelingDesc ? `Feeling: ${feelingDesc}` : '';
        const note = c.note ? `Note: ${c.note}` : '';
        return `- [${date}] ${feeling} ${note}`;
    }).join('\n');

    const prompt = `
    You are generating a micro-insight for the tag: #${tag}.

    Tone: ${toneLabel || toneConfig.label}
    Style Guidelines: ${styleGuidelines}
    ${LANGUAGE_CONSTRAINTS}

    Here are the user's captures associated with this tag:
    ${descriptions}

    Write a short, insightful reflection (1-2 sentences) about what this tag seems to represent for the user based on these moments.
    Focus on patterns and the vibe of this collection.
    Do not be generic. Be specific to the content provided.
    `;

    return await callGemini([{ text: prompt }]);
}

export async function generateObsyNote(
    imageUrl: string,
    mood: string,
    isPremium: boolean = false,
    userConsentGiven: boolean = false
): Promise<string | null> {
    // Technical Execution Spec: Runtime Guards (MANDATORY)
    if (!isPremium) {
        if (PRIVACY_FLAGS.ENABLE_PRIVACY_LOGS) console.warn("[PRIVACY] Photo description blocked: Not premium");
        return null;
    }

    if (!userConsentGiven) {
        if (PRIVACY_FLAGS.ENABLE_PRIVACY_LOGS) console.warn("[PRIVACY] Photo description blocked: No consent");
        return null;
    }

    try {
        const base64 = await fetchImageAsBase64(imageUrl);
        if (!base64) return null;

        const prompt = `
        Analyze this image and the user's mood: "${mood}".
        Write a 2-sentence aesthetic description of the scene (the "Obsy Note").
        
        Style:
        - Observational, poetic, slightly mysterious.
        - Focus on lighting, texture, and the feeling of the moment.
        - Do NOT mention the user directly.
        - Do NOT be generic.
        `;

        const parts = [
            { text: prompt },
            {
                inlineData: {
                    mimeType: "image/jpeg",
                    data: base64
                }
            }
        ];

        const response = await callGemini(parts);
        return response.trim();
    } catch (error) {
        console.error("Failed to generate Obsy Note:", error);
        return null;
    }
}

export async function generateAlbumInsight(
    context: AlbumContextEntry[],
    tone: AiToneId
): Promise<string> {
    const toneConfig = getToneDefinition(tone);

    // Sort chronologically just in case
    const sortedContext = [...context].sort((a, b) => a.time.localeCompare(b.time));

    // Build entries with transformed mood descriptions to prevent label leakage
    const entriesText = sortedContext.map(entry => {
        const feelingDesc = transformMoodToNaturalLanguage(entry.mood);
        return `${entry.user_name}: ${entry.description} (feeling: ${feelingDesc})`;
    }).join('\n');

    const uniqueUsers = Array.from(new Set(sortedContext.map(c => c.user_name)));
    const usersList = uniqueUsers.join(", ");

    // Dynamic length instruction based on entry count
    const entryCount = sortedContext.length;
    const lengthInstruction = entryCount <= 3
        ? "Keep the response concise (max 3 sentences). Focus on the singular vibe or essence of the moment."
        : entryCount <= 6
            ? "Write a moderate narrative (4-6 sentences). Capture the flow of the day."
            : "You may write a detailed narrative. Weave the moments into a rich story.";

    const prompt = `
You are a novelist capturing the emotional essence of a shared album's day. Create a flowing narrative, NOT a logbook.

Entries (ordered from morning to night):
${entriesText}

CRITICAL RULES:
${LANGUAGE_CONSTRAINTS}
1. CHRONOLOGY: Do NOT mention specific times like "At 8:00 PM" or "At 19:07". Let the narrative flow naturally from morning vibes to evening energy without rigid time logging.
2. LENGTH: ${lengthInstruction}
3. NAMES: You MUST mention these users by name: ${usersList}.

Tone: ${toneConfig.label}
Style: ${toneConfig.styleGuidelines}

Write a cohesive story that interprets the feelings and captures the group's shared experience. Be a storyteller, not a recorder.
`;

    return await callGemini([{ text: prompt }]);
}

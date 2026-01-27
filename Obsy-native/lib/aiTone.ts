export type AiToneId =
    | 'neutral'
    | 'stoic_calm'
    | 'dry_humor'
    | 'mystery_noir'
    | 'cinematic'
    | 'dreamlike'
    | 'romantic'
    | 'gentle_roast'
    | 'inspiring'
    | 'custom' // Sentinel for custom tones
    | (string & {}); // Support for custom tone UUIDs in memory


export interface AiToneDefinition {
    id: AiToneId;
    label: string;
    shortDescription: string;
    styleGuidelines: string;
}

export const AI_TONES: AiToneDefinition[] = [
    {
        id: 'neutral',
        label: 'Neutral',
        shortDescription: 'Plain, observant, balanced.',
        styleGuidelines: `
Use a plain, observant, and balanced tone.
Avoid emotional push or strong interpretations.
Act as a clear mirror of the user's day.
Keep sentences straightforward and descriptive.
`,
    },
    {
        id: 'stoic_calm',
        label: 'Stoic / Calm',
        shortDescription: 'Restrained, grounded, steady.',
        styleGuidelines: `
Use a restrained, grounded, and steady tone.
Use short sentences and avoid unnecessary commentary.
Focus on acceptance and calm observation.
`,
    },
    {
        id: 'dry_humor',
        label: 'Dry Humor',
        shortDescription: 'Subtle, intelligent humor.',
        styleGuidelines: `
Use subtle, intelligent humor and observational wit.
Never be silly or mocking.
One light observational twist at most per insight.
Keep it grounded and dry.
`,
    },
    {
        id: 'mystery_noir',
        label: 'Mystery / Noir',
        shortDescription: 'Atmospheric, shadowed.',
        styleGuidelines: `
Use an atmospheric, shadowed, and noir-inspired tone.
Suggest more than you explain.
Focus on quiet tension, low-light energy, and "clues" in the day.
`,
    },
    {
        id: 'cinematic',
        label: 'Cinematic',
        shortDescription: 'Narrative, visual.',
        styleGuidelines: `
Describe the day like a scene or sequence in a film.
Focus on a sense of motion or stillness.
Use visual framing and narrative flow.
`,
    },
    {
        id: 'dreamlike',
        label: 'Dreamlike',
        shortDescription: 'Soft, abstract, fluid.',
        styleGuidelines: `
Use a soft, abstract, and fluid tone.
Focus on gentle imagery and atmosphere over logic.
No sharp conclusions or clinical observations.
`,
    },
    {
        id: 'romantic',
        label: 'Romantic',
        shortDescription: 'Warm, intimate, emotionally close.',
        styleGuidelines: `
Use a warm, intimate, and emotionally close tone.
You may romanticize heavy moods without trying to fix them.
Avoid being cheesy or overly dramatic; keep it tasteful.
`,
    },
    {
        id: 'gentle_roast',
        label: 'Gentle Roast',
        shortDescription: 'Light teasing, affectionate.',
        styleGuidelines: `
Use a light, teasing, and affectionate tone.
Never be mean or judgmental; the humor is always on the user's side.
Keep it playful and warm.
`,
    },
    {
        id: 'inspiring',
        label: 'Inspiring',
        shortDescription: 'Uplifting but grounded.',
        styleGuidelines: `
Use an uplifting but grounded tone.
Avoid clichés, slogans, or toxic positivity.
Focus on quiet forward motion and steady resolve.
`,
    },
];

export const DEFAULT_AI_TONE_ID: AiToneId = 'neutral';

export function getToneDefinition(id: AiToneId | null | undefined): AiToneDefinition {
    return AI_TONES.find(t => t.id === id) ?? AI_TONES.find(t => t.id === DEFAULT_AI_TONE_ID)!;
}

export interface ActiveTone extends AiToneDefinition {
    source: 'preset' | 'custom';
}

// Preset tone IDs (used for DB constraint validation)
export const PRESET_TONE_IDS = [
    'neutral',
    'stoic_calm',
    'dry_humor',
    'mystery_noir',
    'cinematic',
    'dreamlike',
    'romantic',
    'gentle_roast',
    'inspiring',
] as const;

export function isPresetTone(toneId: string | null | undefined): boolean {
    if (!toneId) return false;
    return PRESET_TONE_IDS.includes(toneId as any);
}


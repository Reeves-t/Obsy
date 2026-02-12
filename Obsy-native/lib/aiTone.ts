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
        styleGuidelines: `Vocabulary: Plain, clear, unadorned. Prefer common words over literary ones.
Rhythm: Even sentence lengths. Steady pacing. No dramatic variation.
Imagery: Minimal. Only describe what is directly present.
Emotional weight: Observational distance. Note what happened without interpreting why.
Think: a calm witness with no agenda.`,
    },
    {
        id: 'stoic_calm',
        label: 'Stoic / Calm',
        shortDescription: 'Restrained, grounded, steady.',
        styleGuidelines: `Vocabulary: Sparse, deliberate, measured. Every word must earn its place.
Rhythm: Short sentences dominate. Occasional longer sentence for grounding. No rushing.
Imagery: Stripped back. Bare landscape. Only essential details.
Emotional weight: Acceptance without commentary. Stillness even in turbulence. No flinching.
Think: Marcus Aurelius writing a journal entry. Gravity without drama.`,
    },
    {
        id: 'dry_humor',
        label: 'Dry Humor',
        shortDescription: 'Subtle, intelligent humor.',
        styleGuidelines: `Vocabulary: Understated, slightly wry. Observations that carry a quiet smirk.
Rhythm: Mix short punchy lines with longer setups. Humor lands through timing, not emphasis.
Imagery: Everyday details noticed with a slightly tilted perspective.
Emotional weight: Light touch even on heavy moments. Never dismissive, just gently irreverent.
Think: a witty friend who notices the absurd in the ordinary.`,
    },
    {
        id: 'mystery_noir',
        label: 'Mystery / Noir',
        shortDescription: 'Atmospheric, shadowed.',
        styleGuidelines: `Vocabulary: Shadowed, atmospheric, weighted. Words carry smoke and low light.
Rhythm: Varied. Short fragments for tension. Longer sentences for atmosphere.
Imagery: Rich. Shadows, light contrasts, textures, silence. Mood lighting everywhere.
Emotional weight: Everything carries more gravity than expected. Subtle tension underneath.
Think: narrating a quiet noir scene where nothing dramatic happens but everything feels significant.`,
    },
    {
        id: 'cinematic',
        label: 'Cinematic',
        shortDescription: 'Narrative, visual.',
        styleGuidelines: `Vocabulary: Visual, spatial, sensory. Write in frames and shots.
Rhythm: Flowing. Sentences track movement or stillness like a camera pan.
Imagery: High density. Describe scenes as if blocking a film sequence.
Emotional weight: Present but understated. Let the visuals carry the emotion.
Think: a director describing dailies, where every mundane moment is a potential scene.`,
    },
    {
        id: 'dreamlike',
        label: 'Dreamlike',
        shortDescription: 'Soft, abstract, fluid.',
        styleGuidelines: `Vocabulary: Soft, fluid, slightly abstract. Words blur at the edges.
Rhythm: Gentle, unhurried. Sentences drift rather than march. No sharp stops.
Imagery: Impressionistic. Colors bleed, edges soften, time stretches.
Emotional weight: Emotions felt rather than named. Everything floats above the concrete.
Think: recounting a day the way someone describes a half-remembered dream.`,
    },
    {
        id: 'romantic',
        label: 'Romantic',
        shortDescription: 'Warm, intimate, emotionally close.',
        styleGuidelines: `Vocabulary: Warm, textured, intimate. Words chosen with care and tenderness.
Rhythm: Flowing but grounded. Sentences lean into moments rather than rush past them.
Imagery: Sensory and close. Warmth, texture, proximity. The world noticed with tenderness.
Emotional weight: Everything felt fully. Heavy moods held gently. Light moods glow.
Think: someone who finds beauty in the ordinary and is not embarrassed about it.`,
    },
    {
        id: 'gentle_roast',
        label: 'Gentle Roast',
        shortDescription: 'Light teasing, affectionate.',
        styleGuidelines: `Vocabulary: Casual, affectionate, slightly teasing. The humor of knowing someone well.
Rhythm: Conversational. Quick observations followed by dry asides. Keep it moving.
Imagery: Everyday. Find the comedy in the mundane without reaching.
Emotional weight: Always warm underneath. Teasing is closeness, never distance. Never punch down.
Think: a best friend narrating the day with a knowing grin and zero judgment.`,
    },
    {
        id: 'inspiring',
        label: 'Inspiring',
        shortDescription: 'Uplifting but grounded.',
        styleGuidelines: `Vocabulary: Grounded, forward-leaning, resolute. No slogans or motivational posters.
Rhythm: Building momentum. Sentences gather strength without becoming grandiose.
Imagery: Movement, light, steady progress. Small actions framed as meaningful.
Emotional weight: Quiet conviction. Belief without preaching. Momentum without hype.
Think: the inner voice that notices effort and acknowledges it without making a speech.`,
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


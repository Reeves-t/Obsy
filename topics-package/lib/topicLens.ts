// Topic Lens system.
//
// A lens tells Obsy how to understand and interact with a topic. Topics are NOT
// always goals or problems to solve — they can be interests, hobbies, projects,
// learning areas, relationships, memories or growth areas. The lens shapes both
// the AI's behaviour and the section labels shown on the Discover / Evolve pages.
//
// Pure, dependency-free so it can be imported by the store, the AI client and the
// UI without cycles, and unit-tested in isolation.

export type TopicLensId =
    | 'personal_growth'
    | 'hobby'
    | 'project'
    | 'learning'
    | 'relationship'
    | 'memory'
    | 'health'
    | 'creative'
    | 'career';

/**
 * How intense Obsy should be on a topic — orthogonal to the lens. The lens says
 * *what kind* of topic this is; depth says *how hard Obsy should push*.
 *   light    — curious, observational, playful; documents and notices, barely asks.
 *   balanced — mostly observations + the occasional genuinely useful question.
 *   deep     — reflection, patterns and harder questions (never stacked, never judgmental).
 * Every lens has a sensible `defaultDepth`; the user can override it per topic.
 */
export type TopicDepth = 'light' | 'balanced' | 'deep';

export const TOPIC_DEPTHS: TopicDepth[] = ['light', 'balanced', 'deep'];

export const DEPTH_LABELS: Record<TopicDepth, string> = {
    light: 'Light',
    balanced: 'Balanced',
    deep: 'Deep',
};

export interface LensSectionLabels {
    // Discover (page 2) — JSON keys stay stable; only the displayed label + the
    // AI framing change per lens.
    corePattern: string;
    perspectives: string;
    connections: string;
    // Evolve (page 3)
    journey: string;
    realizations: string;
    openThreads: string;
    suggestions: string;
}

export interface TopicLensDef {
    id: TopicLensId;
    /** Where this lens sits on the intensity axis by default (user-overridable). */
    defaultDepth: TopicDepth;
    label: string;
    description: string;
    /** Injected into AI prompts to shape how Obsy reasons about the topic. */
    behavior: string;
    labels: LensSectionLabels;
    /** Short AI framing for what belongs in each adaptive field, under this lens. */
    hints: {
        corePattern: string;
        perspectives: string;
        connections: string;
        realizations: string;
        openThreads: string;
        suggestions: string;
    };
}

export const TOPIC_LENSES: TopicLensDef[] = [
    {
        id: 'personal_growth',
        defaultDepth: 'deep',
        label: 'Personal Growth',
        description: 'Self-improvement, habits, reflection',
        behavior:
            'Be supportive, pattern-focused and gentle. Notice growth and recurring patterns without diagnosing. Never use clinical or therapy language.',
        labels: {
            corePattern: 'Patterns',
            perspectives: 'Reflection Lens',
            connections: 'Questions',
            journey: 'Journey',
            realizations: 'Realizations',
            openThreads: 'Open Threads',
            suggestions: 'Growth Actions',
        },
        hints: {
            corePattern: 'the strongest pattern in how they grow or feel here',
            perspectives: 'reflective lenses — patterns worth observing about themselves',
            connections: 'open questions worth sitting with',
            realizations: 'meaningful realizations detected from entries',
            openThreads: 'unfinished reflections or recurring tensions',
            suggestions: 'gentle growth actions (a daily habit and/or weekly goal)',
        },
    },
    {
        id: 'hobby',
        defaultDepth: 'light',
        label: 'Hobby / Interest',
        description: 'Enjoyment, exploration, documentation',
        behavior:
            'Be curious, observational, knowledge-focused and low-pressure. Document and explore the subject itself. Do NOT over-psychologize or turn enjoyment into self-improvement. Treat details factually (e.g. "entries show interest in cichlid hierarchy" — not "the aquarium represents balance").',
        labels: {
            corePattern: 'Observations',
            perspectives: 'Interesting Details',
            connections: 'Connections',
            journey: 'Topic Journey',
            realizations: 'Notable Moments',
            openThreads: 'Open Curiosities',
            suggestions: 'Future Ideas',
        },
        hints: {
            corePattern: 'the strongest observation about the subject itself',
            perspectives: 'interesting details or aspects worth exploring further',
            connections: 'relationships between entries, ideas or parts of the subject',
            realizations: 'notable moments or discoveries from the entries',
            openThreads: 'open curiosities — things to explore or try next',
            suggestions: 'future ideas to try (framed as optional habits/goals)',
        },
    },
    {
        id: 'project',
        defaultDepth: 'balanced',
        label: 'Project / Work',
        description: 'Building something',
        behavior:
            'Be analytical, progress-aware and decision-focused. Track progress, surface decisions to make and missing pieces.',
        labels: {
            corePattern: 'Progress Patterns',
            perspectives: 'Missing Pieces',
            connections: 'Decisions',
            journey: 'Journey',
            realizations: 'Milestones',
            openThreads: 'Open Threads',
            suggestions: 'Goals / Habits',
        },
        hints: {
            corePattern: 'the strongest pattern in how progress is happening',
            perspectives: 'missing pieces or unclear steps',
            connections: 'decisions worth making or trade-offs in play',
            realizations: 'milestones or turning points reached',
            openThreads: 'unresolved threads or things mentioned but not pursued',
            suggestions: 'a daily habit and/or weekly goal to move the work forward',
        },
    },
    {
        id: 'learning',
        defaultDepth: 'balanced',
        label: 'Learning',
        description: 'Understanding and knowledge retention',
        behavior:
            'Connect concepts, summarize ideas and find relationships between what has been learned. Help knowledge stick.',
        labels: {
            corePattern: 'Key Ideas',
            perspectives: 'Concepts to Connect',
            connections: 'Connections',
            journey: 'Learning Journey',
            realizations: 'Key Takeaways',
            openThreads: 'Open Questions',
            suggestions: 'Learning Goals',
        },
        hints: {
            corePattern: 'the most important idea emerging across what was learned',
            perspectives: 'concepts that could connect or deepen understanding',
            connections: 'relationships between ideas, sources or concepts',
            realizations: 'key takeaways that landed',
            openThreads: 'open questions still to resolve',
            suggestions: 'a daily habit and/or weekly goal to learn and retain more',
        },
    },
    {
        id: 'relationship',
        defaultDepth: 'deep',
        label: 'Relationship',
        description: 'Understanding a relationship',
        behavior:
            'Be nuanced, non-judgmental and open-ended. Hold space for complexity, never take sides or prescribe what they should do.',
        labels: {
            corePattern: 'Patterns',
            perspectives: 'Perspectives',
            connections: 'Dynamics',
            journey: 'Journey',
            realizations: 'Moments',
            openThreads: 'Open Threads',
            suggestions: 'Intentions',
        },
        hints: {
            corePattern: 'a nuanced pattern in the relationship, without judgment',
            perspectives: 'open-ended perspectives worth considering',
            connections: 'dynamics between people, moods or moments',
            realizations: 'meaningful moments from the entries',
            openThreads: 'unspoken or unresolved threads',
            suggestions: 'gentle intentions (optional habits/goals)',
        },
    },
    {
        id: 'memory',
        defaultDepth: 'light',
        label: 'Memory / Life',
        description: 'Preserving experiences',
        behavior:
            'Be storytelling and timeline-focused. Preserve and connect meaningful moments. Do not analyze experiences for self-improvement.',
        labels: {
            corePattern: 'Moments',
            perspectives: 'Details Worth Keeping',
            connections: 'Connections',
            journey: 'Timeline',
            realizations: 'Notable Moments',
            openThreads: 'Untold Threads',
            suggestions: 'Ways to Preserve',
        },
        hints: {
            corePattern: 'the most meaningful moment or thread to remember',
            perspectives: 'details worth keeping or expanding into stories',
            connections: 'connections between moments, people and times',
            realizations: 'notable moments worth marking',
            openThreads: 'untold threads — memories hinted at but not captured',
            suggestions: 'ways to preserve or revisit (optional habits/goals)',
        },
    },
    {
        id: 'health',
        defaultDepth: 'balanced',
        label: 'Health / Body',
        description: 'Fitness, training, sleep, food, recovery',
        behavior:
            'Be observational, progress-aware and body-literate. Track how the body, energy and routines are actually going. NEVER psychologize, moralize food or weight, shame, or imply discipline failures. Treat it factually (e.g. "sleep has been shorter on training days" — not "you are neglecting yourself").',
        labels: {
            corePattern: 'Patterns',
            perspectives: "What's Working",
            connections: 'Signals',
            journey: 'Progress',
            realizations: 'Wins',
            openThreads: 'To Try',
            suggestions: 'Routines',
        },
        hints: {
            corePattern: 'the clearest pattern in how the body, energy or routine is going',
            perspectives: "what's working or worth keeping — factual, never preachy",
            connections: 'signals or links between habits, sleep, food, energy and mood',
            realizations: 'wins or turning points worth marking',
            openThreads: 'things to try or adjust next — never framed as failures',
            suggestions: 'a sustainable daily habit and/or weekly goal (never punishing)',
        },
    },
    {
        id: 'creative',
        defaultDepth: 'balanced',
        label: 'Creative / Making',
        description: 'Writing, music, art and things you make',
        behavior:
            'Be craft-focused and encouraging about output. Treat entries as a growing body of work — notice voice, style, themes and what is being made. Help them keep making. Do NOT over-psychologize the work or turn creating into self-therapy.',
        labels: {
            corePattern: 'Through-line',
            perspectives: 'Craft Notes',
            connections: 'Influences',
            journey: 'Body of Work',
            realizations: 'Breakthroughs',
            openThreads: 'Ideas to Make',
            suggestions: 'Creative Goals',
        },
        hints: {
            corePattern: 'the through-line or signature emerging across the work',
            perspectives: 'craft notes — what is strong or worth developing in the work',
            connections: 'influences, references or links between pieces and ideas',
            realizations: 'breakthroughs or moments the work levelled up',
            openThreads: 'ideas to make next — sketches, drafts or experiments to try',
            suggestions: 'a creative habit and/or weekly goal to keep making',
        },
    },
    {
        id: 'career',
        defaultDepth: 'balanced',
        label: 'Work / Career',
        description: 'Job, career moves, professional growth',
        behavior:
            'Be pragmatic, decision- and positioning-focused. Surface leverage, trade-offs and moves worth making. Be supportive and concrete without corporate cliché, hustle-bait or platitudes.',
        labels: {
            corePattern: 'Patterns',
            perspectives: 'Leverage',
            connections: 'Decisions',
            journey: 'Trajectory',
            realizations: 'Wins',
            openThreads: 'Open Moves',
            suggestions: 'Next Steps',
        },
        hints: {
            corePattern: 'the clearest pattern in how work or career is actually going',
            perspectives: 'points of leverage — where effort would pay off most',
            connections: 'decisions or trade-offs in play',
            realizations: 'wins, turning points or lessons reached',
            openThreads: 'open moves — options raised but not yet pursued',
            suggestions: 'a daily habit and/or weekly goal to move the work or career forward',
        },
    },
];

const LENS_BY_ID: Record<TopicLensId, TopicLensDef> = TOPIC_LENSES.reduce(
    (acc, l) => {
        acc[l.id] = l;
        return acc;
    },
    {} as Record<TopicLensId, TopicLensDef>,
);

export const DEFAULT_LENS_ID: TopicLensId = 'personal_growth';

export function getLensDef(id: TopicLensId | null | undefined): TopicLensDef {
    return (id && LENS_BY_ID[id]) || LENS_BY_ID[DEFAULT_LENS_ID];
}

// ── Inference (heuristic, instant, offline) ───────────────────────────────
// We infer a sensible default lens from the title + description at creation
// time rather than blocking the flow on an AI round-trip. Users can always
// change it, and the choice only shapes future generations.

const LENS_KEYWORDS: Record<TopicLensId, string[]> = {
    hobby: [
        'fish', 'aquarium', 'tank', 'cichlid', 'reef', 'garden', 'plant', 'cook', 'cooking',
        'recipe', 'baking', 'game', 'gaming', 'paint', 'draw', 'art', 'music', 'guitar', 'piano',
        'photo', 'photograph', 'craft', 'knit', 'hike', 'hiking', 'collect', 'coffee', 'tea',
        'car', 'bike', 'cycling', 'fishing', 'birding', 'hobby', 'interest', 'chess', 'lego',
    ],
    project: [
        'build', 'building', 'app', 'startup', 'business', 'launch', 'project', 'product',
        'company', 'website', 'side project', 'home project', 'renovat', 'mvp', 'ship', 'client',
        'freelance', 'portfolio', 'develop my', 'my app', 'my business',
    ],
    learning: [
        'book', 'books', 'read', 'reading', 'study', 'studying', 'learn', 'learning', 'course',
        'programming', 'code', 'coding', 'finance', 'investing', 'language', 'history', 'science',
        'math', 'research', 'concept', 'knowledge', 'philosophy', 'notes on',
    ],
    relationship: [
        'marriage', 'relationship', 'partner', 'wife', 'husband', 'girlfriend', 'boyfriend',
        'friend', 'friendship', 'family', 'dating', 'mom', 'dad', 'mother', 'father', 'parent',
        'son', 'daughter', 'sibling', 'brother', 'sister',
    ],
    memory: [
        'memory', 'memories', 'trip', 'travel', 'childhood', 'nostalgia', 'remember', 'grief',
        'loss', 'legacy', 'journal of', 'moments', 'life story', 'milestones of',
    ],
    health: [
        'fitness', 'workout', 'gym', 'running', 'jogging', 'sleep', 'nutrition', 'diet',
        'weight', 'training', 'steps', 'yoga', 'pilates', 'meditation', 'health', 'healing',
        'recovery', 'cardio', 'strength', 'macros', 'wellness',
    ],
    creative: [
        'writing', 'write', 'novel', 'poem', 'poetry', 'songwriting', 'compose', 'composing',
        'album', 'design', 'designing', 'screenplay', 'blog', 'blogging', 'making', 'sculpt',
        'illustrat', 'animation',
    ],
    career: [
        'career', 'job', 'promotion', 'interview', 'resume', 'workplace', 'manager',
        'leadership', 'my role', 'salary', 'professional', 'coworker', 'colleague', 'boss',
    ],
    personal_growth: [
        'confidence', 'confident', 'discipline', 'growth', 'habit', 'mindful', 'anxiety',
        'self', 'improve', 'better', 'motivation', 'focus', 'productivity', 'manifest',
        'spiritual', 'faith', 'gratitude',
    ],
};

// When scores tie or nothing matches, prefer in this order. personal_growth stays
// last so it only wins as the catch-all default, not on incidental keyword hits.
const LENS_PRIORITY: TopicLensId[] = [
    'project',
    'career',
    'learning',
    'creative',
    'health',
    'relationship',
    'hobby',
    'memory',
    'personal_growth',
];

export function inferTopicLens(title: string, description = ''): TopicLensId {
    const haystack = `${title} ${description}`.toLowerCase();

    let best: TopicLensId = DEFAULT_LENS_ID;
    let bestScore = 0;

    for (const lensId of LENS_PRIORITY) {
        const keywords = LENS_KEYWORDS[lensId];
        let score = 0;
        for (const kw of keywords) {
            if (haystack.includes(kw)) score++;
        }
        if (score > bestScore) {
            bestScore = score;
            best = lensId;
        }
    }

    return bestScore > 0 ? best : DEFAULT_LENS_ID;
}

// ── Depth ──────────────────────────────────────────────────────────────────
// Depth is orthogonal to lens. Each lens carries a sensible default; the store
// stamps it at creation and the user can override it from the Observe panel.

export function defaultDepthForLens(id: TopicLensId | null | undefined): TopicDepth {
    return getLensDef(id).defaultDepth;
}

// ── Respond prompts ─────────────────────────────────────────────────────────
// The CTA + input placeholder shown when the user responds to an AI insight.
// Light topics get varied, documentary prompts (chosen by section so different
// cards invite different responses); heavier topics get one calm prompt.

export interface RespondPrompt {
    /** Short affordance label shown on the card / bullet row. */
    cta: string;
    /** Placeholder shown in the response input. */
    placeholder: string;
}

const LIGHT_PROMPTS: RespondPrompt[] = [
    { cta: 'Tell the story', placeholder: 'Tell the story behind this…' },
    { cta: 'What happened next?', placeholder: 'What happened next?' },
    { cta: 'Add a detail', placeholder: "Save a detail you don't want to forget…" },
    { cta: 'Add your take', placeholder: 'Add your take…' },
];

function sectionIndex(section: string, mod: number): number {
    let h = 0;
    for (let i = 0; i < section.length; i++) h = (h * 31 + section.charCodeAt(i)) | 0;
    return Math.abs(h) % mod;
}

export function respondPrompt(depth: TopicDepth, section: string): RespondPrompt {
    if (depth === 'light') return LIGHT_PROMPTS[sectionIndex(section, LIGHT_PROMPTS.length)];
    if (depth === 'balanced') return { cta: 'Add your take', placeholder: 'Add your take…' };
    return { cta: 'Respond', placeholder: 'Add your thoughts…' };
}

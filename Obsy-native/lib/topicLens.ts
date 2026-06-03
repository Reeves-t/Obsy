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
    | 'memory';

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
    personal_growth: [
        'confidence', 'confident', 'discipline', 'growth', 'habit', 'mindful', 'anxiety',
        'self', 'improve', 'better', 'motivation', 'focus', 'productivity', 'manifest',
        'spiritual', 'faith', 'health', 'fitness', 'meditation', 'gratitude', 'healing',
    ],
};

// When scores tie or nothing matches, prefer in this order.
const LENS_PRIORITY: TopicLensId[] = [
    'project',
    'learning',
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

import {
    TOPIC_LENSES,
    TOPIC_DEPTHS,
    DEFAULT_LENS_ID,
    getLensDef,
    inferTopicLens,
    defaultDepthForLens,
    respondPrompt,
    type TopicLensId,
} from '@/lib/topicLens';

describe('inferTopicLens', () => {
    const cases: { title: string; description?: string; expected: TopicLensId }[] = [
        { title: 'Fish Keeping', description: 'My cichlid tank journey', expected: 'hobby' },
        { title: 'Build my app', expected: 'project' },
        { title: 'Become confident', expected: 'personal_growth' },
        { title: 'Books I read', expected: 'learning' },
        { title: 'My marriage', expected: 'relationship' },
        { title: 'Childhood memories', expected: 'memory' },
        { title: 'Cooking', expected: 'hobby' },
        { title: 'Programming', expected: 'learning' },
        // New lenses + re-routing (health/fitness must NOT fall to personal_growth).
        { title: 'My workout log', expected: 'health' },
        { title: 'Marathon training', expected: 'health' },
        { title: 'Meditation practice', expected: 'health' },
        { title: 'Writing my novel', expected: 'creative' },
        { title: 'Job search and promotion', expected: 'career' },
    ];

    cases.forEach(({ title, description, expected }) => {
        it(`infers "${title}" → ${expected}`, () => {
            expect(inferTopicLens(title, description)).toBe(expected);
        });
    });

    it('falls back to the default lens when nothing matches', () => {
        expect(inferTopicLens('', '')).toBe(DEFAULT_LENS_ID);
        expect(inferTopicLens('Zxqwerty', 'nondescript blob')).toBe(DEFAULT_LENS_ID);
    });
});

describe('lens config', () => {
    it('getLensDef falls back to the default for unknown/undefined', () => {
        expect(getLensDef(undefined).id).toBe(DEFAULT_LENS_ID);
        expect(getLensDef('not_a_lens' as any).id).toBe(DEFAULT_LENS_ID);
    });

    it('maps hobby labels per the spec', () => {
        const hobby = getLensDef('hobby');
        expect(hobby.labels.corePattern).toBe('Observations');
        expect(hobby.labels.perspectives).toBe('Interesting Details');
        expect(hobby.labels.realizations).toBe('Notable Moments');
        expect(hobby.labels.suggestions).toBe('Future Ideas');
    });

    it('every lens defines all labels and hints', () => {
        const labelKeys = ['corePattern', 'perspectives', 'connections', 'journey', 'realizations', 'openThreads', 'suggestions'];
        const hintKeys = ['corePattern', 'perspectives', 'connections', 'realizations', 'openThreads', 'suggestions'];
        for (const lens of TOPIC_LENSES) {
            expect(lens.label.length).toBeGreaterThan(0);
            expect(lens.behavior.length).toBeGreaterThan(0);
            for (const k of labelKeys) {
                expect((lens.labels as any)[k]).toBeTruthy();
            }
            for (const k of hintKeys) {
                expect((lens.hints as any)[k]).toBeTruthy();
            }
        }
    });
});

describe('topic depth', () => {
    it('every lens declares a valid default depth', () => {
        for (const lens of TOPIC_LENSES) {
            expect(TOPIC_DEPTHS).toContain(lens.defaultDepth);
        }
    });

    it('maps lens → default depth per the spec', () => {
        expect(defaultDepthForLens('hobby')).toBe('light');
        expect(defaultDepthForLens('memory')).toBe('light');
        expect(defaultDepthForLens('personal_growth')).toBe('deep');
        expect(defaultDepthForLens('relationship')).toBe('deep');
        expect(defaultDepthForLens('health')).toBe('balanced');
        expect(defaultDepthForLens('creative')).toBe('balanced');
        expect(defaultDepthForLens('career')).toBe('balanced');
    });

    it('a fish topic resolves to a light hobby', () => {
        const id = inferTopicLens('Fish Keeping', 'My cichlid tank journey');
        expect(id).toBe('hobby');
        expect(defaultDepthForLens(id)).toBe('light');
    });

    it('falls back via the default lens for unknown/undefined ids', () => {
        expect(defaultDepthForLens(undefined)).toBe(getLensDef(DEFAULT_LENS_ID).defaultDepth);
        expect(defaultDepthForLens('not_a_lens' as any)).toBe(getLensDef(DEFAULT_LENS_ID).defaultDepth);
    });
});

describe('respondPrompt', () => {
    it('is deterministic per (depth, section)', () => {
        expect(respondPrompt('light', 'Observations')).toEqual(respondPrompt('light', 'Observations'));
    });

    it('light prompts are soft and non-empty; deep uses the calm default', () => {
        const light = respondPrompt('light', 'Open Curiosities');
        expect(light.cta.length).toBeGreaterThan(0);
        expect(light.placeholder.length).toBeGreaterThan(0);
        expect(respondPrompt('deep', 'Questions')).toEqual({ cta: 'Respond', placeholder: 'Add your thoughts…' });
        // light should not collapse to the deep default
        expect(light).not.toEqual({ cta: 'Respond', placeholder: 'Add your thoughts…' });
    });
});

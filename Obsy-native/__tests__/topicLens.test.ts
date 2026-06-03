import {
    TOPIC_LENSES,
    DEFAULT_LENS_ID,
    getLensDef,
    inferTopicLens,
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

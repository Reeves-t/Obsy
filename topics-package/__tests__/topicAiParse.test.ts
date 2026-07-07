import {
    parseJsonFromText,
    coerceDiscover,
    coerceEvolve,
    coerceSuggestions,
} from '@/lib/topicAiParse';

describe('parseJsonFromText', () => {
    it('parses a clean JSON object', () => {
        expect(parseJsonFromText('{"a":1,"b":"x"}')).toEqual({ a: 1, b: 'x' });
    });

    it('strips ```json fences', () => {
        const text = '```json\n{"a":1}\n```';
        expect(parseJsonFromText(text)).toEqual({ a: 1 });
    });

    it('strips bare ``` fences', () => {
        expect(parseJsonFromText('```\n{"a":2}\n```')).toEqual({ a: 2 });
    });

    it('extracts JSON with leading and trailing prose', () => {
        const text = 'Here is the result:\n{"corePattern":"hi"}\nHope that helps!';
        expect(parseJsonFromText(text)).toEqual({ corePattern: 'hi' });
    });

    it('handles braces inside string values', () => {
        const text = '{"note":"use {curly} braces } here"}';
        expect(parseJsonFromText(text)).toEqual({ note: 'use {curly} braces } here' });
    });

    it('handles nested objects', () => {
        const text = 'noise {"journey":{"started":"a","current":"b"}} more noise';
        expect(parseJsonFromText(text)).toEqual({ journey: { started: 'a', current: 'b' } });
    });

    it('returns null for malformed JSON', () => {
        expect(parseJsonFromText('{not valid json at all')).toBeNull();
    });

    it('returns null for empty / nullish input', () => {
        expect(parseJsonFromText('')).toBeNull();
        expect(parseJsonFromText(undefined)).toBeNull();
        expect(parseJsonFromText(null)).toBeNull();
        expect(parseJsonFromText('just prose, no object')).toBeNull();
    });
});

describe('coerceDiscover', () => {
    it('coerces a full payload and keeps a valid archetype', () => {
        const out = coerceDiscover({
            archetype: 'creative',
            corePattern: '  strong signal  ',
            themes: ['Growth', '', 2, 'Discipline'],
            perspectives: ['What deserves exploration?'],
            connections: ['Links to Fitness'],
        });
        expect(out).toEqual({
            archetype: 'creative',
            corePattern: 'strong signal',
            themes: ['Growth', 'Discipline'],
            perspectives: ['What deserves exploration?'],
            connections: ['Links to Fitness'],
        });
    });

    it('defaults an unknown archetype to "other"', () => {
        const out = coerceDiscover({ archetype: 'nonsense', corePattern: 'x' });
        expect(out?.archetype).toBe('other');
    });

    it('caps themes at 8', () => {
        const themes = Array.from({ length: 12 }, (_, i) => `t${i}`);
        const out = coerceDiscover({ corePattern: 'x', themes });
        expect(out?.themes).toHaveLength(8);
    });

    it('returns null when nothing is populated', () => {
        expect(coerceDiscover({ archetype: 'goal', themes: [], perspectives: [] })).toBeNull();
        expect(coerceDiscover(null)).toBeNull();
        expect(coerceDiscover('nope')).toBeNull();
    });
});

describe('coerceSuggestions', () => {
    it('maps from a { suggestions: [...] } wrapper with defaults', () => {
        const out = coerceSuggestions({
            suggestions: [
                { type: 'goal', frequency: 'weekly', title: 'Finish a chapter', note: 'why' },
                { title: 'Read 10 pages' }, // missing type/frequency -> defaults habit/daily
            ],
        });
        expect(out).toEqual([
            { type: 'goal', frequency: 'weekly', title: 'Finish a chapter', note: 'why' },
            { type: 'habit', frequency: 'daily', title: 'Read 10 pages', note: undefined },
        ]);
    });

    it('accepts a bare array too', () => {
        const out = coerceSuggestions([{ title: 'Walk' }]);
        expect(out).toEqual([{ type: 'habit', frequency: 'daily', title: 'Walk', note: undefined }]);
    });

    it('filters entries without a title and caps at 2', () => {
        const out = coerceSuggestions({
            suggestions: [{ title: 'a' }, { note: 'no title' }, { title: 'b' }, { title: 'c' }],
        });
        expect(out).toHaveLength(2);
        expect(out?.map((s) => s.title)).toEqual(['a', 'b']);
    });

    it('returns null when there are no valid suggestions', () => {
        expect(coerceSuggestions({ suggestions: [] })).toBeNull();
        expect(coerceSuggestions({})).toBeNull();
        expect(coerceSuggestions(null)).toBeNull();
    });
});

describe('coerceEvolve', () => {
    it('coerces journey, realizations, open threads and suggestions', () => {
        const out = coerceEvolve({
            journey: { started: 'began', current: 'now', emerging: 'next' },
            realizations: [
                { date: 'May 23', text: 'a realization' },
                { date: 'May 24' }, // no text -> dropped
            ],
            openThreads: ['unexplored idea'],
            suggestions: [{ type: 'habit', frequency: 'daily', title: 'do the thing' }],
        });
        expect(out?.journey).toEqual({ started: 'began', current: 'now', emerging: 'next' });
        expect(out?.realizations).toEqual([{ date: 'May 23', text: 'a realization' }]);
        expect(out?.openThreads).toEqual(['unexplored idea']);
        expect(out?.suggestions).toHaveLength(1);
    });

    it('still valid when only suggestions are present', () => {
        const out = coerceEvolve({ suggestions: [{ title: 'x' }] });
        expect(out).not.toBeNull();
        expect(out?.suggestions).toHaveLength(1);
    });

    it('returns null when entirely empty', () => {
        expect(coerceEvolve({ journey: {}, realizations: [], openThreads: [] })).toBeNull();
        expect(coerceEvolve(null)).toBeNull();
    });
});

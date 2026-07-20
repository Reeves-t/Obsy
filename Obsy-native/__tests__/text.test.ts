import { splitFirstSentence } from '@/lib/text';

describe('splitFirstSentence', () => {
    it('splits a normal sentence from the rest', () => {
        const { title, rest } = splitFirstSentence('Felt calm after the walk. The rest of the day flowed easily.');
        expect(title).toBe('Felt calm after the walk.');
        expect(rest).toBe('The rest of the day flowed easily.');
    });

    it('returns empty parts for null/empty input', () => {
        expect(splitFirstSentence(null)).toEqual({ title: '', rest: '' });
        expect(splitFirstSentence('   ')).toEqual({ title: '', rest: '' });
    });

    it('keeps a short note without punctuation whole', () => {
        const { title, rest } = splitFirstSentence('grateful for small things');
        expect(title).toBe('grateful for small things');
        expect(rest).toBe('');
    });

    it('falls back to the first line break when no terminator', () => {
        const { title, rest } = splitFirstSentence('Morning pages\nwrote three whole sheets today');
        expect(title).toBe('Morning pages');
        expect(rest).toBe('wrote three whole sheets today');
    });

    it('handles ellipsis terminator', () => {
        const { title, rest } = splitFirstSentence('Not sure how I feel… maybe tired.');
        expect(title).toBe('Not sure how I feel…');
        expect(rest).toBe('maybe tired.');
    });

    it('includes trailing closing quote in the title', () => {
        const { title } = splitFirstSentence('She said "enough." I agreed with her.');
        expect(title).toBe('She said "enough."');
    });

    it('handles CJK full stop', () => {
        const { title, rest } = splitFirstSentence('今日は散歩した。とても気持ちよかった。');
        expect(title).toBe('今日は散歩した。');
        expect(rest).toBe('とても気持ちよかった。');
    });

    it('clamps a long first sentence at a word boundary with ellipsis', () => {
        const long =
            'This first sentence keeps going and going without any pause well past the ninety character clamp threshold. Second sentence.';
        const { title, rest } = splitFirstSentence(long);
        expect(title.length).toBeLessThanOrEqual(82);
        expect(title.endsWith('…')).toBe(true);
        expect(rest.length).toBeGreaterThan(0);
    });

    it('never splits a surrogate pair when hard-clamping', () => {
        const giant = '😀'.repeat(100); // 200 UTF-16 units, no spaces or terminators
        const { title } = splitFirstSentence(giant);
        const body = title.slice(0, -1); // drop the appended …
        expect(body.length % 2).toBe(0); // whole emoji only
        expect(Array.from(body).every((ch) => ch === '😀')).toBe(true);
    });
});

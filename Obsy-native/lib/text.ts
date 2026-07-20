/**
 * Text helpers shared by entry tiles and cards.
 */

const MAX_TITLE = 90;
const CLAMP_AT = 80;

export interface SplitSentence {
    /** First sentence (or clamped opening) — safe to style as a title line. */
    title: string;
    /** Everything after the title, trimmed. Empty when the note is one sentence. */
    rest: string;
}

/**
 * Split a note into its first sentence ("title") and the remainder.
 * Regex-based — Hermes doesn't ship Intl.Segmenter.
 */
export function splitFirstSentence(raw: string | null | undefined): SplitSentence {
    const text = (raw ?? '').trim();
    if (!text) return { title: '', rest: '' };

    // First terminator plus trailing closing quotes/brackets. Latin terminators
    // must be followed by whitespace/end; CJK terminators split anywhere.
    const m = text.match(/[.!?…]+["'”’»)\]]*(?=\s|$)|[。！？]+["'”’»」）]*/u);
    let end = -1;
    if (m && m.index !== undefined && m.index + m[0].length >= 2) {
        end = m.index + m[0].length;
    }

    // No sentence terminator — fall back to the first line break.
    if (end === -1) {
        const nl = text.indexOf('\n');
        if (nl >= 2) end = nl;
    }

    if (end !== -1 && end <= MAX_TITLE) {
        return { title: text.slice(0, end).trim(), rest: text.slice(end).trim() };
    }

    // Whole text fits — no need to clamp.
    if (end === -1 && text.length <= MAX_TITLE) {
        return { title: text, rest: '' };
    }

    // Clamp long openings at a word boundary before CLAMP_AT.
    let cut = text.lastIndexOf(' ', CLAMP_AT);
    if (cut < 2) {
        // One giant token (e.g. CJK): hard-clamp, backing off a surrogate half
        // so emoji/astral chars never split.
        cut = CLAMP_AT;
        const code = text.charCodeAt(cut - 1);
        if (code >= 0xd800 && code <= 0xdbff) cut -= 1;
    }
    return { title: text.slice(0, cut).trim() + '…', rest: text.slice(cut).trim() };
}

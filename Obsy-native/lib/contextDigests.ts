/**
 * Context Digests
 *
 * Builds optional structured summary blocks that get appended to AI context.
 * Lets every chat/insight surface highlight shared links, journal entries, and
 * the entry-type mix without changing existing prompts. Existing prompts treat
 * this as just more labelled data.
 *
 * Pure helpers — no I/O, no side effects.
 */

export type DigestEntryType = 'capture' | 'journal' | 'voice' | 'shared_link';

export interface DigestEntry {
    /** ISO timestamp or pre-formatted date label */
    date: string;
    mood: string;
    note?: string | null;
    sourceType?: DigestEntryType | string | null;
    sharedLinkPlatform?: string | null;
    sharedLinkTitle?: string | null;
}

function fmtDate(dateInput: string): string {
    const d = new Date(dateInput);
    if (Number.isNaN(d.getTime())) return dateInput;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function normalizeType(t: string | null | undefined): DigestEntryType {
    if (t === 'journal' || t === 'voice' || t === 'shared_link') return t;
    return 'capture';
}

function truncateNote(note: string, max = 160): string {
    if (note.length <= max) return note;
    return note.slice(0, max).trimEnd() + '…';
}

/**
 * Builds a digest block to append to an AI context payload.
 * Returns an empty string if there's nothing notable to surface.
 */
export function buildContextDigest(entries: DigestEntry[]): string {
    if (!entries.length) return '';

    const counts = { capture: 0, journal: 0, voice: 0, shared_link: 0 };
    const sharedLinks: DigestEntry[] = [];
    const journals: DigestEntry[] = [];

    for (const e of entries) {
        const type = normalizeType(e.sourceType ?? null);
        counts[type]++;
        if (type === 'shared_link') sharedLinks.push(e);
        if (type === 'journal' && e.note?.trim()) journals.push(e);
    }

    const sections: string[] = [];

    if (sharedLinks.length > 0) {
        const lines = sharedLinks
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .map(e => {
                const platform = e.sharedLinkPlatform || 'Web';
                const titlePart = e.sharedLinkTitle ? ` "${e.sharedLinkTitle}"` : '';
                const notePart = e.note?.trim() ? ` — note: "${truncateNote(e.note)}"` : '';
                return `- ${fmtDate(e.date)} [${platform}]${titlePart} — felt: ${e.mood}${notePart}`;
            });
        sections.push(`SHARED LINKS THIS PERIOD (external content the user chose to save):\n${lines.join('\n')}`);
    }

    if (journals.length > 0) {
        const lines = journals
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .map(e => `- ${fmtDate(e.date)} (${e.mood}): "${truncateNote(e.note!, 220)}"`);
        sections.push(`JOURNAL ENTRIES (long-form, deliberate writing — treat as more weighted than quick captures):\n${lines.join('\n')}`);
    }

    const mixParts: string[] = [];
    if (counts.journal) mixParts.push(`${counts.journal} journal${counts.journal === 1 ? '' : 's'}`);
    if (counts.capture) mixParts.push(`${counts.capture} photo capture${counts.capture === 1 ? '' : 's'}`);
    if (counts.voice) mixParts.push(`${counts.voice} voice note${counts.voice === 1 ? '' : 's'}`);
    if (counts.shared_link) mixParts.push(`${counts.shared_link} shared link${counts.shared_link === 1 ? '' : 's'}`);

    // Only surface entry mix when it adds information (more than one type, or shared/journal/voice present).
    const distinctTypes = Object.values(counts).filter(n => n > 0).length;
    const hasNonCapture = counts.journal + counts.voice + counts.shared_link > 0;
    if (distinctTypes > 1 || hasNonCapture) {
        sections.push(`ENTRY MIX: ${mixParts.join(', ')}`);
    }

    return sections.join('\n\n');
}

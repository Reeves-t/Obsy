import type { Capture } from '@/types/capture';
import type { Topic, TopicNote, TopicStats } from '@/lib/topicStore';
import type { TopicAttachment } from '@/services/topicAttachments';
import type { HabitGoal } from '@/lib/habitGoalStore';
import { buildContextDigest, DigestEntry } from '@/lib/contextDigests';
import { getLensDef, inferTopicLens } from '@/lib/topicLens';

/**
 * Builds a comprehensive plain-text digest of EVERYTHING the AI can see for
 * a topic: identity, stats, captures (with their notes / mood / source-type),
 * topic notes (notes + insights + missing-gap analyses), and uploaded
 * attachments (with extracted text where available).
 *
 * The output is passed as `moodverseContext` to the moodverse-explain edge
 * function — its `formatContextPack` tries JSON-parse first and falls
 * through to passing the string verbatim to Claude when it's plain text.
 */
export interface TopicDigestInput {
    topic: Topic;
    stats: TopicStats;
    captures: Capture[];
    topicNotes: TopicNote[];
    attachments: TopicAttachment[];
    habitGoals?: HabitGoal[];
}

function describeCapture(c: Capture, dateStr: string): string {
    const lines: string[] = [];
    const moodPart = c.mood_name_snapshot || 'unknown';

    if (c.source_type === 'shared_link') {
        const platform = c.shared_link_platform || 'web';
        const title = c.shared_link_title || c.shared_link_url || 'shared link';
        lines.push(`- [${dateStr}] SHARED LINK from ${platform}: "${title}"`);
        if (c.shared_link_digest) lines.push(`    about: "${c.shared_link_digest}"`);
        if (c.shared_link_url) lines.push(`    url: ${c.shared_link_url}`);
        if (c.note) lines.push(`    user note: "${c.note}"`);
        lines.push(`    mood: ${moodPart}`);
    } else if (c.source_type === 'voice') {
        lines.push(`- [${dateStr}] VOICE note · mood: ${moodPart}`);
        if (c.note) lines.push(`    transcript: "${c.note}"`);
    } else if (c.source_type === 'journal') {
        lines.push(`- [${dateStr}] JOURNAL · mood: ${moodPart}`);
        if (c.note) lines.push(`    text: "${c.note}"`);
    } else {
        // capture (photo) or unknown
        const hasPhoto = !!(c.image_url && !c.image_url.startsWith('blank://'));
        lines.push(`- [${dateStr}] CAPTURE · mood: ${moodPart}${hasPhoto ? ' · has photo' : ''}`);
        if (c.note) lines.push(`    note: "${c.note}"`);
    }

    if (c.obsy_note) {
        lines.push(`    (prior AI reflection: "${c.obsy_note}")`);
    }

    return lines.join('\n');
}

function describeNote(n: TopicNote, dateStr: string): string {
    const kind = n.kind ?? 'note';
    const trimmed = n.text.length > 1200 ? n.text.slice(0, 1200) + '\n[...truncated]' : n.text;

    if (kind === 'response' && n.response) {
        return (
            `- [${dateStr}] USER RESPONSE (HIGH IMPORTANCE — the user directly replied to an AI ` +
            `${n.response.sourcePage} insight in the "${n.response.sourceSection}" section):\n` +
            `    AI said: "${n.response.originalInsight}"\n` +
            `    User replied: "${trimmed}"`
        );
    }

    const label = kind === 'missing_gaps' ? 'PRIOR GAP ANALYSIS'
        : kind === 'insight' ? 'PRIOR INSIGHT'
        : 'USER NOTE';
    return `- [${dateStr}] ${label}:\n${trimmed}`;
}

function describeHabitGoal(g: HabitGoal): string {
    const note = g.note ? ` — ${g.note}` : '';
    return `- ${g.frequency} ${g.type}: "${g.title}"${note} (current streak ${g.currentStreak})`;
}

function describeAttachment(a: TopicAttachment, dateStr: string): string {
    const lines: string[] = [];
    const typeLabel = a.kind === 'image' ? 'IMAGE' : 'DOCUMENT';
    const mime = a.mime_type ? ` (${a.mime_type})` : '';
    lines.push(`- [${dateStr}] ${typeLabel} "${a.file_name}"${mime}`);

    switch (a.extraction_status) {
        case 'done':
            if (a.extracted_text && a.extracted_text.trim()) {
                const trimmed = a.extracted_text.length > 6000
                    ? a.extracted_text.slice(0, 6000) + '\n[...truncated]'
                    : a.extracted_text;
                lines.push('    extracted content:');
                // Indent each line for readability in the prompt.
                for (const line of trimmed.split('\n')) {
                    lines.push(`      ${line}`);
                }
            } else {
                lines.push('    (no extractable content)');
            }
            break;
        case 'processing':
        case 'pending':
            lines.push('    (extraction in progress — content not yet available)');
            break;
        case 'failed':
            lines.push(`    (extraction failed: ${a.extraction_error ?? 'unknown error'})`);
            break;
        case 'skipped':
            lines.push(`    (extraction skipped: ${a.extraction_error ?? 'unsupported file type'})`);
            break;
    }

    return lines.join('\n');
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function buildTopicDigest(input: TopicDigestInput): string {
    const { topic, stats, captures, topicNotes, attachments, habitGoals } = input;

    const linkedCaptures = captures.filter(c => c.tags?.includes(`topic:${topic.id}`));
    const topicScopedNotes = topicNotes.filter(n => n.topicId === topic.id);
    const topicScopedAttachments = attachments.filter(a => a.topic_id === topic.id && !a.deleted_at);

    // ── Mood distribution (top 8) ──
    const moodCounts: Record<string, number> = {};
    linkedCaptures.forEach(c => {
        const name = c.mood_name_snapshot || 'unknown';
        moodCounts[name] = (moodCounts[name] || 0) + 1;
    });
    const moodDistribution = Object.entries(moodCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);

    const lines: string[] = [];

    // ── Identity ──
    const lens = getLensDef(topic.lens ?? inferTopicLens(topic.title, topic.description));
    lines.push(`TOPIC: "${topic.title}"`);
    if (topic.description) lines.push(`Description: ${topic.description}`);
    lines.push(`Lens: ${lens.label} — ${lens.description}`);
    lines.push('');

    // ── Stats ──
    lines.push('STATS:');
    lines.push(`- Total entries: ${stats.totalEntries}`);
    if (stats.moodAvg > 0) lines.push(`- Mood average: ${stats.moodAvg.toFixed(1)}/10`);
    if (stats.streak > 0) lines.push(`- Current streak: ${stats.streak} days`);
    if (stats.mostFelt !== '—') lines.push(`- Most felt mood: ${stats.mostFelt}`);
    if (stats.lastLogged) lines.push(`- Last logged: ${stats.lastLogged}`);
    if (stats.impact) lines.push(`- Impact label: ${stats.impact}`);
    lines.push('');

    if (moodDistribution.length > 0) {
        lines.push('MOOD DISTRIBUTION:');
        for (const [mood, count] of moodDistribution) {
            lines.push(`- ${mood}: ${count}x`);
        }
        lines.push('');
    }

    // ── Captures (rich text) ──
    const sortedCaptures = [...linkedCaptures].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const recentCaptures = sortedCaptures.slice(0, 30);

    if (recentCaptures.length > 0) {
        lines.push(`ENTRIES (${recentCaptures.length} most recent of ${linkedCaptures.length} total):`);
        for (const c of recentCaptures) {
            const date = formatDate(c.created_at);
            lines.push(describeCapture(c, date));
        }
        lines.push('');
    }

    // ── Topic notes (notes, insights, gaps, responses) ──
    // User responses are high-importance signals, so they are always included
    // ahead of (and not crowded out by) ordinary notes.
    const byDateDesc = (a: TopicNote, b: TopicNote) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    const responses = topicScopedNotes.filter(n => n.kind === 'response').sort(byDateDesc).slice(0, 12);
    const otherNotes = topicScopedNotes.filter(n => n.kind !== 'response').sort(byDateDesc).slice(0, 12);
    const recentNotes = [...responses, ...otherNotes];

    if (recentNotes.length > 0) {
        lines.push(`TOPIC NOTES & RESPONSES (${recentNotes.length} of ${topicScopedNotes.length} total):`);
        for (const n of recentNotes) {
            const date = formatDate(n.createdAt);
            lines.push(describeNote(n, date));
        }
        lines.push('');
    }

    // ── Linked goals & habits ──
    if (habitGoals && habitGoals.length > 0) {
        lines.push(`LINKED GOALS & HABITS (${habitGoals.length}):`);
        for (const g of habitGoals) {
            lines.push(describeHabitGoal(g));
        }
        lines.push('');
    }

    // ── Attachments with extracted content ──
    const sortedAttachments = [...topicScopedAttachments].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    if (sortedAttachments.length > 0) {
        lines.push(`UPLOADED FILES (${sortedAttachments.length} total):`);
        for (const a of sortedAttachments) {
            const date = formatDate(a.created_at);
            lines.push(describeAttachment(a, date));
        }
        lines.push('');
    }

    // ── Time-clustered digest (existing helper) ──
    const digestEntries: DigestEntry[] = linkedCaptures.map((c) => ({
        date: c.created_at,
        mood: c.mood_name_snapshot,
        note: c.note,
        sourceType: c.source_type,
        sharedLinkPlatform: c.shared_link_platform,
        sharedLinkTitle: c.shared_link_title,
        sharedLinkDigest: c.shared_link_digest,
    }));
    const timeDigest = buildContextDigest(digestEntries);
    if (timeDigest) {
        lines.push(timeDigest);
        lines.push('');
    }

    return lines.join('\n');
}

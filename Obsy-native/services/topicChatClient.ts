import { supabase } from '@/lib/supabase';
import type { ChatMessage } from '@/lib/moodverseStore';
import type { Capture } from '@/types/capture';
import type { Topic, TopicNote, TopicStats } from '@/lib/topicStore';
import { buildContextDigest, DigestEntry } from '@/lib/contextDigests';
import { getToneDefinition, isPresetTone, type AiToneId } from '@/lib/aiTone';
import { getCustomToneById } from '@/lib/customTone';

export interface TopicChatResponse {
    ok: boolean;
    text?: string;
    requestId?: string;
    error?: { stage: string; message: string; status: number };
}

function buildTopicContext(topic: Topic, stats: TopicStats, captures: Capture[]): string {
    const linked = captures.filter(c => c.tags?.includes(`topic:${topic.id}`));
    const sorted = [...linked].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const recentEntries = sorted.slice(0, 20);

    const moodCounts: Record<string, number> = {};
    linked.forEach(c => {
        const name = c.mood_name_snapshot || 'unknown';
        moodCounts[name] = (moodCounts[name] || 0) + 1;
    });
    const moodDistribution = Object.entries(moodCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);

    // Build plain-text context so the edge function's formatContextPack
    // falls through its catch block and passes this string to Claude as-is.
    const lines: string[] = [];

    lines.push(`TOPIC REFLECTION: "${topic.title}"`);
    if (topic.description) lines.push(`Description: ${topic.description}`);
    lines.push('');

    lines.push('TOPIC STATS:');
    lines.push(`- Total entries: ${stats.totalEntries}`);
    if (stats.moodAvg > 0) lines.push(`- Mood average: ${stats.moodAvg.toFixed(1)}`);
    if (stats.streak > 0) lines.push(`- Current streak: ${stats.streak} days`);
    if (stats.mostFelt !== '—') lines.push(`- Most felt mood: ${stats.mostFelt}`);
    if (stats.lastLogged) lines.push(`- Last logged: ${stats.lastLogged}`);
    if (stats.impact) lines.push(`- Impact: ${stats.impact}`);
    lines.push('');

    if (moodDistribution.length > 0) {
        lines.push('MOOD DISTRIBUTION:');
        for (const [mood, count] of moodDistribution) {
            lines.push(`- ${mood}: ${count}x`);
        }
        lines.push('');
    }

    if (recentEntries.length > 0) {
        lines.push('RECENT ENTRIES:');
        for (const c of recentEntries) {
            const date = new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const notePart = c.note ? ` — "${c.note}"` : '';
            lines.push(`- ${date}: ${c.mood_name_snapshot}${notePart}`);
        }
        lines.push('');
    }

    const digestEntries: DigestEntry[] = linked.map((c) => ({
        date: c.created_at,
        mood: c.mood_name_snapshot,
        note: c.note,
        sourceType: c.source_type,
        sharedLinkPlatform: c.shared_link_platform,
        sharedLinkTitle: c.shared_link_title,
    }));
    const digest = buildContextDigest(digestEntries);
    if (digest) {
        lines.push(digest);
        lines.push('');
    }

    lines.push('INSTRUCTIONS:');
    lines.push(`You are Obsy, a calm and reflective AI companion. The user is reflecting on their "${topic.title}" topic. Stay entirely focused on this topic and its associated data — do not reference other areas of their life or app data unrelated to this topic. Be warm, curious, and insightful. Ask one question at a time. Keep responses concise (2-4 sentences).`);

    return lines.join('\n');
}

function buildCapturePayload(topic: Topic, captures: Capture[]) {
    const linked = captures
        .filter(c => c.tags?.includes(`topic:${topic.id}`))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 15);

    if (linked.length === 0) {
        return [{ id: `topic-${topic.id}`, mood: 'reflective', date: new Date().toISOString() }];
    }

    return linked.map(c => ({
        id: c.id,
        mood: c.mood_name_snapshot,
        note: c.note ?? undefined,
        tags: c.tags,
        date: c.created_at,
    }));
}

export async function callTopicChat(
    topic: Topic,
    stats: TopicStats,
    captures: Capture[],
    messages: ChatMessage[],
): Promise<TopicChatResponse> {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
        return { ok: false, error: { stage: 'auth', message: 'Authentication required', status: 401 } };
    }

    try {
        const response = await supabase.functions.invoke('moodverse-explain', {
            body: {
                captures: buildCapturePayload(topic, captures),
                selectionMode: 'multi',
                messages: messages.map(m => ({ role: m.role, text: m.text })),
                moodverseContext: buildTopicContext(topic, stats, captures),
            },
            headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (response.error) {
            return { ok: false, error: { stage: 'fetch', message: response.error.message || 'Network error', status: 500 } };
        }

        const data = response.data;
        if (!data || typeof data !== 'object') {
            return { ok: false, error: { stage: 'parse', message: 'Invalid response', status: 500 } };
        }

        return { ok: true, text: (data as any).text, requestId: (data as any).requestId };
    } catch (error: any) {
        return { ok: false, error: { stage: 'unknown', message: error?.message || 'Unexpected error', status: 500 } };
    }
}

async function resolveToneStyle(toneId: string | undefined): Promise<{ label: string; guidelines: string }> {
    if (!toneId) {
        const def = getToneDefinition('neutral');
        return { label: def.label, guidelines: def.styleGuidelines };
    }
    if (isPresetTone(toneId)) {
        const def = getToneDefinition(toneId as AiToneId);
        return { label: def.label, guidelines: def.styleGuidelines };
    }
    try {
        const custom = await getCustomToneById(toneId);
        if (custom) {
            return { label: custom.name, guidelines: custom.prompt };
        }
    } catch {
        // fall through to neutral
    }
    const def = getToneDefinition('neutral');
    return { label: def.label, guidelines: def.styleGuidelines };
}

export async function generateTopicInsight(
    topic: Topic,
    stats: TopicStats,
    captures: Capture[],
): Promise<TopicChatResponse> {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
        return { ok: false, error: { stage: 'auth', message: 'Authentication required', status: 401 } };
    }

    const tone = await resolveToneStyle(topic.toneId);

    const insightContext =
        buildTopicContext(topic, stats, captures) +
        '\n\nTONE:\n' +
        `Voice: ${tone.label}.\n` +
        tone.guidelines +
        '\n\nINSIGHT GENERATION MODE:\n' +
        `Write a single paragraph (4-6 sentences, ~80-120 words) reflecting on the user's "${topic.title}" topic ` +
        'based strictly on the data above. Surface one meaningful pattern, contrast, or thread worth noticing. ' +
        'Ground every claim in the data (counts, dates, mood names). Match the tone described above precisely. ' +
        'No preamble, no headings, no follow-up questions, no markdown. Output only the paragraph.';

    const askMessage: ChatMessage = {
        id: `insight-req-${Date.now()}`,
        role: 'user',
        text: `Write the ${tone.label.toLowerCase()} insight paragraph for my "${topic.title}" topic now.`,
    };

    try {
        const response = await supabase.functions.invoke('moodverse-explain', {
            body: {
                captures: buildCapturePayload(topic, captures),
                selectionMode: 'multi',
                messages: [{ role: askMessage.role, text: askMessage.text }],
                moodverseContext: insightContext,
            },
            headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (response.error) {
            return { ok: false, error: { stage: 'fetch', message: response.error.message || 'Network error', status: 500 } };
        }

        const data = response.data;
        if (!data || typeof data !== 'object') {
            return { ok: false, error: { stage: 'parse', message: 'Invalid response', status: 500 } };
        }

        return { ok: true, text: (data as any).text, requestId: (data as any).requestId };
    } catch (error: any) {
        return { ok: false, error: { stage: 'unknown', message: error?.message || 'Unexpected error', status: 500 } };
    }
}

export async function generateTopicNote(
    topic: Topic,
    stats: TopicStats,
    captures: Capture[],
    messages: ChatMessage[],
): Promise<TopicChatResponse> {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
        return { ok: false, error: { stage: 'auth', message: 'Authentication required', status: 401 } };
    }

    const noteRequestMessage: ChatMessage = {
        id: `note-req-${Date.now()}`,
        role: 'user',
        text: `Based on our conversation about "${topic.title}", write a short mindful takeaway in 1–3 sentences. Make it a personal, reflective insight worth revisiting — not a summary. Keep it concise and meaningful. Only output the note text, nothing else.`,
    };

    const historyWithRequest = [...messages, noteRequestMessage];

    // Plain-text context so the edge function's formatContextPack falls through
    // its catch block and passes this string to Claude as-is (mirrors callTopicChat).
    const noteContext =
        buildTopicContext(topic, stats, captures) +
        '\n\nNOTE GENERATION MODE:\n' +
        'Generate only the note text. 1-3 sentences. Reflective, personal, mindful. Not a summary. No preamble or explanation.';

    try {
        const response = await supabase.functions.invoke('moodverse-explain', {
            body: {
                captures: buildCapturePayload(topic, captures),
                selectionMode: 'multi',
                messages: historyWithRequest.map(m => ({ role: m.role, text: m.text })),
                moodverseContext: noteContext,
            },
            headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (response.error) {
            return { ok: false, error: { stage: 'fetch', message: response.error.message || 'Network error', status: 500 } };
        }

        const data = response.data;
        if (!data || typeof data !== 'object') {
            return { ok: false, error: { stage: 'parse', message: 'Invalid response', status: 500 } };
        }

        return { ok: true, text: (data as any).text, requestId: (data as any).requestId };
    } catch (error: any) {
        return { ok: false, error: { stage: 'unknown', message: error?.message || 'Unexpected error', status: 500 } };
    }
}

// ── Missing Gaps (meta-cognition) ───────────────────────────────────────

function buildPriorNotesContext(notes: TopicNote[]): string {
    if (notes.length === 0) return '';

    const recent = [...notes]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 12);

    const lines: string[] = ['EXISTING TOPIC NOTES (most recent first):'];
    for (const n of recent) {
        const kind = n.kind ?? 'note';
        const label =
            kind === 'missing_gaps' ? 'PRIOR GAP ANALYSIS' :
            kind === 'insight' ? 'INSIGHT' :
            'NOTE';
        const date = new Date(n.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const trimmed = n.text.replace(/\s+/g, ' ').trim();
        lines.push(`- [${label} · ${date}] ${trimmed}`);
    }
    return lines.join('\n');
}

export async function generateMissingGaps(
    topic: Topic,
    stats: TopicStats,
    captures: Capture[],
    priorNotes: TopicNote[] = [],
): Promise<TopicChatResponse> {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
        return { ok: false, error: { stage: 'auth', message: 'Authentication required', status: 401 } };
    }

    const priorNotesBlock = buildPriorNotesContext(priorNotes);

    const gapsContext =
        buildTopicContext(topic, stats, captures) +
        (priorNotesBlock ? '\n\n' + priorNotesBlock : '') +
        '\n\nMETA-COGNITION MODE — MISSING GAPS:\n' +
        `You are performing a meta-cognition analysis of the user's "${topic.title}" topic.\n` +
        'Your job is to identify what is MISSING, UNFINISHED, INCONSISTENT, or OVERLOOKED in their thinking about this topic.\n' +
        'Look at the topic title, description, stats, entries, prior notes, and prior gap analyses above.\n' +
        '\n' +
        'OUTPUT STRICT FORMAT:\n' +
        'Plain text only. No markdown bold/italics/headers. No emojis. No preamble. No closing remarks.\n' +
        'Use these section headings exactly as written, each on its own line, followed by bullet items prefixed with "• ".\n' +
        'Only include a section if you have at least one concrete, grounded bullet for it. Skip empty sections.\n' +
        '\n' +
        'Allowed section headings (use 2-5 of these, choose what fits):\n' +
        '  Potential Blind Spots\n' +
        '  Questions Worth Answering\n' +
        '  Weak Structure Areas\n' +
        '  Possible Next Steps\n' +
        '  Repeated Patterns\n' +
        '  Contradictions Detected\n' +
        '\n' +
        'RULES:\n' +
        '- 2-5 bullets per section, each one short (under 18 words).\n' +
        '- Every bullet must be grounded in something specific from the data above. No generic advice.\n' +
        '- If prior gap analyses exist, do NOT repeat them verbatim — surface what has changed or what is still unresolved.\n' +
        '- Observational and analytical tone. No therapy, no motivation, no productivity coaching.\n' +
        '- If there is genuinely insufficient data to find gaps, output only: "Not enough material yet to surface meaningful gaps."\n' +
        '\n' +
        'EXAMPLE OUTPUT SHAPE:\n' +
        'Potential Blind Spots\n' +
        '• No mention of how this project handles failure cases\n' +
        '• Mood data shows stress spikes around this topic but no entry explains why\n' +
        '\n' +
        'Questions Worth Answering\n' +
        '• What does "done" look like for this topic?\n' +
        '• Why has activity dropped off in the last week?\n' +
        '\n' +
        'Output the analysis now.';

    const askMessage: ChatMessage = {
        id: `gaps-req-${Date.now()}`,
        role: 'user',
        text: `Perform the missing-gaps meta-cognition analysis for my "${topic.title}" topic now.`,
    };

    try {
        const response = await supabase.functions.invoke('moodverse-explain', {
            body: {
                captures: buildCapturePayload(topic, captures),
                selectionMode: 'multi',
                messages: [{ role: askMessage.role, text: askMessage.text }],
                moodverseContext: gapsContext,
            },
            headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (response.error) {
            return { ok: false, error: { stage: 'fetch', message: response.error.message || 'Network error', status: 500 } };
        }

        const data = response.data;
        if (!data || typeof data !== 'object') {
            return { ok: false, error: { stage: 'parse', message: 'Invalid response', status: 500 } };
        }

        return { ok: true, text: (data as any).text, requestId: (data as any).requestId };
    } catch (error: any) {
        return { ok: false, error: { stage: 'unknown', message: error?.message || 'Unexpected error', status: 500 } };
    }
}

import { supabase } from '@/lib/supabase';
import type { ChatMessage } from '@/lib/moodverseStore';
import type { Capture } from '@/types/capture';
import type { Topic, TopicStats } from '@/lib/topicStore';

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

    const noteContext = JSON.stringify({
        ...JSON.parse(buildTopicContext(topic, stats, captures)),
        noteGeneration: true,
        noteInstructions: 'Generate only the note text. 1-3 sentences. Reflective, personal, mindful. Not a summary. No preamble or explanation.',
    });

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

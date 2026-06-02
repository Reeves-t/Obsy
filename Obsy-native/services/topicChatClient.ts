import { supabase } from '@/lib/supabase';
import type { ChatMessage } from '@/lib/moodverseStore';
import type { Capture } from '@/types/capture';
import type { Topic, TopicNote, TopicStats } from '@/lib/topicStore';
import type { TopicAttachment } from '@/services/topicAttachments';
import { getToneDefinition, isPresetTone, type AiToneId } from '@/lib/aiTone';
import { getCustomToneById } from '@/lib/customTone';
import { buildTopicDigest } from '@/services/topicContentDigest';
import type {
    DiscoverPayload,
    EvolvePayload,
    GoalHabitSuggestion,
} from '@/lib/topicAiTypes';
import { parseJsonFromText, coerceDiscover, coerceEvolve, coerceSuggestions } from '@/lib/topicAiParse';

export interface TopicChatResponse {
    ok: boolean;
    text?: string;
    requestId?: string;
    error?: { stage: string; message: string; status: number };
}

/**
 * Everything an AI feature needs to reason about a topic — passed as a single
 * bundle so the four AI entry points share one consistent context shape.
 */
export interface TopicContext {
    topic: Topic;
    stats: TopicStats;
    captures: Capture[];
    topicNotes: TopicNote[];
    attachments: TopicAttachment[];
}

// ── Helpers ────────────────────────────────────────────────────────────

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

async function invokeMoodverseExplain(
    ctx: TopicContext,
    messages: { role: ChatMessage['role']; text: string }[],
    contextSuffix: string,
): Promise<TopicChatResponse> {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
        return { ok: false, error: { stage: 'auth', message: 'Authentication required', status: 401 } };
    }

    const baseDigest = buildTopicDigest({
        topic: ctx.topic,
        stats: ctx.stats,
        captures: ctx.captures,
        topicNotes: ctx.topicNotes,
        attachments: ctx.attachments,
    });

    const moodverseContext = baseDigest + (contextSuffix ? `\n\n${contextSuffix}` : '');

    try {
        const response = await supabase.functions.invoke('moodverse-explain', {
            body: {
                captures: buildCapturePayload(ctx.topic, ctx.captures),
                selectionMode: 'multi',
                messages,
                moodverseContext,
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

// ── Ask Obsy chat ───────────────────────────────────────────────────────

export async function callTopicChat(
    ctx: TopicContext,
    messages: ChatMessage[],
): Promise<TopicChatResponse> {
    return invokeMoodverseExplain(
        ctx,
        messages.map(m => ({ role: m.role, text: m.text })),
        `You are Obsy, a calm and reflective AI companion. The user is reflecting on their "${ctx.topic.title}" topic. ` +
            'Stay entirely focused on this topic and its associated data — do not reference unrelated areas. ' +
            'Be warm, curious, and insightful. Ask one question at a time. Keep responses concise (2-4 sentences).',
    );
}

// ── Note generation from chat ──────────────────────────────────────────

export async function generateTopicNote(
    ctx: TopicContext,
    messages: ChatMessage[],
): Promise<TopicChatResponse> {
    const noteRequestMessage: ChatMessage = {
        id: `note-req-${Date.now()}`,
        role: 'user',
        text: `Based on our conversation about "${ctx.topic.title}", write a short mindful takeaway in 1–3 sentences. Make it a personal, reflective insight worth revisiting — not a summary. Keep it concise and meaningful. Only output the note text, nothing else.`,
    };
    const historyWithRequest = [...messages, noteRequestMessage];

    return invokeMoodverseExplain(
        ctx,
        historyWithRequest.map(m => ({ role: m.role, text: m.text })),
        'NOTE GENERATION MODE:\n' +
            'Generate only the note text. 1-3 sentences. Reflective, personal, mindful. Not a summary. No preamble or explanation.',
    );
}

// ── Insight (tone-shaped paragraph) ────────────────────────────────────

export async function generateTopicInsight(ctx: TopicContext): Promise<TopicChatResponse> {
    const tone = await resolveToneStyle(ctx.topic.toneId);

    const askMessage: ChatMessage = {
        id: `insight-req-${Date.now()}`,
        role: 'user',
        text: `Write the ${tone.label.toLowerCase()} insight paragraph for my "${ctx.topic.title}" topic now.`,
    };

    return invokeMoodverseExplain(
        ctx,
        [{ role: askMessage.role, text: askMessage.text }],
        'TONE:\n' +
            `Voice: ${tone.label}.\n` +
            tone.guidelines +
            '\n\nINSIGHT GENERATION MODE:\n' +
            `Write a single paragraph (4-6 sentences, ~80-120 words) reflecting on the user's "${ctx.topic.title}" topic ` +
            'based strictly on the data above. Surface one meaningful pattern, contrast, or thread worth noticing. ' +
            'Ground every claim in the data (counts, dates, mood names, file contents). Match the tone described above precisely. ' +
            'No preamble, no headings, no follow-up questions, no markdown. Output only the paragraph.',
    );
}

// ── Missing Gaps (meta-cognition) ──────────────────────────────────────

export async function generateMissingGaps(ctx: TopicContext): Promise<TopicChatResponse> {
    const askMessage: ChatMessage = {
        id: `gaps-req-${Date.now()}`,
        role: 'user',
        text: `Perform the missing-gaps meta-cognition analysis for my "${ctx.topic.title}" topic now.`,
    };

    return invokeMoodverseExplain(
        ctx,
        [{ role: askMessage.role, text: askMessage.text }],
        'META-COGNITION MODE — MISSING GAPS:\n' +
            `You are performing a meta-cognition analysis of the user's "${ctx.topic.title}" topic.\n` +
            'Your job is to identify what is MISSING, UNFINISHED, INCONSISTENT, or OVERLOOKED in their thinking about this topic.\n' +
            'Look at the topic title, description, stats, entries, uploaded files (with extracted content), prior notes, and prior gap analyses above.\n' +
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
            'Output the analysis now.',
    );
}

// ── Structured generation (Discover / Evolve / Goal suggestions) ─────────
//
// These power the new Focus Mode pages. The deployed `moodverse-explain` edge
// function only returns free-form `{ text }`, so each function asks the model
// for strict JSON in the contextSuffix and parses it client-side (same spirit
// as parseGapsOutput in MissingGapsModal). All output is coerced defensively.

export interface TopicGenResult<T> {
    ok: boolean;
    data?: T;
    error?: { stage: string; message: string; status: number };
}

const PARSE_ERROR = { stage: 'parse', message: 'Could not parse AI response', status: 500 };

// ── Discover (page 2) ────────────────────────────────────────────────────

export async function generateTopicDiscover(
    ctx: TopicContext,
    otherTopicTitles: string[] = [],
): Promise<TopicGenResult<DiscoverPayload>> {
    const tone = await resolveToneStyle(ctx.topic.toneId);
    const others = otherTopicTitles.filter(Boolean).slice(0, 10);
    const connectionsHint = others.length
        ? `You may also note links to the user's other topics by name when genuinely related: ${others
              .map((t) => `"${t}"`)
              .join(', ')}. Phrase like "This connects with your Fitness topic through discipline."`
        : "Only surface connections within this topic's own entries and ideas.";

    const askMessage: ChatMessage = {
        id: `discover-req-${Date.now()}`,
        role: 'user',
        text: `Produce the Discover awareness analysis for my "${ctx.topic.title}" topic now.`,
    };

    const result = await invokeMoodverseExplain(
        ctx,
        [{ role: askMessage.role, text: askMessage.text }],
        'TONE:\n' +
            `Voice: ${tone.label}.\n` +
            tone.guidelines +
            '\n\nDISCOVER MODE — STRUCTURED AWARENESS:\n' +
            `Analyze the user's "${ctx.topic.title}" topic as a flexible awareness space. It may be a goal, a creative pursuit, a personal/relationship theme, a learning area, or something else — it is NOT necessarily about productivity.\n` +
            'First infer the topic ARCHETYPE from its title, description and entries:\n' +
            '  goal — an outcome the user is working toward\n' +
            '  creative — making, exploring, ideas\n' +
            '  personal — self, relationships, emotions, identity\n' +
            '  learning — studying, concepts, knowledge\n' +
            '  other — anything else\n' +
            '\nThen produce, grounded strictly in the data above:\n' +
            '- corePattern: the single strongest observation about this topic (1-2 sentences, specific not generic).\n' +
            '- themes: 3-6 short recurring themes (1-3 words each), e.g. Growth, Creativity, Discipline.\n' +
            '- perspectives: 3-4 reflective prompts that ADAPT to the archetype. Do NOT always generate tasks.\n' +
            '    goal → what steps are unclear / what is blocking progress\n' +
            '    creative → which ideas deserve deeper exploration\n' +
            '    personal → what patterns are worth observing\n' +
            '    learning → what concepts could connect together\n' +
            `- connections: 2-4 relationships between entries or ideas. ${connectionsHint}\n` +
            '\nOUTPUT — JSON ONLY. No markdown, no code fences, no preamble:\n' +
            '{"archetype":"goal|creative|personal|learning|other","corePattern":"...","themes":["..."],"perspectives":["..."],"connections":["..."]}\n' +
            'Use an empty array for any field without enough grounded material. Output only the JSON object.',
    );

    if (!result.ok) return { ok: false, error: result.error };
    const data = coerceDiscover(parseJsonFromText(result.text));
    if (!data) return { ok: false, error: PARSE_ERROR };
    return { ok: true, data };
}

// ── Evolve (page 3) ──────────────────────────────────────────────────────

export async function generateTopicEvolve(ctx: TopicContext): Promise<TopicGenResult<EvolvePayload>> {
    const tone = await resolveToneStyle(ctx.topic.toneId);

    const askMessage: ChatMessage = {
        id: `evolve-req-${Date.now()}`,
        role: 'user',
        text: `Produce the Evolve direction analysis for my "${ctx.topic.title}" topic now.`,
    };

    const result = await invokeMoodverseExplain(
        ctx,
        [{ role: askMessage.role, text: askMessage.text }],
        'TONE:\n' +
            `Voice: ${tone.label}.\n` +
            tone.guidelines +
            '\n\nEVOLVE MODE — REFLECTION INTO DIRECTION:\n' +
            `Analyze the user's "${ctx.topic.title}" topic as a flexible awareness space (not necessarily a productivity goal). Ground everything strictly in the data above.\n` +
            '\nProduce:\n' +
            '- journey: how the thinking has progressed. {started, current, emerging} — each a short phrase or sentence.\n' +
            '    started: where this topic began (earliest entries / original intent)\n' +
            "    current: where the user's attention is now\n" +
            '    emerging: what seems to be forming next\n' +
            '- realizations: 1-4 important moments detected from entries. Each {date, text}. date is a short label from the entry (e.g. "May 23") or "" if unknown; text is the realization (1 sentence).\n' +
            '- openThreads: 1-4 unfinished thoughts or things mentioned but not explored. NOT always tasks. e.g. "You mentioned marketing several times but haven\'t explored launch strategy."\n' +
            '- suggestions: 1-2 concrete ways to act on this awareness, grounded in the topic — ideally one DAILY habit and one WEEKLY goal. Each {type:"habit"|"goal", frequency:"daily"|"weekly", title (max ~8 words), note (optional one-line reason)}. Avoid generic advice.\n' +
            '\nOUTPUT — JSON ONLY. No markdown, no code fences, no preamble:\n' +
            '{"journey":{"started":"...","current":"...","emerging":"..."},"realizations":[{"date":"...","text":"..."}],"openThreads":["..."],"suggestions":[{"type":"habit","frequency":"daily","title":"...","note":"..."}]}\n' +
            'Use empty strings / empty arrays where there is not enough grounded material. Output only the JSON object.',
    );

    if (!result.ok) return { ok: false, error: result.error };
    const data = coerceEvolve(parseJsonFromText(result.text));
    if (!data) return { ok: false, error: PARSE_ERROR };
    return { ok: true, data };
}

// ── Goal / Habit suggestions (Evolve CTA) ────────────────────────────────

export async function suggestTopicGoalHabit(
    ctx: TopicContext,
    changeRequest?: string,
    previous?: GoalHabitSuggestion,
): Promise<TopicGenResult<GoalHabitSuggestion[]>> {
    const isRevision = !!(changeRequest && previous);

    const askMessage: ChatMessage = {
        id: `goalhabit-req-${Date.now()}`,
        role: 'user',
        text: isRevision
            ? `Revise the goal/habit suggestion for my "${ctx.topic.title}" topic.`
            : `Suggest goals/habits for my "${ctx.topic.title}" topic now.`,
    };

    const reviseBlock = isRevision
        ? '\nREVISION REQUEST:\n' +
          `The user wants to change this suggestion: ${JSON.stringify(previous)}.\n` +
          `Their request: "${changeRequest}".\n` +
          'Return exactly ONE updated suggestion honoring the request, still grounded in this topic.\n'
        : '';

    const result = await invokeMoodverseExplain(
        ctx,
        [{ role: askMessage.role, text: askMessage.text }],
        'GROW FROM TOPIC — GOAL/HABIT SUGGESTION:\n' +
            `Based strictly on the "${ctx.topic.title}" topic data above (name, description, entries, patterns, intention), suggest concrete ways to act on this awareness.\n` +
            'Decide for each whether it fits better as a DAILY habit or a WEEKLY goal — propose one of each when both fit.\n' +
            "Avoid generic advice. Each suggestion MUST come from this topic's actual context.\n" +
            (isRevision ? '' : 'Return up to 2 suggestions (ideally one daily habit and one weekly goal).\n') +
            'Each suggestion:\n' +
            '- type: "habit" (recurring action) or "goal" (outcome)\n' +
            '- frequency: "daily" or "weekly"\n' +
            '- title: short, concrete, actionable (max ~8 words)\n' +
            '- note: optional one-line reason it matters\n' +
            reviseBlock +
            '\nOUTPUT — JSON ONLY. No markdown, no preamble:\n' +
            '{"suggestions":[{"type":"habit","frequency":"daily","title":"...","note":"..."}]}\n' +
            'Output only the JSON object.',
    );

    if (!result.ok) return { ok: false, error: result.error };
    const data = coerceSuggestions(parseJsonFromText(result.text));
    if (!data) return { ok: false, error: PARSE_ERROR };
    return { ok: true, data };
}

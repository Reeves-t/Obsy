import { supabase } from '@/lib/supabase';
import type { ChatMessage } from '@/lib/chatTypes';
import type { Capture } from '@/types/capture';
import type { Topic, TopicNote, TopicStats } from '@/lib/topicStore';
import type { TopicAttachment } from '@/services/topicAttachments';
import { getToneDefinition, isPresetTone, type AiToneId } from '@/lib/aiTone';
import { getCustomToneById } from '@/lib/customTone';
import { buildTopicDigest } from '@/services/topicContentDigest';
import type { HabitGoal } from '@/lib/habitGoalStore';
import type {
    DiscoverPayload,
    EvolvePayload,
    GoalHabitSuggestion,
} from '@/lib/topicAiTypes';
import { parseJsonFromText, coerceDiscover, coerceEvolve, coerceSuggestions } from '@/lib/topicAiParse';
import { getLensDef, inferTopicLens, defaultDepthForLens, type TopicLensDef, type TopicDepth } from '@/lib/topicLens';

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
    habitGoals?: HabitGoal[];
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
        habitGoals: ctx.habitGoals,
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

// ── Lens / data-level prompt shaping ─────────────────────────────────────

function resolveLens(ctx: TopicContext): TopicLensDef {
    const id = ctx.topic.lens ?? inferTopicLens(ctx.topic.title, ctx.topic.description);
    return getLensDef(id);
}

/** How intense Obsy should be here — explicit override, else the lens default. */
function resolveDepth(ctx: TopicContext): TopicDepth {
    const lensId = ctx.topic.lens ?? inferTopicLens(ctx.topic.title, ctx.topic.description);
    return ctx.topic.depth ?? defaultDepthForLens(lensId);
}

/** Captures + direct responses-to-insights → how confidently the AI may speak. */
function signalCount(ctx: TopicContext): number {
    const responses = ctx.topicNotes.filter(
        (n) => n.topicId === ctx.topic.id && n.kind === 'response',
    ).length;
    return ctx.stats.totalEntries + responses;
}

function dataGuidance(signal: number): string {
    if (signal === 0) {
        return (
            'DATA LEVEL — STARTER (no entries yet):\n' +
            'This topic has no entries yet. Generate STARTER content from the topic name, description and lens. ' +
            'These are starting points, NOT observed patterns. Use language like "Starting points", "Areas you may explore", ' +
            '"This topic may grow around...". Do NOT claim patterns exist or pretend there is data. Keep it specific and inviting.'
        );
    }
    if (signal <= 5) {
        return (
            'DATA LEVEL — EARLY (only a few entries):\n' +
            'Be tentative; do not be over-confident. Avoid "You always" / "You tend to". ' +
            'Prefer "Early entries suggest...", "So far this topic includes...", "An early theme appearing is...".'
        );
    }
    return (
        'DATA LEVEL — ESTABLISHED:\n' +
        'There are enough entries to speak with reasonable confidence. Still ground every claim in the data above.'
    );
}

/** Always-on guardrail: Obsy is a calm companion, not an interrogator. */
const ANTI_INTERROGATION =
    'GROUND RULE — do not interrogate the user. Prefer observations over questions. ' +
    'Never stack multiple questions in one section. Do not end every section with a question. ' +
    'Any question must feel optional and calm, never a demand.';

/** Intensity axis (orthogonal to lens): how hard Obsy should push right now. */
function depthGuidance(depth: TopicDepth): string {
    if (depth === 'light') {
        return (
            'RESPONSE ENERGY — LIGHT:\n' +
            'Keep it light and warm. Prioritise observations, commentary, curiosity and documentation — ' +
            'notice what is developing, name specifics, give the topic some lore. Be playful and concrete. ' +
            'Do NOT psychologize, hunt for deeper meaning, or turn enjoyment into self-improvement. ' +
            'At most ONE light, optional question in the entire output, and only if it genuinely helps the user continue the topic.'
        );
    }
    if (depth === 'balanced') {
        return (
            'RESPONSE ENERGY — BALANCED:\n' +
            'Lead with observations. At most ONE useful, optional question per section. ' +
            'Relaxed companion, not a coach. Reflect only when it earns its place; never force depth.'
        );
    }
    return (
        'RESPONSE ENERGY — DEEP:\n' +
        'Reflection, patterns and harder questions are welcome and valuable here. ' +
        'Still never stack 3+ questions in one section and never end every section with a question. ' +
        'Always nonjudgmental — insight, not interrogation.'
    );
}

function lensGuidance(lens: TopicLensDef): string {
    return (
        `TOPIC LENS — ${lens.label}:\n` +
        lens.behavior + '\n' +
        'Respect the lens. Not every topic needs fixing or improvement — sometimes the user wants exploration, ' +
        'documentation, memories, curiosity or creativity. Use time to find evolution, change, contrast and growth, ' +
        'but never judge logging gaps, bursts of logging close together, or inconsistent activity.'
    );
}

function avoidRepeatBlock(summary: string): string {
    if (!summary) return '';
    return (
        '\nPREVIOUSLY SURFACED (avoid repeating unless something has changed):\n' +
        summary +
        '\nIf the underlying data is unchanged, deepen or reframe rather than repeating. Prioritise anything new — ' +
        "especially the user's responses to past insights.\n"
    );
}

function summarizeDiscover(p?: DiscoverPayload): string {
    if (!p) return '';
    const parts: string[] = [];
    if (p.corePattern) parts.push(`- core: ${p.corePattern}`);
    if (p.perspectives?.length) parts.push(`- perspectives: ${p.perspectives.join(' | ')}`);
    if (p.connections?.length) parts.push(`- connections: ${p.connections.join(' | ')}`);
    return parts.join('\n');
}

function summarizeEvolve(p?: EvolvePayload): string {
    if (!p) return '';
    const parts: string[] = [];
    if (p.journey?.current) parts.push(`- current: ${p.journey.current}`);
    if (p.journey?.emerging) parts.push(`- emerging: ${p.journey.emerging}`);
    if (p.openThreads?.length) parts.push(`- threads: ${p.openThreads.join(' | ')}`);
    return parts.join('\n');
}

// ── Discover (page 2) ────────────────────────────────────────────────────

export async function generateTopicDiscover(
    ctx: TopicContext,
    otherTopicTitles: string[] = [],
    previous?: DiscoverPayload,
): Promise<TopicGenResult<DiscoverPayload>> {
    const tone = await resolveToneStyle(ctx.topic.toneId);
    const lens = resolveLens(ctx);
    const depth = resolveDepth(ctx);
    const signal = signalCount(ctx);
    const others = otherTopicTitles.filter(Boolean).slice(0, 10);
    const connectionsHint = others.length
        ? `${lens.hints.connections}. You may also note links to the user's other topics by name when genuinely related: ${others
              .map((t) => `"${t}"`)
              .join(', ')}.`
        : `${lens.hints.connections}.`;

    const askMessage: ChatMessage = {
        id: `discover-req-${Date.now()}`,
        role: 'user',
        text: `Produce the Discover analysis for my "${ctx.topic.title}" topic now.`,
    };

    const result = await invokeMoodverseExplain(
        ctx,
        [{ role: askMessage.role, text: askMessage.text }],
        'TONE:\n' +
            `Voice: ${tone.label}.\n` +
            tone.guidelines +
            '\n\n' +
            lensGuidance(lens) +
            '\n\n' +
            depthGuidance(depth) +
            '\n\n' +
            ANTI_INTERROGATION +
            '\n\n' +
            dataGuidance(signal) +
            '\n\n' +
            'DISCOVER MODE — STRUCTURED AWARENESS:\n' +
            'This is a calm scan of the topic — lead with observations; questions are rare here.\n' +
            `Analyze the user's "${ctx.topic.title}" topic through the ${lens.label} lens. Produce, grounded in the data above:\n` +
            `- corePattern (presented to the user as "${lens.labels.corePattern}"): ${lens.hints.corePattern}. 1-2 sentences, specific not generic.\n` +
            '- themes: 3-6 short recurring themes (1-3 words each).\n' +
            `- perspectives (presented as "${lens.labels.perspectives}"): ${lens.hints.perspectives}. 3-4 items. Do NOT force tasks or problems.\n` +
            `- connections (presented as "${lens.labels.connections}"): ${connectionsHint} 2-4 items.\n` +
            avoidRepeatBlock(summarizeDiscover(previous)) +
            '\nOUTPUT — JSON ONLY. No markdown, no code fences, no preamble:\n' +
            '{"corePattern":"...","themes":["..."],"perspectives":["..."],"connections":["..."]}\n' +
            'Use an empty array for any field without enough grounded material. Output only the JSON object.',
    );

    if (!result.ok) return { ok: false, error: result.error };
    const data = coerceDiscover(parseJsonFromText(result.text));
    if (!data) return { ok: false, error: PARSE_ERROR };
    return { ok: true, data };
}

// ── Evolve (page 3) ──────────────────────────────────────────────────────

export async function generateTopicEvolve(
    ctx: TopicContext,
    previous?: EvolvePayload,
): Promise<TopicGenResult<EvolvePayload>> {
    const tone = await resolveToneStyle(ctx.topic.toneId);
    const lens = resolveLens(ctx);
    const depth = resolveDepth(ctx);
    const signal = signalCount(ctx);

    const askMessage: ChatMessage = {
        id: `evolve-req-${Date.now()}`,
        role: 'user',
        text: `Produce the Evolve analysis for my "${ctx.topic.title}" topic now.`,
    };

    const result = await invokeMoodverseExplain(
        ctx,
        [{ role: askMessage.role, text: askMessage.text }],
        'TONE:\n' +
            `Voice: ${tone.label}.\n` +
            tone.guidelines +
            '\n\n' +
            lensGuidance(lens) +
            '\n\n' +
            depthGuidance(depth) +
            '\n\n' +
            ANTI_INTERROGATION +
            '\n\n' +
            dataGuidance(signal) +
            '\n\n' +
            'EVOLVE MODE — REFLECTION INTO DIRECTION:\n' +
            `Analyze the user's "${ctx.topic.title}" topic through the ${lens.label} lens. Ground everything in the data above.\n` +
            `- journey (presented as "${lens.labels.journey}"): how this has progressed. {started, current, emerging} — each a short phrase.\n` +
            `    started: where this began · current: where attention is now · emerging: what seems to be forming next.\n` +
            `- realizations (presented as "${lens.labels.realizations}"): ${lens.hints.realizations}. 1-4 items, each {date, text}. date is a short label from the entry (e.g. "May 23") or "" if unknown.\n` +
            `- openThreads (presented as "${lens.labels.openThreads}"): ${lens.hints.openThreads}. 1-4 items. NOT always tasks.\n` +
            `- suggestions (presented as "${lens.labels.suggestions}"): ${lens.hints.suggestions}. 1-2 items, each {type:"habit"|"goal", frequency:"daily"|"weekly", title (max ~8 words), note (optional)}.\n` +
            avoidRepeatBlock(summarizeEvolve(previous)) +
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
    const lens = resolveLens(ctx);
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
        lensGuidance(lens) +
            '\n\nGROW FROM TOPIC — GOAL/HABIT SUGGESTION:\n' +
            `Based strictly on the "${ctx.topic.title}" topic data above (name, description, entries, patterns, intention), suggest ${lens.hints.suggestions}.\n` +
            'Decide for each whether it fits better as a DAILY habit or a WEEKLY goal — propose one of each when both fit.\n' +
            "Avoid generic advice. Each suggestion MUST come from this topic's actual context and respect the lens.\n" +
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

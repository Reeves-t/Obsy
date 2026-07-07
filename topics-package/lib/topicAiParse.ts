// Pure, dependency-free parsing + coercion for the Topics AI pages.
//
// The deployed `moodverse-explain` edge function only returns free-form text, so
// the Discover / Evolve generators ask the model for strict JSON and parse it
// here. Kept free of RN/Supabase imports so it is unit-testable in isolation.

import type {
    DiscoverPayload,
    EvolvePayload,
    GoalHabitSuggestion,
    TopicArchetype,
} from './topicAiTypes';

/**
 * Tolerantly extract a JSON object from an LLM text response. Handles ```json
 * fences and trailing prose by scanning for the first balanced {...} block
 * (string-aware, so braces inside string values don't break the match).
 * Returns null when nothing parseable is found.
 */
export function parseJsonFromText(text?: string | null): any | null {
    if (!text) return null;
    let s = text.trim();

    const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) s = fenced[1].trim();

    try {
        return JSON.parse(s);
    } catch {
        // fall through to a balanced-brace scan
    }

    const start = s.indexOf('{');
    if (start === -1) return null;

    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < s.length; i++) {
        const ch = s[i];
        if (inStr) {
            if (esc) esc = false;
            else if (ch === '\\') esc = true;
            else if (ch === '"') inStr = false;
            continue;
        }
        if (ch === '"') inStr = true;
        else if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) {
                try {
                    return JSON.parse(s.slice(start, i + 1));
                } catch {
                    return null;
                }
            }
        }
    }
    return null;
}

// ── Coercion helpers — defensive against partial / loose AI output ───────

function asString(v: any): string {
    return typeof v === 'string' ? v.trim() : '';
}

function asStringArray(v: any, max: number): string[] {
    if (!Array.isArray(v)) return [];
    return v
        .filter((x) => typeof x === 'string')
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, max);
}

const ARCHETYPES: TopicArchetype[] = ['goal', 'creative', 'personal', 'learning', 'other'];

export function coerceDiscover(obj: any): DiscoverPayload | null {
    if (!obj || typeof obj !== 'object') return null;
    const payload: DiscoverPayload = {
        archetype: ARCHETYPES.includes(obj.archetype) ? obj.archetype : 'other',
        corePattern: asString(obj.corePattern),
        themes: asStringArray(obj.themes, 8),
        perspectives: asStringArray(obj.perspectives, 5),
        connections: asStringArray(obj.connections, 5),
    };
    if (
        !payload.corePattern &&
        !payload.themes.length &&
        !payload.perspectives.length &&
        !payload.connections.length
    ) {
        return null;
    }
    return payload;
}

export function coerceSuggestions(obj: any): GoalHabitSuggestion[] | null {
    const arr = obj && Array.isArray(obj.suggestions)
        ? obj.suggestions
        : Array.isArray(obj)
            ? obj
            : null;
    if (!arr) return null;
    const out: GoalHabitSuggestion[] = arr
        .filter((s: any) => s && typeof s === 'object' && asString(s.title))
        .map((s: any) => ({
            type: s.type === 'goal' ? 'goal' : 'habit',
            frequency: s.frequency === 'weekly' ? 'weekly' : 'daily',
            title: asString(s.title),
            note: asString(s.note) || undefined,
        }))
        .slice(0, 2);
    return out.length ? out : null;
}

export function coerceEvolve(obj: any): EvolvePayload | null {
    if (!obj || typeof obj !== 'object') return null;
    const j = obj.journey && typeof obj.journey === 'object' ? obj.journey : {};
    const journey = {
        started: asString(j.started),
        current: asString(j.current),
        emerging: asString(j.emerging),
    };
    const realizations: EvolvePayload['realizations'] = Array.isArray(obj.realizations)
        ? obj.realizations
              .filter((r: any) => r && typeof r === 'object' && asString(r.text))
              .map((r: any) => ({ date: asString(r.date), text: asString(r.text) }))
              .slice(0, 5)
        : [];
    const openThreads = asStringArray(obj.openThreads, 5);
    const suggestions = coerceSuggestions(obj) ?? [];
    if (
        !journey.started &&
        !journey.current &&
        !journey.emerging &&
        !realizations.length &&
        !openThreads.length &&
        !suggestions.length
    ) {
        return null;
    }
    return { journey, realizations, openThreads, suggestions };
}

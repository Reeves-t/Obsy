// Shared types for the Topics Focus Mode AI pages (Discover / Evolve).
//
// Kept dependency-free so both the persisted store (lib/topicStore.ts) and the
// AI client (services/topicChatClient.ts) can import these without creating an
// import cycle.

// ── Discover (page 2 — awareness/intelligence layer) ──────────────────────

/**
 * The kind of awareness space a topic represents. Inferred by the AI from the
 * topic's title, description and entries — used to adapt the Perspectives so we
 * never blindly generate tasks for a non-goal topic.
 */
export type TopicArchetype = 'goal' | 'creative' | 'personal' | 'learning' | 'other';

export interface DiscoverPayload {
    archetype: TopicArchetype;
    /** The single strongest observation about this topic. */
    corePattern: string;
    /** Recurring theme words/phrases, rendered as subtle pills. */
    themes: string[];
    /** Reflective prompts that adapt to the archetype (NOT always tasks). */
    perspectives: string[];
    /** Relationships between entries/ideas, and optionally other topics. */
    connections: string[];
}

// ── Evolve (page 3 — reflection into direction) ───────────────────────────

export interface TopicJourney {
    started: string;
    current: string;
    emerging: string;
}

export interface TopicRealization {
    /** Short human date label from the entry (e.g. "May 23"), or "" if unknown. */
    date: string;
    text: string;
}

export interface EvolvePayload {
    journey: TopicJourney;
    realizations: TopicRealization[];
    /** Unfinished thoughts / things mentioned but not explored (NOT always tasks). */
    openThreads: string[];
    /** AI-suggested daily habit / weekly goal seeds for the "grow" CTA. */
    suggestions: GoalHabitSuggestion[];
}

// ── Goal / Habit suggestions (Evolve CTA) ─────────────────────────────────

// Mirror the unions on NewHabitGoal in lib/habitGoalStore.ts (structurally
// identical, kept local to avoid coupling this dependency-free module to the
// habit/goal store).
export type GoalHabitType = 'habit' | 'goal';
export type GoalHabitFrequency = 'daily' | 'weekly';

export interface GoalHabitSuggestion {
    type: GoalHabitType;
    frequency: GoalHabitFrequency;
    title: string;
    note?: string;
}

// ── Persisted cache entry ─────────────────────────────────────────────────

export interface TopicAiCacheEntry<T> {
    data: T;
    /** ISO timestamp of when this was generated, for a "refreshed …" label. */
    generatedAt: string;
}

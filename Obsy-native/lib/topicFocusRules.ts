// Pure rules for the Topics Focus Mode, kept dependency-free for unit testing.

/**
 * The initial AI suggestion counts as generation 1. The inline "what to change"
 * input allows two further generations (edits); after the 3rd generation the
 * input is removed and only "Add" remains.
 */
export const MAX_GOAL_SUGGESTION_GENERATIONS = 3;

/** How many inline edits the user has left, given how many generations exist. */
export function goalSuggestionEditsRemaining(genCount: number): number {
    return Math.max(0, MAX_GOAL_SUGGESTION_GENERATIONS - genCount);
}

/** Whether the inline refine input should still be shown. */
export function canRefineGoalSuggestion(genCount: number): boolean {
    return goalSuggestionEditsRemaining(genCount) > 0;
}

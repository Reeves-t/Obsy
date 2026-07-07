import {
    MAX_GOAL_SUGGESTION_GENERATIONS,
    goalSuggestionEditsRemaining,
    canRefineGoalSuggestion,
} from '@/lib/topicFocusRules';

describe('goal/habit suggestion refine limit', () => {
    it('allows exactly two inline edits after the initial suggestion', () => {
        // genCount 1 = initial AI suggestion
        expect(goalSuggestionEditsRemaining(1)).toBe(2);
        expect(canRefineGoalSuggestion(1)).toBe(true);

        // after the 1st edit (generation 2)
        expect(goalSuggestionEditsRemaining(2)).toBe(1);
        expect(canRefineGoalSuggestion(2)).toBe(true);

        // after the 2nd edit (generation 3) -> input removed
        expect(goalSuggestionEditsRemaining(3)).toBe(0);
        expect(canRefineGoalSuggestion(3)).toBe(false);
    });

    it('never goes negative beyond the cap', () => {
        expect(goalSuggestionEditsRemaining(4)).toBe(0);
        expect(canRefineGoalSuggestion(99)).toBe(false);
    });

    it('caps total generations at 3', () => {
        expect(MAX_GOAL_SUGGESTION_GENERATIONS).toBe(3);
    });
});

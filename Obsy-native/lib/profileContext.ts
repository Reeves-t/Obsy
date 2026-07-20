export const PROFILE_CONTEXT_MAX_LENGTH = 600;

// Lighter than CUSTOM_TONE_RULES: only anti-roleplay/injection phrases.
// Self-description naturally includes "as a nurse", "you are", emoji, etc.,
// so those customTone bans are deliberately omitted.
export const PROFILE_CONTEXT_BANNED_PHRASES = [
    'act as',
    'pretend',
    'roleplay',
    'impersonate',
    'system prompt',
    'ignore previous',
    'ignore all',
    'disregard the above',
];

export interface ProfileContextValidation {
    valid: boolean;
    error?: string;
}

/** Empty text is valid — it means "clear the context". */
export function validateProfileContext(text: string): ProfileContextValidation {
    const trimmed = text.trim();
    if (!trimmed) return { valid: true };

    if (trimmed.length > PROFILE_CONTEXT_MAX_LENGTH) {
        return {
            valid: false,
            error: `Keep it under ${PROFILE_CONTEXT_MAX_LENGTH} characters.`,
        };
    }

    const lowered = trimmed.toLowerCase();
    const banned = PROFILE_CONTEXT_BANNED_PHRASES.find((phrase) => lowered.includes(phrase));
    if (banned) {
        return {
            valid: false,
            error: `"${banned}" isn't allowed — describe yourself, not instructions for the AI.`,
        };
    }

    return { valid: true };
}

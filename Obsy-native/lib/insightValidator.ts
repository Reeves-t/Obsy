/**
 * Post-generation validation layer for AI insights.
 * Ensures outputs comply with language constraints and don't leak mood labels.
 */

import { MOOD_LABELS } from './moodTransform';

/**
 * Banned words that should never appear in AI-generated insights.
 * These are the raw mood labels from the UI that we want to avoid echoing.
 */
const BANNED_WORDS = new Set(MOOD_LABELS.map(label => label.toLowerCase()));

/**
 * Additional therapy/advice words to flag (optional stricter mode).
 */
const THERAPY_WORDS = new Set([
    'healing', 'growth', 'journey', 'self-care', 'mindfulness',
    'you should', 'try to', 'remember to', 'make sure to',
    'be proud', 'keep going', 'you\'re doing great'
]);

export interface ValidationResult {
    isValid: boolean;
    violations: string[];
    sanitizedText?: string;
}

/**
 * Validate a single text string for mood label leakage.
 * Returns validation result with any violations found.
 */
export function validateInsightText(text: string): ValidationResult {
    const violations: string[] = [];
    const lowerText = text.toLowerCase();
    
    // Check for banned mood labels
    for (const word of BANNED_WORDS) {
        // Use word boundary matching to avoid false positives
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        if (regex.test(lowerText)) {
            violations.push(`Contains banned mood label: "${word}"`);
        }
    }
    
    return {
        isValid: violations.length === 0,
        violations
    };
}

/**
 * Validate insight text with stricter therapy word checking.
 */
export function validateInsightTextStrict(text: string): ValidationResult {
    const baseResult = validateInsightText(text);
    const lowerText = text.toLowerCase();
    
    // Check for therapy words
    for (const phrase of THERAPY_WORDS) {
        if (lowerText.includes(phrase)) {
            baseResult.violations.push(`Contains therapy language: "${phrase}"`);
        }
    }
    
    baseResult.isValid = baseResult.violations.length === 0;
    return baseResult;
}

/**
 * Validate an entire insight object (sentences array).
 */
export function validateInsightSentences(
    sentences: Array<{ text: string; highlight?: boolean }>
): ValidationResult {
    const allViolations: string[] = [];
    
    for (let i = 0; i < sentences.length; i++) {
        const result = validateInsightText(sentences[i].text);
        if (!result.isValid) {
            allViolations.push(
                ...result.violations.map(v => `Sentence ${i + 1}: ${v}`)
            );
        }
    }
    
    return {
        isValid: allViolations.length === 0,
        violations: allViolations
    };
}

/**
 * Validate mood_flow entries to ensure mood names are descriptive, not raw labels.
 */
export function validateMoodFlow(
    moodFlow: Array<{ mood: string; context?: string }>
): ValidationResult {
    const violations: string[] = [];
    
    for (let i = 0; i < moodFlow.length; i++) {
        const entry = moodFlow[i];
        const moodLower = entry.mood.toLowerCase();
        
        // Check if mood is a raw label (single word match)
        if (BANNED_WORDS.has(moodLower)) {
            violations.push(
                `mood_flow[${i}]: Uses raw mood label "${entry.mood}" instead of descriptive phrase`
            );
        }
        
        // Also validate context if present
        if (entry.context) {
            const contextResult = validateInsightText(entry.context);
            if (!contextResult.isValid) {
                violations.push(
                    ...contextResult.violations.map(v => `mood_flow[${i}].context: ${v}`)
                );
            }
        }
    }
    
    return {
        isValid: violations.length === 0,
        violations
    };
}

/**
 * Log validation warnings without blocking (for monitoring).
 */
export function logValidationWarnings(
    context: string,
    result: ValidationResult
): void {
    if (!result.isValid) {
        console.warn(`[insightValidator] ${context} has violations:`, result.violations);
    }
}


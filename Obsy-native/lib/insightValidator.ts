/**
 * Post-generation validation layer for AI insights.
 * Ensures outputs comply with language constraints and don't leak mood labels.
 */

import { getBannedMoodLabels } from './moodTransform';

/**
 * Banned words that should never appear in AI-generated insights.
 * These are the raw mood labels from the UI that we want to avoid echoing.
 */
const BANNED_WORDS = new Set(getBannedMoodLabels().map(label => label.toLowerCase()));

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

// ============================================
// DEFENSIVE PARSING UTILITIES
// ============================================

export interface ParseResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  rawText?: string;
}

/**
 * Strip markdown code fences from AI response
 */
export function stripMarkdownFences(text: string): string {
  return text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
}

/**
 * Normalize paragraph formatting in insight text
 */
export function normalizeParagraphs(text: string): string {
  return text
    .replace(/\n{3,}/g, '\n\n') // Collapse 3+ newlines to 2
    .replace(/([.!?])\s*\n\s*([A-Z])/g, '$1\n\n$2') // Add double newline between sentences starting new paragraphs
    .trim();
}

/**
 * Detect if a string appears to be JSON and log a warning
 * @param text - The text to check
 * @param context - Context for logging (e.g., 'daily', 'weekly')
 * @returns true if JSON detected, false otherwise
 */
export function detectAndLogJSON(text: string, context: string): boolean {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    console.warn(`[insightValidator] ${context}: Detected JSON response instead of plain text`);
    return true;
  }
  return false;
}

/**
 * Parse AI response with defensive error handling
 * Attempts to extract JSON from various formats
 * Supports both old schema (insight field) and new schema (narrative.text)
 */
export function parseInsightResponse<T = any>(
  rawResponse: string,
  expectedType: 'daily' | 'weekly' | 'monthly'
): ParseResult<T> {
  // Step 1: Strip markdown fences
  const cleaned = stripMarkdownFences(rawResponse);

  // Step 1.5: Detect and log if JSON is present
  detectAndLogJSON(cleaned, expectedType);

  // Step 2: Try direct JSON parse
  let parsed: any = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch (parseError) {
    // JSON parse failed, try fallback strategies
  }

  // Step 3: If direct parse failed, try to extract JSON from mixed content
  // Use a more robust approach: find first '{' and last '}'
  if (!parsed) {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const jsonCandidate = cleaned.substring(firstBrace, lastBrace + 1);
      try {
        parsed = JSON.parse(jsonCandidate);
        console.warn('[parseInsightResponse] Extracted JSON from mixed content');
      } catch {
        // Continue to fallback
      }
    }
  }

  // Step 4: If we have parsed JSON, normalize the schema
  if (parsed) {
    // Normalize narrative.text to insight for backward compatibility
    if (parsed.narrative?.text && !parsed.insight) {
      parsed.insight = normalizeParagraphs(parsed.narrative.text);
    }
    // Also normalize insight text if it exists
    if (parsed.insight && typeof parsed.insight === 'string') {
      parsed.insight = normalizeParagraphs(parsed.insight);
    }
    return { success: true, data: parsed as T };
  }

  // Step 5: Check if response is plain text (monthly insights)
  if (expectedType === 'monthly') {
    // Monthly insights return plain text, not JSON
    return {
      success: true,
      data: { insight: normalizeParagraphs(cleaned) } as T
    };
  }

  // Step 6: Fallback - treat as plain text insight
  console.warn('[parseInsightResponse] Failed to parse JSON, using raw text');
  return {
    success: true,
    data: { insight: normalizeParagraphs(cleaned) } as T,
    rawText: cleaned
  };
}

/**
 * Validate mood_flow segments have required fields and valid values
 */
export function validateMoodFlowSegments(
  segments: any[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!segments || segments.length === 0) {
    errors.push('mood_flow cannot be empty');
    return { valid: false, errors };
  }

  let totalPercentage = 0;
  const hexPattern = /^#[0-9A-Fa-f]{6}$/;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];

    if (!segment.mood || typeof segment.mood !== 'string') {
      errors.push(`mood_flow[${i}]: missing or invalid "mood" field`);
    }

    if (typeof segment.percentage !== 'number' || segment.percentage <= 0) {
      errors.push(`mood_flow[${i}]: missing or invalid "percentage" field (must be positive number)`);
    } else {
      totalPercentage += segment.percentage;
    }

    if (!segment.color || typeof segment.color !== 'string') {
      errors.push(`mood_flow[${i}]: missing or invalid "color" field`);
    } else if (!hexPattern.test(segment.color)) {
      errors.push(`mood_flow[${i}]: color must be valid hex format (#RRGGBB)`);
    }
  }

  // Allow ±1 tolerance for rounding
  if (Math.abs(totalPercentage - 100) > 1) {
    errors.push(`mood_flow percentages sum to ${totalPercentage}, must equal 100`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate mood_flow Reading format (new schema with title/subtitle/confidence)
 */
export function validateMoodFlowReading(
  moodFlow: any
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!moodFlow.title || typeof moodFlow.title !== 'string') {
    errors.push('mood_flow.title is required and must be a string');
  }
  if (!moodFlow.subtitle || typeof moodFlow.subtitle !== 'string') {
    errors.push('mood_flow.subtitle is required and must be a string');
  }
  if (typeof moodFlow.confidence !== 'number' || moodFlow.confidence < 0 || moodFlow.confidence > 100) {
    errors.push('mood_flow.confidence must be a number between 0 and 100');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate parsed insight response has required fields
 * Supports both old schema (insight, mood_flow array) and new schema (narrative.text, mood_flow object)
 */
export function validateParsedInsightResponse(
  parsed: any,
  type: 'daily' | 'weekly' | 'monthly'
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!parsed) {
    errors.push('Parsed response is null or undefined');
    return { valid: false, errors };
  }

  // All types require either 'insight' field OR 'narrative.text' field
  const hasInsight = parsed.insight && typeof parsed.insight === 'string';
  const hasNarrativeText = parsed.narrative?.text && typeof parsed.narrative.text === 'string';

  if (!hasInsight && !hasNarrativeText) {
    errors.push('Missing or invalid "insight" or "narrative.text" field');
  }

  // Daily insights have specific requirements
  if (type === 'daily') {
    if (parsed.vibe_tags && !Array.isArray(parsed.vibe_tags)) {
      errors.push('"vibe_tags" must be an array');
    }
    if (parsed.mood_colors && !Array.isArray(parsed.mood_colors)) {
      errors.push('"mood_colors" must be an array');
    }

    // mood_flow is REQUIRED for daily insights - can be array (old) or object (new)
    if (!parsed.mood_flow) {
      errors.push('Daily insights REQUIRE mood_flow');
    } else if (Array.isArray(parsed.mood_flow)) {
      // Old format - validate segments
      if (parsed.mood_flow.length === 0) {
        errors.push('mood_flow array cannot be empty');
      } else {
        const segmentValidation = validateMoodFlowSegments(parsed.mood_flow);
        if (!segmentValidation.valid) {
          errors.push(...segmentValidation.errors);
        }
      }
    } else if (typeof parsed.mood_flow === 'object') {
      // Reading format - validate title/subtitle/confidence
      const readingValidation = validateMoodFlowReading(parsed.mood_flow);
      if (!readingValidation.valid) {
        errors.push(...readingValidation.errors);
      }
    } else {
      errors.push('"mood_flow" must be an array or object');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Parse and validate insight response with comprehensive error handling
 */
export function parseAndValidateInsight<T>(
  rawResponse: string,
  type: 'daily' | 'weekly' | 'monthly'
): ParseResult<T> {
  const parseResult = parseInsightResponse<T>(rawResponse, type);

  if (!parseResult.success || !parseResult.data) {
    return parseResult;
  }

  const validation = validateParsedInsightResponse(parseResult.data, type);

  if (!validation.valid) {
    console.error('[parseAndValidateInsight] Validation errors:', validation.errors);
    return {
      success: false,
      error: `Validation failed: ${validation.errors.join(', ')}`,
      rawText: rawResponse
    };
  }

  return parseResult;
}

/**
 * Extract text content from a JSON string
 * Attempts to find narrative.text, text, insight, or output.text fields (in that order)
 * @param jsonString - The JSON string to extract text from
 * @returns The extracted text or null if extraction fails
 */

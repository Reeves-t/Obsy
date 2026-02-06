/**
 * Insight Adapters
 * 
 * Adapters for normalizing insight data structures to canonical schema.
 * 
 * Migration Note:
 * These adapters bridge current database schema (InsightHistory/DailyInsight) 
 * with canonical InsightResponse.narrative format defined in types/insights.ts.
 * 
 * Usage:
 * - extractInsightText(insight) - Get plain text from any insight type
 * - extractInsightSentences(insight) - Get structured sentences if available
 * - toCanonicalNarrative(insight, type) - Convert to canonical InsightNarrative format
 */

import { InsightHistory } from '@/services/insightHistory';
import { DailyInsight, InsightSentence } from '@/services/dailyInsights';
import { InsightNarrative } from '@/types/insights';

/**
 * Type guard to check if an object is an InsightHistory record.
 * 
 * @example
 * if (isInsightHistory(insight)) {
 *   console.log(insight.content);
 * }
 */
export function isInsightHistory(insight: any): insight is InsightHistory {
    return (
        insight !== null &&
        typeof insight === 'object' &&
        'type' in insight &&
        'start_date' in insight &&
        'end_date' in insight &&
        'content' in insight
    );
}

/**
 * Type guard to check if an object is a DailyInsight record.
 * 
 * @example
 * if (isDailyInsight(insight)) {
 *   console.log(insight.summary_text);
 * }
 */
export function isDailyInsight(insight: any): insight is DailyInsight {
    return (
        insight !== null &&
        typeof insight === 'object' &&
        'date' in insight &&
        'summary_text' in insight
    );
}

/**
 * Extract plain text from any insight type.
 * 
 * @param insight - InsightHistory, DailyInsight, or null
 * @returns The insight text content, or empty string if not available
 * 
 * @example
 * const text = extractInsightText(weeklyInsight);
 * // Returns insight.content for InsightHistory
 * // Returns insight.summary_text for DailyInsight
 */
export function extractInsightText(insight: InsightHistory | DailyInsight | null | undefined): string {
    if (!insight) return '';
    
    if (isInsightHistory(insight)) {
        return insight.content || '';
    }
    
    if (isDailyInsight(insight)) {
        return insight.summary_text || '';
    }
    
    return '';
}

/**
 * Extract structured sentences from any insight type.
 * 
 * @param insight - InsightHistory, DailyInsight, or null
 * @returns Array of InsightSentence objects, or undefined if not available
 * 
 * @example
 * const sentences = extractInsightSentences(todayInsight);
 * // Returns insight.mood_summary?.sentences for InsightHistory
 * // Returns insight.sentences for DailyInsight
 */
export function extractInsightSentences(
    insight: InsightHistory | DailyInsight | null | undefined
): InsightSentence[] | undefined {
    if (!insight) return undefined;
    
    if (isInsightHistory(insight)) {
        return insight.mood_summary?.sentences as InsightSentence[] | undefined;
    }
    
    if (isDailyInsight(insight)) {
        return insight.sentences;
    }
    
    return undefined;
}

/**
 * Convert any insight type to canonical InsightNarrative format.
 * 
 * @param insight - InsightHistory, DailyInsight, or null
 * @param type - The insight type for generating appropriate title
 * @returns InsightNarrative object with title, text, and optional bullets
 * 
 * @example
 * const narrative = toCanonicalNarrative(weeklyInsight, 'weekly');
 * // Returns { title: "Week in Review", text: "...", bullets: undefined }
 */
export function toCanonicalNarrative(
    insight: InsightHistory | DailyInsight | null | undefined,
    type: 'daily' | 'weekly' | 'monthly' = 'daily'
): InsightNarrative {
    const titleMap: Record<string, string> = {
        daily: 'Daily Insight',
        weekly: 'Week in Review',
        monthly: 'Monthly Reflection'
    };
    
    return {
        title: titleMap[type] || 'Insight',
        text: extractInsightText(insight),
        bullets: undefined // Reserved for future use
    };
}


/**
 * Centralized capture data access.
 *
 * This module is the single source of truth for retrieving and shaping capture
 * data across all insight pipelines (daily, weekly, monthly). It only
 * re-exports retrieval functions and shared types—no generation, parsing, or
 * mutation logic lives here. Keep this file limited to data access contracts to
 * prevent cross-contamination between insight pipelines.
 *
 * Contracts:
 * - Retrieval only: functions filter, sort, and enrich captures; they do not
 *   generate insights.
 * - Consistency: shared filtering and time-context enrichment logic is reused
 *   everywhere.
 * - Stability: downstream pipelines depend on these exports to avoid duplicate
 *   implementations.
 */

// -----------------------------------------------------------------------------
// Capture retrieval functions
// -----------------------------------------------------------------------------

/**
 * Returns enriched captures for a specific day, sorted chronologically.
 *
 * @param date Target day for the insight run.
 * @param captures Full capture collection to filter.
 * @returns Array of time-enriched captures for the given day (ascending by created_at).
 */
export { getCapturesForDaily } from '@/lib/insightTime';

/**
 * Returns enriched captures for a week range, sorted chronologically.
 *
 * @param weekStart Start of the week (typically Sunday) in the user's timezone.
 * @param captures Full capture collection to filter.
 * @param endDate Optional inclusive end date override.
 * @returns Array of time-enriched captures for the week (ascending by created_at).
 */
export { getCapturesForWeek } from '@/lib/insightTime';

/**
 * Returns captures for a month range, sorted chronologically.
 *
 * @param monthStart First day of the month in the user's timezone.
 * @param captures Full capture collection to filter.
 * @param endDate Optional inclusive end date override.
 * @returns Array of captures for the month (ascending by created_at).
 */
export { getCapturesForMonth } from '@/lib/insightTime';

// -----------------------------------------------------------------------------
// Shared types
// -----------------------------------------------------------------------------

/**
 * Capture enriched with time context fields used by insight pipelines.
 * Includes local time labels plus coarse (timeBucket) and fine-grained (dayPart)
 * classifications for time-of-day analysis.
 */
export type { EnrichedCapture } from '@/lib/insightTime';

/**
 * Coarse time-of-day grouping used for bucketing captures
 * (`'early' | 'midday' | 'late'`).
 */
export type { TimeBucket } from '@/lib/insightTime';

/**
 * Fine-grained day part classification used for narrative insights
 * (`'Late night' | 'Morning' | 'Midday' | 'Evening' | 'Night'`).
 */
export type { DayPart } from '@/lib/insightTime';

/**
 * Capture format expected by edge functions for AI insight generation.
 * Represents the sanitized, transport-safe subset of capture fields.
 */
export type { CaptureData } from '@/services/secureAI';

/**
 * Aggregated monthly signals sent to edge functions to inform month-level
 * insights (dominant moods, volatility, recent shifts, etc.).
 */
export type { MonthSignals } from '@/services/secureAI';

// -----------------------------------------------------------------------------
// Usage examples and architecture notes
// -----------------------------------------------------------------------------

/**
 * Usage Examples
 * --------------
 * Daily pipeline:
 * ```ts
 * import { getCapturesForDaily } from '@/lib/captureData';
 *
 * const captures = getCapturesForDaily(targetDate, allCaptures);
 * ```
 *
 * Weekly pipeline:
 * ```ts
 * import { getCapturesForWeek } from '@/lib/captureData';
 *
 * const captures = getCapturesForWeek(weekStart, allCaptures);
 * ```
 *
 * Monthly pipeline:
 * ```ts
 * import { getCapturesForMonth } from '@/lib/captureData';
 *
 * const captures = getCapturesForMonth(monthStart, allCaptures);
 * ```
 *
 * Architecture Notes
 * ------------------
 * - Shared access point: All insight pipelines import capture retrieval from
 *   here to ensure consistent filtering and sorting.
 * - Separation of concerns: No generation, parsing, or storage logic belongs in
 *   this module—only retrieval contracts.
 * - Forward compatibility: Future phases will migrate stores and pipelines to
 *   depend on these exports, preventing duplicate implementations and
 *   cross-pipeline drift.
 */

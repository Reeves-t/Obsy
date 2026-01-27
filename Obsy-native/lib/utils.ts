import { startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";

/**
 * DATE UTILITIES - CONSISTENT TIMEZONE HANDLING
 * ==============================================
 * 
 * This module provides consistent date handling across the application.
 * All date keys are computed in the user's local timezone to ensure:
 * 
 * - Challenge entries, challenge insights, and daily insights align on the same calendar day
 * - Weekly and monthly ranges use consistent week start conventions
 * - No misalignment around local midnight in non-UTC timezones
 * 
 * CONVENTIONS:
 * - Weeks start on Sunday (weekStartsOn: 0) and end on Saturday
 * - All date keys are in YYYY-MM-DD format
 * - Date ranges use local timezone, not UTC
 */

/**
 * The canonical week start for the application.
 * Sunday = 0, Monday = 1, etc.
 */
export const WEEK_STARTS_ON = 0; // Sunday

/**
 * Gets the local calendar day key (YYYY-MM-DD) for a given date.
 * Uses local timezone to ensure consistency across the app.
 * 
 * @param date - The date to get the key for (defaults to now)
 * @returns The date key in YYYY-MM-DD format
 */
export function getLocalDayKey(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Gets the week range (start and end dates) for a given date.
 * Uses the canonical WEEK_STARTS_ON convention (Sunday to Saturday).
 * 
 * @param date - Any date within the desired week
 * @returns Object with start and end Date objects for the week
 */
export function getWeekRangeForUser(date: Date = new Date()): { start: Date; end: Date } {
    return {
        start: startOfWeek(date, { weekStartsOn: WEEK_STARTS_ON }),
        end: endOfWeek(date, { weekStartsOn: WEEK_STARTS_ON })
    };
}

/**
 * Gets the month range (start and end dates) for a given date.
 * 
 * @param date - Any date within the desired month
 * @returns Object with start and end Date objects for the month
 */
export function getMonthRangeForUser(date: Date = new Date()): { start: Date; end: Date } {
    return {
        start: startOfMonth(date),
        end: endOfMonth(date)
    };
}

/**
 * Gets today's date key in the user's local timezone.
 * Convenience wrapper around getLocalDayKey().
 * 
 * @returns Today's date key in YYYY-MM-DD format
 */
export function getTodayKey(): string {
    return getLocalDayKey(new Date());
}

/**
 * Converts a Date object to a date key string (YYYY-MM-DD).
 * Alias for getLocalDayKey for semantic clarity.
 * 
 * @param date - The date to convert
 * @returns The date key in YYYY-MM-DD format
 */
export function dateToKey(date: Date): string {
    return getLocalDayKey(date);
}

/**
 * Parses a date key string (YYYY-MM-DD) to a Date object.
 * Returns a date at noon local time to avoid timezone edge cases.
 * 
 * @param dateKey - The date key in YYYY-MM-DD format
 * @returns A Date object set to noon on that day
 */
export function keyToDate(dateKey: string): Date {
    return new Date(`${dateKey}T12:00:00`);
}

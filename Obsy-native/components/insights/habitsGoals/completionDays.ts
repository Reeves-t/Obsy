import { startOfWeek, addDays, subWeeks, format } from 'date-fns';
import { WEEK_STARTS_ON } from '@/lib/dateUtils';

// Derive the 7-dot completion strips shown on detail rows, re-using the same
// period-key format the store writes (yyyy-MM-dd for days, "W:"+weekStart for
// weeks). Kept as pure helpers so they can be memoised per render.

export const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

// Daily items: has each day of the *current* week (Sun..Sat) been completed?
export function currentWeekDayStates(history: string[]): boolean[] {
    const set = new Set(history);
    const weekStart = startOfWeek(new Date(), { weekStartsOn: WEEK_STARTS_ON });
    return Array.from({ length: 7 }, (_, i) => set.has(format(addDays(weekStart, i), 'yyyy-MM-dd')));
}

// Weekly items have no per-day data — degrade to the last 7 weeks
// (oldest → current), each true if that week was completed.
export function lastSevenWeekStates(history: string[]): boolean[] {
    const set = new Set(history);
    const now = new Date();
    return Array.from({ length: 7 }, (_, i) => {
        const weekStart = startOfWeek(subWeeks(now, 6 - i), { weekStartsOn: WEEK_STARTS_ON });
        return set.has(`W:${format(weekStart, 'yyyy-MM-dd')}`);
    });
}

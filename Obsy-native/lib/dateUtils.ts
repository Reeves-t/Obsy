import { endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";

export const WEEK_STARTS_ON = 0;

export function getWeekRangeForUser(date: Date): { start: Date; end: Date } {
    const start = startOfWeek(date, { weekStartsOn: WEEK_STARTS_ON });
    const end = endOfWeek(date, { weekStartsOn: WEEK_STARTS_ON });
    return { start, end };
}

export function getTodayKey(): string {
    return format(new Date(), "yyyy-MM-dd");
}

export function getLocalDayKey(date: Date): string {
    return format(date, "yyyy-MM-dd");
}

export function getMonthRange(date: Date): { start: Date; end: Date } {
    const start = startOfMonth(date);
    const end = endOfMonth(date);
    return { start, end };
}

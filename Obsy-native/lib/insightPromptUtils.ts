import { CaptureForInsight, DaySummaryForInsight, WeekSummaryForInsight, MonthSummaryForInsight } from './insightTime';
import { transformMoodToNaturalLanguage } from './moodTransform';

/**
 * Builds a timeline block from captures for AI prompts.
 * Uses mood transformation to prevent label leakage - the AI sees
 * descriptive prose like "a quiet sense of appreciation" instead
 * of raw mood labels like "grateful".
 */
export function buildCaptureTimelineBlock(captures: CaptureForInsight[]): string {
    if (captures.length === 0) return "No captures found.";

    return captures
        .map((c, index) => `
[${index + 1}] Time: ${c.localTimeLabel} (${c.timeBucket})
Feeling: ${transformMoodToNaturalLanguage(c.mood)}
Journal: ${c.journalSnippet ?? 'none'}
Tags: ${c.tags?.join(', ') || 'none'}
`)
        .join('\n');
}

export function buildDayTimelineBlock(days: DaySummaryForInsight[]): string {
    if (days.length === 0) return "No days found.";

    return days
        .map((day, index) => {
            const feelingDescriptions = day.primaryMoods
                .map(m => transformMoodToNaturalLanguage(m))
                .join('; ');
            return `
Day [${index + 1}] ${day.dateLabel} (${day.weekdayLabel})
Primary feelings: ${feelingDescriptions || 'none'}
Captures (earliest → latest):
${buildCaptureTimelineBlock(day.captures)}
`;
        })
        .join('\n');
}

export function buildWeekTimelineBlock(week: WeekSummaryForInsight): string {
    return `
Week: ${week.weekLabel}
Days in this week are listed in chronological order (earliest → latest):
${buildDayTimelineBlock(week.days)}
`;
}

export function buildMonthTimelineBlock(month: MonthSummaryForInsight): string {
    return `
Month: ${month.monthLabel}
Days in this month are listed in chronological order (earliest → latest):
${buildDayTimelineBlock(month.days)}
`;
}

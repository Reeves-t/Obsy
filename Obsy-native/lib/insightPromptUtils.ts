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
        .map((c, index) => {
            const entryType = c.entry_type ?? 'capture';
            const typeLabel = {
                capture: 'Capture (photo moment)',
                journal: 'Journal (written reflection)',
                voice: 'Mic (spoken reflection)',
                shared_link: `Shared Link (external content the user saved)`,
                mood_checkin: 'Mood check-in (quick emotional note)',
            }[entryType] ?? entryType;

            const linkMeta = entryType === 'shared_link'
                ? `\nPlatform: ${c.shared_link_platform ?? 'Web'}\nLink title: ${c.shared_link_title ?? 'unknown'}`
                : '';

            return `
[${index + 1}] Time: ${c.localTimeLabel} (${c.dayPart})
Entry type: ${typeLabel}${linkMeta}
Feeling: ${transformMoodToNaturalLanguage(c.mood)}
Journal: ${c.journalSnippet ?? 'none'}
Tags: ${c.tags?.join(', ') || 'none'}
`;
        })
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

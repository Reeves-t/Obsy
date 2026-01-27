import { AiToneId, getToneDefinition } from './aiTone';
import { LANGUAGE_CONSTRAINTS } from './insightPrompts';

/**
 * Journal-specific constraints to ensure insights are derived solely from written text,
 * with no references to photos, images, or visual content.
 */
export const JOURNAL_SPECIFIC_CONSTRAINTS = `
JOURNAL-SPECIFIC RULES (NON-NEGOTIABLE):
1. Treat all text as pure written thought. Never infer, imagine, or reconstruct visual scenes.
2. If a journal entry mentions "I saw X" or "I took a photo of Y", focus on the feeling or thought, not the visual.
3. Never reference photos, images, captures, scenes, objects, environments, or any visual content.
4. Do not describe what something "looked like" - describe how the writer felt or thought.
5. Output plain text only - no JSON, no structured format, no highlights.
6. No quoting journal entries verbatim - paraphrase understanding.
7. Focus on: emotional posture, tension, clarity, restlessness, calm, thought patterns.
`;

// --- Journal Entry Input Types ---

export interface JournalEntryForInsight {
    time: string; // Local time label e.g., "9:32 AM"
    mood: string;
    text: string;
}

export interface JournalDayForInsight {
    date: string; // e.g., "Monday, Jan 15"
    entries: JournalEntryForInsight[];
}

export interface JournalWeekForInsight {
    weekLabel: string; // e.g., "Jan 8 - Jan 14"
    days: JournalDayForInsight[];
}

export interface JournalMonthForInsight {
    monthLabel: string; // e.g., "January 2025"
    weeks: JournalWeekForInsight[];
}

// --- Daily Journal Insight ---

export interface JournalDailyInsightContext {
    dateLabel: string;
    entries: JournalEntryForInsight[];
    aiToneId: AiToneId;
}

export function buildJournalDailyPrompt(ctx: JournalDailyInsightContext): string {
    const tone = getToneDefinition(ctx.aiToneId);

    const entriesBlock = ctx.entries.map(entry => {
        return '[' + entry.time + '] Mood: ' + entry.mood + '\n' + entry.text;
    }).join('\n\n');

    const lines = [
        'You are generating a reflective insight from the user\'s journal entries for this day.',
        'This is a TEXT-ONLY insight. You are reading written thoughts, not looking at photos.',
        '',
        'PURPOSE:',
        'Generate a reflective insight that captures the emotional arc of the day based solely on written journal entries.',
        '',
        'TONE STYLE:',
        'The user has chosen the "' + tone.label + '" tone.',
        'Follow these style instructions strictly:',
        tone.styleGuidelines,
        LANGUAGE_CONSTRAINTS,
        JOURNAL_SPECIFIC_CONSTRAINTS,
        '',
        'CONTENT GUIDELINES:',
        '- Surface the emotional posture of the day: tension, release, restlessness, clarity, calm.',
        '- Identify thought patterns: what the writer kept returning to, what felt unresolved.',
        '- Paraphrase understanding - do NOT quote journal text directly.',
        '- Keep it grounded in what was written, not what you imagine happened visually.',
        '',
        'LENGTH: Write exactly 3-5 sentences. No more, no less.',
        '',
        'OUTPUT FORMAT: Plain text only. No JSON. No formatting. No highlights.',
        '',
        'DATE: ' + ctx.dateLabel,
        '',
        'JOURNAL ENTRIES:',
        entriesBlock,
        '',
        'Now write the journal insight as plain text.',
    ];

    return lines.join('\n');
}

// --- Weekly Journal Insight ---

export interface JournalWeeklyInsightContext {
    weekLabel: string;
    days: JournalDayForInsight[];
    aiToneId: AiToneId;
}

export function buildJournalWeeklyPrompt(ctx: JournalWeeklyInsightContext): string {
    const tone = getToneDefinition(ctx.aiToneId);

    const daysBlock = ctx.days.map(day => {
        const entriesText = day.entries.map(e => {
            return '  [' + e.time + '] ' + e.mood + ': ' + e.text;
        }).join('\n');
        return day.date + ':\n' + entriesText;
    }).join('\n\n');

    const lines = [
        'You are generating a reflective insight from the user\'s journal entries across this week.',
        'This is a TEXT-ONLY insight. You are reading written thoughts, not looking at photos.',
        '',
        'PURPOSE:',
        'Identify patterns and emotional shifts across multiple days of journal writing.',
        '',
        'TONE STYLE:',
        'The user has chosen the "' + tone.label + '" tone.',
        'Follow these style instructions strictly:',
        tone.styleGuidelines,
        LANGUAGE_CONSTRAINTS,
        JOURNAL_SPECIFIC_CONSTRAINTS,
        '',
        'CONTENT GUIDELINES:',
        '- Identify repeated themes across days.',
        '- Note shifts in emotional language from early to late in the week.',
        '- Describe consistency vs fluctuation in thought patterns.',
        '- Avoid day-by-day breakdowns or timeline recaps.',
        '- Synthesize, don\'t summarize.',
        '',
        'LENGTH: Write exactly 4-6 sentences. No more, no less.',
        '',
        'OUTPUT FORMAT: Plain text only. No JSON. No formatting. No highlights.',
        '',
        'WEEK: ' + ctx.weekLabel,
        '',
        'JOURNAL ENTRIES BY DAY:',
        daysBlock,
        '',
        'Now write the weekly journal insight as plain text.',
    ];

    return lines.join('\n');
}

// --- Monthly Journal Insight ---

export interface JournalMonthlyInsightContext {
    monthLabel: string;
    weeks: JournalWeekForInsight[];
    totalEntryCount: number;
    aiToneId: AiToneId;
}

export function buildJournalMonthlyPrompt(ctx: JournalMonthlyInsightContext): string {
    const tone = getToneDefinition(ctx.aiToneId);

    const weeksBlock = ctx.weeks.map(week => {
        const daysText = week.days.map(day => {
            const snippets = day.entries.map(e => {
                const moodText = e.mood;
                const entryText = e.text.substring(0, 100);
                return '    ' + moodText + ': ' + entryText + '...';
            }).join('\n');
            return '  ' + day.date + ':\n' + snippets;
        }).join('\n');
        return week.weekLabel + ':\n' + daysText;
    }).join('\n\n');

    const lines = [
        'You are generating a reflective monthly insight from the user\'s journal entries across this month.',
        'This is a TEXT-ONLY insight. You are reading written thoughts, not looking at photos.',
        '',
        'PURPOSE:',
        'Reflect on the narrative arc of written thought across an entire month.',
        'Surface direction, accumulation, resolution, and emotional momentum.',
        '',
        'TONE STYLE:',
        'The user has chosen the "' + tone.label + '" tone.',
        'Follow these style instructions strictly:',
        tone.styleGuidelines,
        LANGUAGE_CONSTRAINTS,
        JOURNAL_SPECIFIC_CONSTRAINTS,
        '',
        'CONTENT GUIDELINES:',
        '- This is the most abstract level of journal insight.',
        '- Focus on: direction (where thoughts moved), accumulation (what built up), resolution (what found closure).',
        '- Identify emotional momentum: did the month feel like forward motion, stagnation, or cycles?',
        '- Ground abstraction in specific patterns you observed in the writing.',
        '- Do NOT summarize week by week. Synthesize the whole.',
        '',
        'LENGTH: Write exactly 5-8 sentences. No more, no less.',
        '',
        'OUTPUT FORMAT: Plain text only. No JSON. No formatting. No highlights.',
        '',
        'MONTH: ' + ctx.monthLabel,
        'TOTAL ENTRIES: ' + ctx.totalEntryCount,
        '',
        'JOURNAL ENTRIES BY WEEK:',
        weeksBlock,
        '',
        'Now write the monthly journal insight as plain text.',
    ];

    return lines.join('\n');
}

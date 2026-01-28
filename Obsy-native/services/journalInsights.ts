import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachWeekOfInterval } from 'date-fns';
import { Capture } from '@/lib/captureStore';
import { AiSettings, callGemini } from './ai';
import { archiveInsight } from './archive';
import {
    buildJournalDailyPrompt,
    buildJournalWeeklyPrompt,
    buildJournalMonthlyPrompt,
    JournalEntryForInsight,
    JournalDayForInsight,
    JournalWeekForInsight,
    JournalDailyInsightContext,
    JournalWeeklyInsightContext,
    JournalMonthlyInsightContext,
} from '@/lib/journalInsightPrompts';
import { transformMoodToNaturalLanguage } from '@/lib/moodTransform';

/**
 * Filter captures to only those with journal notes
 */
export function getJournalEntries(captures: Capture[]): Capture[] {
    return captures.filter(c => c.note && c.note.trim().length > 0);
}

/**
 * Convert a capture to a journal entry for insight generation
 */
function captureToJournalEntry(capture: Capture): JournalEntryForInsight {
    const date = new Date(capture.created_at);
    const timeLabel = format(date, 'h:mm a');
    // Transform mood to natural language to prevent label leakage
    const moodDesc = transformMoodToNaturalLanguage(capture.mood);

    return {
        time: timeLabel,
        mood: moodDesc,
        text: capture.note || '',
    };
}

/**
 * Group journal entries by date
 */
function groupEntriesByDate(entries: Capture[]): Record<string, Capture[]> {
    const grouped: Record<string, Capture[]> = {};

    entries.forEach(entry => {
        const dateKey = format(new Date(entry.created_at), 'yyyy-MM-dd');
        if (!grouped[dateKey]) {
            grouped[dateKey] = [];
        }
        grouped[dateKey].push(entry);
    });

    // Sort entries within each day by time
    Object.keys(grouped).forEach(dateKey => {
        grouped[dateKey].sort((a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
    });

    return grouped;
}

/**
 * Generate a daily journal insight
 */
export async function generateJournalDailyInsight(
    userId: string,
    date: Date,
    captures: Capture[],
    settings: AiSettings
): Promise<string | null> {
    const dateKey = format(date, 'yyyy-MM-dd');
    const dateLabel = format(date, 'EEEE, MMMM d');

    // Filter journal entries for this specific date
    const journalEntries = getJournalEntries(captures).filter(c => {
        const entryDate = format(new Date(c.created_at), 'yyyy-MM-dd');
        return entryDate === dateKey;
    });

    if (journalEntries.length === 0) {
        return null;
    }

    // Convert to insight format
    const entries = journalEntries.map(captureToJournalEntry);

    const ctx: JournalDailyInsightContext = {
        dateLabel,
        entries,
        aiToneId: settings.tone,
    };

    const prompt = buildJournalDailyPrompt(ctx);
    const insight = await callGemini([{ text: prompt }]);

    // Archive the insight
    await archiveInsight({
        userId,
        type: 'journal_daily',
        insightText: insight,
        relatedCaptureIds: journalEntries.map(c => c.id),
        date,
        tone: settings.tone,
    });

    return insight;
}

/**
 * Generate a weekly journal insight
 */
export async function generateJournalWeeklyInsight(
    userId: string,
    date: Date,
    captures: Capture[],
    settings: AiSettings
): Promise<string | null> {
    const weekStart = startOfWeek(date, { weekStartsOn: 0 });
    const weekEnd = endOfWeek(date, { weekStartsOn: 0 });
    const weekLabel = `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d')}`;

    // Filter journal entries for this week
    const journalEntries = getJournalEntries(captures).filter(c => {
        const entryDate = new Date(c.created_at);
        return entryDate >= weekStart && entryDate <= weekEnd;
    });

    // Group by date
    const groupedByDate = groupEntriesByDate(journalEntries);
    const daysWithEntries = Object.keys(groupedByDate).sort();

    // Need at least 2 days with entries for a meaningful weekly insight
    if (daysWithEntries.length < 2) {
        return null;
    }

    // Build days array
    const days: JournalDayForInsight[] = daysWithEntries.map(dateKey => {
        const dateObj = new Date(dateKey);
        return {
            date: format(dateObj, 'EEEE, MMM d'),
            entries: groupedByDate[dateKey].map(captureToJournalEntry),
        };
    });

    const ctx: JournalWeeklyInsightContext = {
        weekLabel,
        days,
        aiToneId: settings.tone,
    };

    const prompt = buildJournalWeeklyPrompt(ctx);
    const insight = await callGemini([{ text: prompt }]);

    // Archive the insight
    await archiveInsight({
        userId,
        type: 'journal_weekly',
        insightText: insight,
        relatedCaptureIds: journalEntries.map(c => c.id),
        date,
        tone: settings.tone,
    });

    return insight;
}

/**
 * Generate a monthly journal insight
 */
export async function generateJournalMonthlyInsight(
    userId: string,
    date: Date,
    captures: Capture[],
    settings: AiSettings
): Promise<string | null> {
    const monthStart = startOfMonth(date);
    const monthEnd = endOfMonth(date);
    const monthLabel = format(date, 'MMMM yyyy');

    // Filter journal entries for this month
    const journalEntries = getJournalEntries(captures).filter(c => {
        const entryDate = new Date(c.created_at);
        return entryDate >= monthStart && entryDate <= monthEnd;
    });

    // Need at least 5 journal entries for a meaningful monthly insight
    if (journalEntries.length < 5) {
        return null;
    }

    // Group by week
    const weekStarts = eachWeekOfInterval({ start: monthStart, end: monthEnd }, { weekStartsOn: 0 });
    const groupedByDate = groupEntriesByDate(journalEntries);

    const weeks: JournalWeekForInsight[] = weekStarts.map(weekStartDate => {
        const weekEndDate = endOfWeek(weekStartDate, { weekStartsOn: 0 });
        const weekLabel = `${format(weekStartDate, 'MMM d')} - ${format(weekEndDate, 'MMM d')}`;

        // Get all days in this week that have entries
        const daysInWeek: JournalDayForInsight[] = [];
        Object.keys(groupedByDate).sort().forEach(dateKey => {
            const entryDate = new Date(dateKey);
            if (entryDate >= weekStartDate && entryDate <= weekEndDate) {
                daysInWeek.push({
                    date: format(entryDate, 'EEEE, MMM d'),
                    entries: groupedByDate[dateKey].map(captureToJournalEntry),
                });
            }
        });

        return {
            weekLabel,
            days: daysInWeek,
        };
    }).filter(week => week.days.length > 0);

    if (weeks.length === 0) {
        return null;
    }

    const ctx: JournalMonthlyInsightContext = {
        monthLabel,
        weeks,
        totalEntryCount: journalEntries.length,
        aiToneId: settings.tone,
    };

    const prompt = buildJournalMonthlyPrompt(ctx);
    const insight = await callGemini([{ text: prompt }]);

    // Archive the insight
    await archiveInsight({
        userId,
        type: 'journal_monthly',
        insightText: insight,
        relatedCaptureIds: journalEntries.map(c => c.id),
        date,
        tone: settings.tone,
    });

    return insight;
}

/**
 * Fetch cached journal insight from archive
 */
export async function fetchCachedJournalInsight(
    userId: string,
    type: 'journal_daily' | 'journal_weekly' | 'journal_monthly',
    dateScope: string
): Promise<string | null> {
    const { supabase } = await import('@/lib/supabase');

    const { data, error } = await supabase
        .from('insights_archive')
        .select('body')
        .eq('user_id', userId)
        .eq('type', type)
        .eq('date_scope', dateScope)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (error || !data) {
        return null;
    }

    return data.body;
}

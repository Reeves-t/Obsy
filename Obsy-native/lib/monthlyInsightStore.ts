import { create } from 'zustand';

/** Handles stored content that may be raw JSON (from old buggy writes) or plain text. */
function parseMonthlyContent(content: string | null | undefined): string | null {
    if (!content) return null;
    if (!content.startsWith('{')) return content;

    // Try JSON.parse first
    try {
        const parsed = JSON.parse(content);
        const text = parsed?.narrative?.text
            ?? (typeof parsed?.narrative === 'string' ? parsed.narrative : null)
            ?? parsed?.text;
        if (text) return text;
    } catch {
        // JSON.parse failed — likely literal newlines or unescaped chars in stored content
    }

    // Regex fallback: extract "text":"..." from nested {"narrative":{"text":"..."}}
    const nestedMatch = content.match(/"text"\s*:\s*"((?:[^"\\]|\\[\s\S])*)"/);
    if (nestedMatch?.[1]) {
        return nestedMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
    }

    // Regex fallback: extract flat {"narrative":"..."}
    const flatMatch = content.match(/"narrative"\s*:\s*"((?:[^"\\]|\\[\s\S])*)"/);
    if (flatMatch?.[1]) {
        return flatMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
    }

    return content;
}
import { Capture } from '@/types/capture';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { callMonthly } from '@/services/monthlyInsightClient';
import { getCapturesForMonth } from '@/lib/captureData';
import { getMonthSignals } from '@/services/monthlySummaries';
import { formatMonthKey } from '@/lib/dailyMoodFlows';
import { fetchInsightHistory, fetchMostRecentMonthlyInsight, upsertInsightHistory } from '@/services/insightHistory';
import { areAllMoodOnlyEntries, buildMoodOnlyInsight } from '@/lib/moodOnlyInsights';

interface MonthlyInsightState {
    status: 'idle' | 'loading' | 'success' | 'error';
    text: string | null;
    error: {
        stage: string;
        message: string;
        requestId?: string;
    } | null;
    lastUpdated: Date | null;
    requestId: string | null;
    currentMonth: Date;
    hasLoadedSnapshot: boolean;
    /** AI-generated month phrase from edge function (e.g. "Restless Clarity") */
    aiMonthPhrase: string | null;
    /** AI-generated reasoning for the month phrase */
    aiMonthReasoning: string | null;

    // Actions
    setMonthlyInsight: (text: string | null, month: Date) => void;
    setCurrentMonth: (month: Date) => void;
    loadSnapshot: (userId: string) => Promise<void>;
    refreshMonthlyInsight: (
        userId: string,
        tone: string,
        customTonePrompt: string | undefined,
        allCaptures: Capture[],
        targetMonth: Date,
        force?: boolean
    ) => Promise<void>;
    clearError: () => void;
    computePending: (captures: Capture[]) => void;
}

export const useMonthlyInsight = create<MonthlyInsightState>((set, get) => ({
    status: 'idle',
    text: null,
    error: null,
    lastUpdated: null,
    requestId: null,
    currentMonth: new Date(),
    hasLoadedSnapshot: false,
    aiMonthPhrase: null,
    aiMonthReasoning: null,

    setMonthlyInsight: (text, month) => {
        set({
            status: 'success',
            text,
            currentMonth: month,
            error: null,
            lastUpdated: new Date(),
        });
    },

    setCurrentMonth: (month: Date) => {
        set({ currentMonth: month });
    },

    loadSnapshot: async (userId: string) => {
        if (get().hasLoadedSnapshot || get().text) return;

        try {
            const now = new Date();
            const ms = startOfMonth(now);
            const me = endOfMonth(now);

            // Try this month's insight first
            const thisMonth = await fetchInsightHistory(userId, 'monthly', ms, me);
            if (thisMonth) {
                set({
                    text: parseMonthlyContent(thisMonth.content),
                    status: 'success',
                    currentMonth: ms,
                    hasLoadedSnapshot: true,
                    lastUpdated: new Date(thisMonth.updated_at),
                });
                return;
            }

            // Fall back to most recent monthly insight
            const recent = await fetchMostRecentMonthlyInsight(userId);
            if (recent) {
                set({
                    text: parseMonthlyContent(recent.content),
                    status: 'success',
                    currentMonth: new Date(recent.start_date),
                    hasLoadedSnapshot: true,
                    lastUpdated: new Date(recent.updated_at),
                });
            } else {
                set({ hasLoadedSnapshot: true });
            }
        } catch (error) {
            console.error("[useMonthlyInsight] loadSnapshot failed:", error);
            set({ hasLoadedSnapshot: true });
        }
    },

    refreshMonthlyInsight: async (userId, tone, customTonePrompt, allCaptures, targetMonth, force = false) => {
        if (get().status === 'loading') return;

        set({ status: 'loading', error: null });

        try {
            const monthStart = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1);
            const isCurrentMonth =
                targetMonth.getFullYear() === new Date().getFullYear() &&
                targetMonth.getMonth() === new Date().getMonth();
            const throughDate = isCurrentMonth
                ? new Date()
                : new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0);
            const dayOfMonth = throughDate.getDate();

            const monthCaptures = getCapturesForMonth(monthStart, allCaptures, throughDate);

            const signals = getMonthSignals(
                allCaptures,
                formatMonthKey(targetMonth),
                throughDate.toISOString()
            );
            const aiSignals = {
                dominantMood: signals.dominantMood,
                runnerUpMood: signals.runnerUpMood ?? undefined,
                activeDays: signals.activeDays,
                volatilityScore: signals.volatilityScore,
                last7DaysShift: signals.last7DaysShift,
            };

            const eligible = dayOfMonth >= 8;
            if (!eligible && !force) {
                set({
                    status: 'idle',
                    text: null,
                    requestId: null,
                    lastUpdated: new Date(),
                    currentMonth: targetMonth,
                });
                return;
            }

            if (!monthCaptures.length && !force) {
                set({
                    status: 'idle',
                    text: null,
                    requestId: null,
                    lastUpdated: new Date(),
                    currentMonth: targetMonth,
                });
                return;
            }

            if (monthCaptures.length > 0 && areAllMoodOnlyEntries(monthCaptures)) {
                const simpleInsight = buildMoodOnlyInsight('monthly', monthCaptures);
                set({
                    status: 'success',
                    text: simpleInsight,
                    requestId: null,
                    lastUpdated: new Date(),
                    currentMonth: targetMonth,
                    error: null,
                    aiMonthPhrase: null,
                    aiMonthReasoning: null,
                });

                const monthEnd = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0);
                try {
                    await upsertInsightHistory(
                        userId,
                        'monthly',
                        monthStart,
                        monthEnd,
                        simpleInsight,
                        undefined,
                        monthCaptures.map((capture) => capture.id)
                    );
                } catch (e) {
                    console.warn('[MonthlyInsight] Failed to persist mood-only insight:', e);
                }

                return;
            }

            const monthLabel = format(targetMonth, 'MMMM yyyy');

            const response = await callMonthly(monthLabel, aiSignals, tone, customTonePrompt, monthStart.toISOString());

            if (response.ok && response.text) {
                const narrativeText = parseMonthlyContent(response.text) ?? response.text;
                set({
                    status: 'success',
                    text: narrativeText,
                    requestId: response.requestId || null,
                    lastUpdated: new Date(),
                    currentMonth: targetMonth,
                    error: null,
                    aiMonthPhrase: response.monthPhrase || null,
                    aiMonthReasoning: response.aiReasoning || null,
                });

                // Persist to insight_history for fast-load on next app start
                const monthEnd = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0);
                try {
                    await upsertInsightHistory(
                        userId, 'monthly', monthStart, monthEnd,
                        narrativeText, undefined,
                        monthCaptures.map(c => c.id)
                    );
                } catch (e) {
                    console.warn('[MonthlyInsight] Failed to persist to insight_history:', e);
                }

                return;
            }

            if (response.error) {
                set({
                    status: 'error',
                    error: {
                        stage: response.error.stage,
                        message: response.error.message,
                        requestId: response.requestId,
                    },
                    requestId: response.requestId || null,
                    currentMonth: targetMonth,
                    lastUpdated: new Date(),
                });
                return;
            }

            set({
                status: 'error',
                error: {
                    stage: 'parse',
                    message: 'Unexpected response shape',
                },
                requestId: response.requestId || null,
                currentMonth: targetMonth,
                lastUpdated: new Date(),
            });
        } catch (error: any) {
            set({
                status: 'error',
                error: {
                    stage: 'unknown',
                    message: error?.message || 'Unexpected error',
                },
                requestId: null,
                currentMonth: targetMonth,
                lastUpdated: new Date(),
            });
        }
    },

    clearError: () => set({ error: null }),

    // Legacy compatibility: pending computation no-op
    computePending: () => undefined,
}));

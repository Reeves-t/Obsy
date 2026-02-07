import { create } from 'zustand';
import { Capture } from '@/types/capture';
import { format } from 'date-fns';
import { callMonthly } from '@/services/monthlyInsightClient';
import { getCapturesForMonth, MonthSignals } from '@/lib/captureData';
import { getMonthSignals } from '@/services/monthlySummaries';
import { formatMonthKey } from '@/lib/dailyMoodFlows';

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

    // Actions
    setMonthlyInsight: (text: string | null, month: Date) => void;
    setCurrentMonth: (month: Date) => void;
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

    refreshMonthlyInsight: async (_userId, tone, customTonePrompt, allCaptures, targetMonth, force = false) => {
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

            const signals: MonthSignals = getMonthSignals(
                allCaptures,
                formatMonthKey(targetMonth),
                throughDate.toISOString()
            );

            const eligible = dayOfMonth >= 7 && signals.activeDays >= 7;
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

            const monthLabel = format(targetMonth, 'MMMM yyyy');

            const response = await callMonthly(monthLabel, signals, tone, customTonePrompt, monthStart.toISOString());

            if (response.ok && response.text) {
                set({
                    status: 'success',
                    text: response.text,
                    requestId: response.requestId || null,
                    lastUpdated: new Date(),
                    currentMonth: targetMonth,
                    error: null,
                });
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

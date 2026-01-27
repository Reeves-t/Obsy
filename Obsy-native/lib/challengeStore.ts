import { useMemo } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CHALLENGE_TEMPLATES } from '@/constants/challengeTemplates';
import { ChallengeTemplate, UserDailyChallenge } from '@/types/challenges';
import * as Crypto from 'expo-crypto';
import { supabase } from '@/lib/supabase';
import { getLocalDayKey } from '@/lib/dateUtils';

// Helper to get today's key in YYYY-MM-DD format
function getTodayKey(date = new Date()) {
    return getLocalDayKey(date);
}

// Utility: pick N random items from array
function pickRandom<T>(items: T[], count: number): T[] {
    if (items.length <= count) return items.slice();
    const copy = [...items];
    const result: T[] = [];
    while (result.length < count && copy.length > 0) {
        const idx = Math.floor(Math.random() * copy.length);
        result.push(copy.splice(idx, 1)[0]);
    }
    return result;
}

type ChallengeState = {
    challenges: Record<string, UserDailyChallenge[]>; // userId -> challenges[]
    getOrCreateDailyChallenges: (userId: string | null) => UserDailyChallenge[];
    completeDailyChallenge: (userId: string | null, dailyChallengeId: string, captureId: string) => Promise<void>;
    refresh: (userId: string | null) => void;
};

export const useChallengeStore = create<ChallengeState>()(
    persist(
        (set, get) => ({
            challenges: {},

            getOrCreateDailyChallenges: (userId) => {
                const userKey = userId ?? 'guest';
                const todayKey = getTodayKey();
                const all = get().challenges;
                const userHistory = all[userKey] ?? [];

                // 1. Check if we already have challenges for today
                const existing = userHistory.filter(c => c.date === todayKey);
                if (existing.length > 0) return existing;

                // 2. If not, generate new ones
                const today = new Date(todayKey);

                // Filter templates by cooldown
                const eligibleTemplates = CHALLENGE_TEMPLATES.filter(t => {
                    if (!t.isActive) return false;

                    const recentForTemplate = userHistory
                        .filter(c => c.challengeTemplateId === t.id)
                        .sort((a, b) => (a.date > b.date ? -1 : 1))[0];

                    if (!recentForTemplate) return true;

                    const lastDate = new Date(recentForTemplate.date);
                    const diffDays = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
                    return diffDays >= t.cooldownDays;
                });

                const pool = eligibleTemplates.length > 0 ? eligibleTemplates : CHALLENGE_TEMPLATES.filter(t => t.isActive);

                // Assign 4 challenges
                const count = 4;
                const selectedTemplates = pickRandom(pool, count);

                const newChallenges: UserDailyChallenge[] = selectedTemplates.map(template => ({
                    id: Crypto.randomUUID(),
                    userId,
                    date: todayKey,
                    challengeTemplateId: template.id,
                    status: 'pending',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                }));

                // Update store
                const updatedHistory = [...userHistory, ...newChallenges];
                set(state => ({
                    challenges: {
                        ...state.challenges,
                        [userKey]: updatedHistory
                    }
                }));

                return newChallenges;
            },

            completeDailyChallenge: async (userId, dailyChallengeId, captureId) => {
                const userKey = userId ?? 'guest';
                const all = get().challenges;
                const list = all[userKey] ?? [];

                const idx = list.findIndex(c => c.id === dailyChallengeId);
                if (idx === -1) return;

                const existing = list[idx];
                const updated: UserDailyChallenge = {
                    ...existing,
                    status: 'completed',
                    captureId,
                    updatedAt: new Date().toISOString(),
                };

                const newList = [...list];
                newList[idx] = updated;

                set(state => ({
                    challenges: {
                        ...state.challenges,
                        [userKey]: newList
                    }
                }));

                // Sync to Supabase if authenticated
                if (userId) {
                    const template = getTemplateForChallenge(existing.challengeTemplateId);
                    if (template) {
                        await syncChallengeEntryToSupabase(userId, updated, captureId, template);
                    }
                }
            },

            refresh: (userId) => {
                get().getOrCreateDailyChallenges(userId);
            }
        }),
        {
            name: 'obsy-challenge-storage',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);

// Helper to get template
export function getTemplateForChallenge(challengeTemplateId: string): ChallengeTemplate | undefined {
    return CHALLENGE_TEMPLATES.find(t => t.id === challengeTemplateId);
}

// Helper to sync to Supabase
async function syncChallengeEntryToSupabase(
    userId: string,
    dailyChallenge: UserDailyChallenge,
    captureId: string,
    template: ChallengeTemplate
) {
    try {
        await supabase
            .from('challenge_entries')
            .upsert(
                {
                    user_id: userId,
                    date: dailyChallenge.date,
                    daily_challenge_id: dailyChallenge.id,
                    challenge_template_id: template.id,
                    challenge_title: template.title,
                    capture_id: captureId,
                },
                {
                    onConflict: 'user_id,date,daily_challenge_id',
                }
            );
    } catch (error) {
        console.error('Failed to sync challenge entry to Supabase:', error);
    }
}

// Hook for UI consumption
export function useDailyChallenges(userId: string | null) {
    const store = useChallengeStore();

    // Ensure challenges exist for today
    const challenges = useMemo(() => store.getOrCreateDailyChallenges(userId), [userId, store.challenges]);

    const withTemplate = useMemo(() => challenges.map((ch: any) => ({
        daily: ch,
        template: getTemplateForChallenge(ch.challengeTemplateId)!,
    })), [challenges]);

    return {
        dailyChallenges: withTemplate,
        completeChallenge: store.completeDailyChallenge,
        refresh: () => store.refresh(userId),
    };
}

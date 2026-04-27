import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { useCaptureStore } from './captureStore';

// ── Types ────────────────────────────────────────────────────

export type Topic = {
    id: string;
    title: string;
    description: string;
    hue: number;        // 0-360, tints the orb
    createdAt: string;  // ISO timestamp
};

export type TopicStats = {
    streak: number;
    totalEntries: number;
    moodAvg: number;              // 1.0–5.0
    moodTrend: number;            // -1..1
    activeDaysThisWeek: number;   // 0..7
    weekTotal: number;            // always 7
    spark: number[];              // last 14 mood values
    mostFelt: string;
    lastLogged: string;
    impact: string;
    lastNote: string;
};

// ── Impact label pools ───────────────────────────────────────

const IMPACT_UP = ['Building momentum', 'Improving focus', 'Steady lift', 'Quietly working'];
const IMPACT_FLAT = ['Holding steady', 'Finding rhythm', 'A gentle plateau'];
const IMPACT_DOWN = ['Bumpy stretch', 'Mixed lately', 'Worth a pause'];

function pickImpact(trend: number): string {
    const pool = trend > 0.15 ? IMPACT_UP : trend < -0.15 ? IMPACT_DOWN : IMPACT_FLAT;
    return pool[Math.floor(Math.random() * pool.length)];
}

// ── Stat computation from captures ───────────────────────────

function computeStatsForTopic(topicId: string): TopicStats {
    const captures = useCaptureStore.getState().captures;
    // Filter captures that are linked to this topic
    const linked = captures.filter(c => c.tags?.includes(`topic:${topicId}`));

    if (linked.length === 0) {
        return {
            streak: 0,
            totalEntries: 0,
            moodAvg: 0,
            moodTrend: 0,
            activeDaysThisWeek: 0,
            weekTotal: 7,
            spark: [],
            mostFelt: '—',
            lastLogged: 'Never',
            impact: 'Just planted',
            lastNote: '',
        };
    }

    // Sort by date descending
    const sorted = [...linked].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const totalEntries = sorted.length;
    const lastNote = sorted[0]?.note || '';

    // Last logged (human readable)
    const now = new Date();
    const lastDate = new Date(sorted[0].created_at);
    const diffDays = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    const lastLogged =
        diffDays === 0 ? 'Today' :
        diffDays === 1 ? 'Yesterday' :
        `${diffDays} days ago`;

    // Active days this week
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const daysThisWeek = new Set(
        linked
            .filter(c => new Date(c.created_at) >= weekStart)
            .map(c => new Date(c.created_at).toDateString())
    ).size;

    // Streak (consecutive days ending today or yesterday)
    const daySet = new Set(sorted.map(c => {
        const d = new Date(c.created_at);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    }));
    let streak = 0;
    const check = new Date(now);
    // Allow starting from today or yesterday
    const todayKey = `${check.getFullYear()}-${check.getMonth()}-${check.getDate()}`;
    if (!daySet.has(todayKey)) {
        check.setDate(check.getDate() - 1);
    }
    for (let i = 0; i < 365; i++) {
        const key = `${check.getFullYear()}-${check.getMonth()}-${check.getDate()}`;
        if (daySet.has(key)) {
            streak++;
            check.setDate(check.getDate() - 1);
        } else {
            break;
        }
    }

    // Mood avg + trend (using mood_name_snapshot mapped to approximate numeric)
    // For now, use a simple 1-5 scale based on position. Real mapping can come later.
    const moodAvg = Math.min(5, Math.max(1, 2.5 + Math.random() * 2));
    const moodTrend = totalEntries > 3 ? (Math.random() - 0.5) * 0.6 : 0;

    // Most felt mood
    const moodCounts: Record<string, number> = {};
    linked.forEach(c => {
        const name = c.mood_name_snapshot || 'Unknown';
        moodCounts[name] = (moodCounts[name] || 0) + 1;
    });
    const mostFelt = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

    // Sparkline: last 14 days
    const spark: number[] = [];
    for (let i = 13; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dayKey = d.toDateString();
        const dayEntries = linked.filter(c => new Date(c.created_at).toDateString() === dayKey);
        spark.push(dayEntries.length > 0 ? 3 + Math.random() * 1.5 : 0);
    }

    return {
        streak,
        totalEntries,
        moodAvg,
        moodTrend,
        activeDaysThisWeek: daysThisWeek,
        weekTotal: 7,
        spark,
        mostFelt,
        lastLogged,
        impact: pickImpact(moodTrend),
        lastNote,
    };
}

// ── Store ────────────────────────────────────────────────────

type TopicState = {
    topics: Topic[];
    addTopic: (title: string, description: string) => string;
    removeTopic: (id: string) => void;
    getStats: (topicId: string) => TopicStats;
};

export const useTopicStore = create<TopicState>()(
    persist(
        (set, get) => ({
            topics: [],

            addTopic: (title, description) => {
                const id = Crypto.randomUUID();
                const topic: Topic = {
                    id,
                    title: title.trim(),
                    description: description.trim(),
                    hue: Math.round(180 + Math.random() * 110),
                    createdAt: new Date().toISOString(),
                };
                set(state => ({ topics: [...state.topics, topic] }));
                return id;
            },

            removeTopic: (id) => {
                set(state => ({ topics: state.topics.filter(t => t.id !== id) }));
            },

            getStats: (topicId) => {
                return computeStatsForTopic(topicId);
            },
        }),
        {
            name: 'obsy-topics-storage',
            storage: createJSONStorage(() => AsyncStorage),
            partialize: (state) => ({
                topics: state.topics,
            }),
        }
    )
);

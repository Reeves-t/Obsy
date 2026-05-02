import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { useCaptureStore } from './captureStore';
import { getMoodTheme } from './moods';
import { MoodSegment } from './dailyMoodFlows';

// ── Types ────────────────────────────────────────────────────

export type Topic = {
    id: string;
    title: string;
    description: string;
    hue: number;        // 0-360, tints the orb
    createdAt: string;  // ISO timestamp
    toneId?: string;    // preset AiToneId or custom tone UUID
};

export type TopicStats = {
    streak: number;
    totalEntries: number;
    moodAvg: number;              // 1.0–10.0
    moodTrend: number;            // -1..1
    activeDaysThisWeek: number;   // 0..7
    weekTotal: number;            // always 7
    spark: number[];              // last 14 daily mood averages (0 = no data)
    moodSegments: MoodSegment[];  // for topic mood flow bar
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

// ── Mood scoring (1–10 valence scale) ────────────────────────

const MOOD_SCORES: Record<string, number> = {
    joyful: 9, enthusiastic: 8.5, inspired: 8.5, confident: 8.5,
    hopeful: 8, grateful: 8, playful: 7.5, creative: 7.5,
    productive: 7.5, social: 7, peaceful: 7.5, calm: 7,
    relaxed: 7, safe: 7, focused: 7, curious: 7,
    tender: 6.5, hyped: 7, busy: 5,
    neutral: 5, reflective: 5.5, unbothered: 5.5, nostalgic: 5,
    restless: 4.5, scattered: 4, awkward: 4, tired: 4,
    bored: 4, melancholy: 4, annoyed: 3.5, lonely: 3.5,
    stressed: 3, anxious: 3, pressured: 3, drained: 3, numb: 3,
    overwhelmed: 2.5, depressed: 2.5, angry: 2.5, manic: 3.5,
};

function getMoodScore(moodName: string): number {
    return MOOD_SCORES[(moodName || '').toLowerCase().trim()] ?? 5;
}

// ── Mood segment computation ──────────────────────────────────

function computeMoodSegments(linked: any[]): MoodSegment[] {
    if (!linked.length) return [];

    const moodCounts: Record<string, number> = {};
    const moodSnapshots: Record<string, string> = {};

    linked.forEach(c => {
        const moodId = c.mood_id || 'neutral';
        moodCounts[moodId] = (moodCounts[moodId] || 0) + 1;
        if (c.mood_name_snapshot) moodSnapshots[moodId] = c.mood_name_snapshot;
    });

    const total = linked.length;

    return Object.entries(moodCounts)
        .map(([moodId, count]) => {
            const theme = getMoodTheme(moodId);
            return {
                mood: moodSnapshots[moodId] || moodId,
                percentage: (count / total) * 100,
                color: theme.solid,
                moodId,
                gradientFrom: theme.gradient.primary,
                gradientMid: theme.gradient.mid,
                gradientTo: theme.gradient.secondary,
            };
        })
        .sort((a, b) => b.percentage - a.percentage);
}

// ── Stat computation from captures ───────────────────────────

function computeStatsForTopic(topicId: string): TopicStats {
    const captures = useCaptureStore.getState().captures;
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
            moodSegments: [],
            mostFelt: '—',
            lastLogged: 'Never',
            impact: 'Just planted',
            lastNote: '',
        };
    }

    const sorted = [...linked].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const totalEntries = sorted.length;
    const lastNote = sorted[0]?.note || '';

    // Last logged
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

    // Streak
    const daySet = new Set(sorted.map(c => {
        const d = new Date(c.created_at);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    }));
    let streak = 0;
    const check = new Date(now);
    const todayKey = `${check.getFullYear()}-${check.getMonth()}-${check.getDate()}`;
    if (!daySet.has(todayKey)) check.setDate(check.getDate() - 1);
    for (let i = 0; i < 365; i++) {
        const key = `${check.getFullYear()}-${check.getMonth()}-${check.getDate()}`;
        if (daySet.has(key)) { streak++; check.setDate(check.getDate() - 1); }
        else break;
    }

    // Mood avg (real, 1-10 scale)
    const moodAvg = linked.reduce((sum, c) => sum + getMoodScore(c.mood_name_snapshot || ''), 0) / linked.length;

    // Mood trend: compare recent half vs older half
    const half = Math.max(1, Math.ceil(sorted.length / 2));
    const recentEntries = sorted.slice(0, half);
    const olderEntries = sorted.slice(half);
    const recentAvg = recentEntries.reduce((sum, c) => sum + getMoodScore(c.mood_name_snapshot || ''), 0) / recentEntries.length;
    const olderAvg = olderEntries.length > 0
        ? olderEntries.reduce((sum, c) => sum + getMoodScore(c.mood_name_snapshot || ''), 0) / olderEntries.length
        : recentAvg;
    const moodTrend = Math.max(-1, Math.min(1, (recentAvg - olderAvg) / 4));

    // Most felt
    const moodCounts: Record<string, number> = {};
    linked.forEach(c => {
        const name = c.mood_name_snapshot || 'Unknown';
        moodCounts[name] = (moodCounts[name] || 0) + 1;
    });
    const mostFelt = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

    // Sparkline: last 14 days with real mood averages
    const spark: number[] = [];
    for (let i = 13; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dayKey = d.toDateString();
        const dayEntries = linked.filter(c => new Date(c.created_at).toDateString() === dayKey);
        if (dayEntries.length > 0) {
            const avg = dayEntries.reduce((sum, c) => sum + getMoodScore(c.mood_name_snapshot || ''), 0) / dayEntries.length;
            spark.push(avg);
        } else {
            spark.push(0);
        }
    }

    // Mood segments for mood flow bar
    const moodSegments = computeMoodSegments(linked);

    return {
        streak,
        totalEntries,
        moodAvg,
        moodTrend,
        activeDaysThisWeek: daysThisWeek,
        weekTotal: 7,
        spark,
        moodSegments,
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
    updateTopicTone: (topicId: string, toneId: string) => void;
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

            updateTopicTone: (topicId, toneId) => {
                set(state => ({
                    topics: state.topics.map(t =>
                        t.id === topicId ? { ...t, toneId } : t
                    ),
                }));
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

import { getMoodLabel } from '@/lib/moodUtils';

// Define the types the UI expects
export interface DailyInsightSnapshot {
    date: string;
    mood?: string;
    summary?: string;
    [key: string]: any;
}

export interface WeeklyStats {
    topMood: string | null;
    totalCaptures: number;
    activeDays: number;
    avgPerActiveDay: number;
    dominantMood: string | null;
    objectOfWeek: string | null;
}

// Type for capture input when computing stats from live captures
export interface CaptureForStats {
    created_at: string;
    mood?: string;
    mood_id?: string;
    mood_name_snapshot?: string;
    [key: string]: any;
}

/**
 * Compute weekly stats directly from live captures.
 * Used as a fallback when no daily archives exist yet.
 */
export const buildWeeklyStatsFromCaptures = (
    captures: CaptureForStats[],
    weekStart: Date,
    weekEnd: Date
): WeeklyStats => {
    // Filter captures to the current week
    const weekCaptures = captures.filter(c => {
        const date = new Date(c.created_at);
        return date >= weekStart && date <= weekEnd;
    });

    if (weekCaptures.length === 0) {
        return {
            topMood: null,
            totalCaptures: 0,
            activeDays: 0,
            avgPerActiveDay: 0,
            dominantMood: null,
            objectOfWeek: null,
        };
    }

    const totalCaptures = weekCaptures.length;

    // Count unique active days
    const uniqueDays = new Set(weekCaptures.map(c => c.created_at.split('T')[0]));
    const activeDays = uniqueDays.size;

    // Calculate average per active day
    const avgPerActiveDay = activeDays > 0
        ? Math.round((totalCaptures / activeDays) * 10) / 10
        : 0;

    // Mood clustering (same logic as buildWeeklyStatsFromDaily)
    const clusters: Record<string, string[]> = {
        Soft: ['reflective', 'tender', 'calm', 'peaceful', 'grateful', 'safe', 'relaxed', 'hopeful', 'nostalgic'],
        Attentive: ['neutral', 'observant', 'focused', 'curious', 'unbothered', 'creative', 'inspired', 'confident'],
        Isolated: ['lonely', 'heavy', 'withdrawn', 'melancholy', 'depressed', 'numb', 'tired', 'drained', 'bored'],
        Activated: ['energized', 'productive', 'driven', 'joyful', 'social', 'enthusiastic', 'hyped', 'manic', 'playful'],
        Diffuse: ['scattered', 'busy', 'restless', 'anxious', 'stressed', 'overwhelmed', 'annoyed', 'awkward', 'angry', 'pressured']
    };

    const clusterPoints: Record<string, number> = {
        Soft: 0, Attentive: 0, Isolated: 0, Activated: 0, Diffuse: 0
    };

    const rawMoodCounts: Record<string, number> = {};

    weekCaptures.forEach((c, index) => {
        const weight = 1 + (index / weekCaptures.length) * 0.2;
        // Keep mood_id for cluster matching (clusters use IDs)
        const moodId = (c.mood_id || 'neutral').toLowerCase();

        // Validate snapshot: if it looks like a raw ID (e.g., "custom_abc123"), resolve it
        const snapshot = c.mood_name_snapshot;
        const isValidSnapshot = snapshot && !snapshot.startsWith('custom_') && snapshot !== c.mood_id;
        const moodLabel = (isValidSnapshot ? snapshot : getMoodLabel(c.mood_id || 'neutral', snapshot)).toLowerCase();
        rawMoodCounts[moodLabel] = (rawMoodCounts[moodLabel] || 0) + 1;

        let foundCluster = false;
        for (const [clusterName, moods] of Object.entries(clusters)) {
            if (moods.includes(moodId)) {
                clusterPoints[clusterName] += weight;
                foundCluster = true;
                break;
            }
        }
        if (!foundCluster) {
            clusterPoints['Attentive'] += weight * 0.5;
        }
    });

    const sortedClusters = Object.entries(clusterPoints).sort(([, a], [, b]) => b - a);
    const primaryCluster = sortedClusters[0][0];
    const secondaryCluster = sortedClusters[1][0];
    const primaryPoints = sortedClusters[0][1];
    const secondaryPoints = sortedClusters[1][1];

    let finalDominantMood = primaryCluster;
    if (primaryPoints > 0) {
        const ratio = secondaryPoints / primaryPoints;
        const isClose = ratio > 0.6;

        if (primaryCluster === 'Activated') {
            finalDominantMood = isClose && secondaryCluster === 'Attentive' ? 'Quietly Driven' : 'Measured Momentum';
        } else if (primaryCluster === 'Soft') {
            finalDominantMood = isClose && secondaryCluster === 'Attentive' ? 'Soft but Focused' : 'Quietly Content';
        } else if (primaryCluster === 'Isolated') {
            finalDominantMood = isClose && secondaryCluster === 'Soft' ? 'Observant Recovery' : 'Internally Heavy';
        } else if (primaryCluster === 'Attentive') {
            finalDominantMood = isClose && secondaryCluster === 'Soft' ? 'Measured Calm' : 'Steady Focus';
        } else if (primaryCluster === 'Diffuse') {
            finalDominantMood = isClose && secondaryCluster === 'Activated' ? 'Restless Energy' : 'High Density';
        }
    }

    const topMoodId = Object.entries(rawMoodCounts).sort(([, a], [, b]) => b - a)[0]?.[0] || null;

    return {
        topMood: topMoodId,
        totalCaptures,
        activeDays,
        avgPerActiveDay,
        dominantMood: finalDominantMood,
        objectOfWeek: null, // Not available from live captures
    };
};


export const buildWeeklyStatsFromDaily = (days?: DailyInsightSnapshot[]): WeeklyStats => {
    if (!days || days.length === 0) {
        return {
            topMood: null,
            totalCaptures: 0,
            activeDays: 0,
            avgPerActiveDay: 0,
            dominantMood: null,
            objectOfWeek: null,
        };
    }

    // 1. Calculate total captures
    const totalCaptures = days.reduce((sum, day) => sum + (day.totalCaptures || 0), 0);

    // 2. Count active days (days with at least 1 capture)
    const activeDays = days.filter(d => (d.totalCaptures || 0) > 0).length;

    // 3. Calculate average per active day
    const avgPerActiveDay = activeDays > 0
        ? Math.round((totalCaptures / activeDays) * 10) / 10
        : 0;

    // 4. Semantic Mood Clustering & Weighting
    // ---
    // Clusters mapping
    const clusters: Record<string, string[]> = {
        Soft: ['reflective', 'tender', 'calm', 'peaceful', 'grateful', 'safe', 'relaxed', 'hopeful', 'nostalgic'],
        Attentive: ['neutral', 'observant', 'focused', 'curious', 'unbothered', 'creative', 'inspired', 'confident'],
        Isolated: ['lonely', 'heavy', 'withdrawn', 'melancholy', 'depressed', 'numb', 'tired', 'drained', 'bored'],
        Activated: ['energized', 'productive', 'driven', 'joyful', 'social', 'enthusiastic', 'hyped', 'manic', 'playful'],
        Diffuse: ['scattered', 'busy', 'restless', 'anxious', 'stressed', 'overwhelmed', 'annoyed', 'awkward', 'angry', 'pressured']
    };

    const clusterPoints: Record<string, number> = {
        Soft: 0,
        Attentive: 0,
        Isolated: 0,
        Activated: 0,
        Diffuse: 0
    };

    const rawMoodCounts: Record<string, number> = {};

    days.forEach((day, index) => {
        // Weight by recency: later days matter slightly more (up to 1.2x)
        const weight = 1 + (index / days.length) * 0.2;

        const processMood = (mood: string, count: number = 1) => {
            const m = mood.toLowerCase();
            rawMoodCounts[m] = (rawMoodCounts[m] || 0) + count;

            // Find cluster
            let foundCluster = false;
            for (const [clusterName, moods] of Object.entries(clusters)) {
                if (moods.includes(m)) {
                    clusterPoints[clusterName] += count * weight;
                    foundCluster = true;
                    break;
                }
            }
            // Fallback for unknown moods
            if (!foundCluster) {
                clusterPoints['Attentive'] += count * weight * 0.5; // Neutral default
            }
        };

        if (day.moods) {
            Object.entries(day.moods).forEach(([mood, count]) => {
                processMood(mood, count as number);
            });
        }
        if (day.dominantMood) {
            processMood(day.dominantMood, 1);
        }
    });

    // Determine clusters
    const sortedClusters = Object.entries(clusterPoints)
        .sort(([, a], [, b]) => b - a);

    const primaryCluster = sortedClusters[0][0];
    const secondaryCluster = sortedClusters[1][0];
    const primaryPoints = sortedClusters[0][1];
    const secondaryPoints = sortedClusters[1][1];

    // Generate Composed Label
    let finalDominantMood = primaryCluster;

    // Rule-based composition
    if (primaryPoints > 0) {
        const ratio = secondaryPoints / primaryPoints;
        const isClose = ratio > 0.6;

        if (primaryCluster === 'Activated') {
            finalDominantMood = isClose && secondaryCluster === 'Attentive' ? 'Quietly Driven' : 'Measured Momentum';
        } else if (primaryCluster === 'Soft') {
            finalDominantMood = isClose && secondaryCluster === 'Attentive' ? 'Soft but Focused' : 'Quietly Content';
        } else if (primaryCluster === 'Isolated') {
            finalDominantMood = isClose && secondaryCluster === 'Soft' ? 'Observant Recovery' : 'Internally Heavy';
        } else if (primaryCluster === 'Attentive') {
            finalDominantMood = isClose && secondaryCluster === 'Soft' ? 'Measured Calm' : 'Steady Focus';
        } else if (primaryCluster === 'Diffuse') {
            finalDominantMood = isClose && secondaryCluster === 'Activated' ? 'Restless Energy' : 'High Density';
        }
    }

    // Top raw mood for legacy or internal use
    const topMood = Object.entries(rawMoodCounts)
        .sort(([, a], [, b]) => b - a)[0]?.[0] || null;

    // 5. Find object of the week
    const objectCounts: Record<string, number> = {};
    days.forEach(day => {
        if (day.objects) {
            Object.entries(day.objects).forEach(([obj, count]) => {
                objectCounts[obj] = (objectCounts[obj] || 0) + (count as number);
            });
        }
        if (day.mainObject) {
            objectCounts[day.mainObject] = (objectCounts[day.mainObject] || 0) + 1;
        }
    });

    const objectOfWeek = Object.entries(objectCounts)
        .sort(([, a], [, b]) => b - a)[0]?.[0] || null;

    return {
        topMood,
        totalCaptures,
        activeDays,
        avgPerActiveDay,
        dominantMood: finalDominantMood,
        objectOfWeek,
    };
};

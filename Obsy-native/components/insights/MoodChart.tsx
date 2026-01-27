import React, { useMemo, memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/ui/ThemedText';
import Colors from '@/constants/Colors';
import { Capture } from '@/types/capture';
import { MOODS, MoodId } from '@/constants/Moods';
import { resolveMoodColorById, getMoodLabel } from '@/lib/moodUtils';
import { startOfWeek } from 'date-fns';
import { WEEK_STARTS_ON } from '@/lib/dateUtils';

interface MoodChartProps {
    captures: Capture[];
    timeframe: 'week' | 'month';
}

export const MoodChart = memo(function MoodChart({ captures, timeframe }: MoodChartProps) {
    const chartData = useMemo(() => {
        const now = new Date();
        let cutoff: Date;
        if (timeframe === 'week') {
            cutoff = startOfWeek(now, { weekStartsOn: WEEK_STARTS_ON });
        } else {
            cutoff = new Date();
            cutoff.setDate(now.getDate() - 30);
        }

        const filteredCaptures = captures.filter(c => new Date(c.created_at) >= cutoff);

        const moodCounts: Record<string, number> = {};
        const moodSnapshots: Record<string, string> = {};
        let total = 0;

        filteredCaptures.forEach(c => {
            if (c.mood_id) {
                moodCounts[c.mood_id] = (moodCounts[c.mood_id] || 0) + 1;
                if (c.mood_name_snapshot) {
                    moodSnapshots[c.mood_id] = c.mood_name_snapshot;
                }
                total++;
            }
        });

        const sortedMoods = Object.entries(moodCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5) // Top 5 moods
            .map(([moodId, count]) => {
                const label = moodSnapshots[moodId] || getMoodLabel(moodId);
                return {
                    id: moodId,
                    label,
                    color: resolveMoodColorById(moodId, label),
                    count,
                    percentage: total > 0 ? (count / total) * 100 : 0
                };
            });

        return sortedMoods;
    }, [captures, timeframe]);

    if (chartData.length === 0) {
        return (
            <View style={styles.emptyContainer}>
                <ThemedText style={styles.emptyText}>No mood data for this period</ThemedText>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {chartData.map((item) => (
                <View key={item.id} style={styles.row}>
                    <View style={styles.labelContainer}>
                        <ThemedText style={styles.label} numberOfLines={1}>{item.label}</ThemedText>
                    </View>
                    <View style={styles.barWrapper}>
                        <View style={styles.barContainer}>
                            <View
                                style={[
                                    styles.bar,
                                    { width: `${item.percentage}%`, backgroundColor: item.color }
                                ]}
                            />
                        </View>
                        <ThemedText style={styles.countText}>{item.count} captures</ThemedText>
                    </View>
                    <View style={styles.valueContainer}>
                        <ThemedText style={styles.value}>{Math.round(item.percentage)}%</ThemedText>
                    </View>
                </View>
            ))}
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        gap: 16,
        paddingVertical: 12,
    },
    emptyContainer: {
        padding: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyText: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 14,
        fontStyle: 'italic',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    labelContainer: {
        width: 80,
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.85)',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    barWrapper: {
        flex: 1,
        gap: 4,
    },
    barContainer: {
        height: 6,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 3,
        overflow: 'hidden',
    },
    bar: {
        height: '100%',
        borderRadius: 3,
    },
    countText: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.3)',
        fontWeight: '500',
    },
    valueContainer: {
        width: 45,
        alignItems: 'flex-end',
    },
    value: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.7)',
        fontFamily: 'SpaceMono',
        fontWeight: '700',
    },
});

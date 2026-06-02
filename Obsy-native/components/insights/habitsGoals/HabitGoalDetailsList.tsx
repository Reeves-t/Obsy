import React from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { useTopicStore } from '@/lib/topicStore';
import type { HabitGoal } from '@/lib/habitGoalStore';

interface HabitGoalDetailsListProps {
    items: HabitGoal[];
    isLight?: boolean;
    onPressItem: (id: string) => void;
}

const COMPLETE_GREEN = '#5fd6a0';

function relativeLastCompleted(iso: string | null): string {
    if (!iso) return 'Not completed yet';
    const then = new Date(iso);
    const days = Math.floor((Date.now() - then.getTime()) / (1000 * 60 * 60 * 24));
    if (days <= 0) return 'Last completed today';
    if (days === 1) return 'Last completed yesterday';
    if (days < 30) return `Last completed ${days} days ago`;
    return `Last completed ${then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

export function HabitGoalDetailsList({ items, isLight, onPressItem }: HabitGoalDetailsListProps) {
    const topics = useTopicStore((s) => s.topics);

    const primary = isLight ? '#1a1a1a' : '#fff';
    const secondary = isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)';
    const tertiary = isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)';
    const rowBg = isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)';
    const rowBorder = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.07)';

    return (
        <View style={styles.list}>
            {items.map((item) => {
                const unit = item.frequency === 'weekly' ? 'week' : 'day';
                const topic = item.linkedTopicId ? topics.find((t) => t.id === item.linkedTopicId) : undefined;
                const statusColor = item.isCompletedForCurrentPeriod ? COMPLETE_GREEN : tertiary;

                return (
                    <Pressable
                        key={item.id}
                        style={[styles.row, { backgroundColor: rowBg, borderColor: rowBorder }]}
                        onPress={() => onPressItem(item.id)}
                    >
                        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />

                        <View style={styles.rowBody}>
                            {/* Title + type/frequency */}
                            <View style={styles.titleRow}>
                                <Text style={[styles.title, { color: primary }]} numberOfLines={1}>
                                    {item.title}
                                </Text>
                                <Text style={[styles.typeLabel, { color: tertiary }]}>
                                    {item.type} · {item.frequency}
                                </Text>
                            </View>

                            {/* Status line */}
                            <Text style={[styles.statusLine, { color: item.isCompletedForCurrentPeriod ? COMPLETE_GREEN : secondary }]}>
                                {item.isCompletedForCurrentPeriod ? `Completed this ${unit}` : `Open this ${unit}`}
                            </Text>

                            {/* Stats */}
                            <Text style={[styles.stats, { color: tertiary }]}>
                                {item.currentStreak}-{unit} streak · best {item.bestStreak} · {item.totalCompletions} total
                            </Text>
                            <Text style={[styles.stats, { color: tertiary }]}>{relativeLastCompleted(item.lastCompletedAt)}</Text>

                            {/* Linked topic + note */}
                            {topic && (
                                <Text style={[styles.meta, { color: secondary }]} numberOfLines={1}>
                                    Topic: {topic.title}
                                </Text>
                            )}
                            {item.note ? (
                                <Text style={[styles.note, { color: tertiary }]} numberOfLines={2}>
                                    “{item.note}”
                                </Text>
                            ) : null}
                        </View>
                    </Pressable>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    list: {
        marginTop: 12,
        gap: 8,
    },
    row: {
        flexDirection: 'row',
        gap: 12,
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginTop: 5,
    },
    rowBody: {
        flex: 1,
        gap: 2,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
    },
    title: {
        fontSize: 15,
        fontWeight: '600',
        flexShrink: 1,
    },
    typeLabel: {
        fontSize: 11,
        textTransform: 'capitalize',
    },
    statusLine: {
        fontSize: 13,
        fontWeight: '500',
        marginTop: 1,
    },
    stats: {
        fontSize: 12,
    },
    meta: {
        fontSize: 12,
        marginTop: 2,
    },
    note: {
        fontSize: 12,
        fontStyle: 'italic',
        marginTop: 2,
    },
});

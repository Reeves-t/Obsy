import React, { useMemo } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import type { HabitGoal } from '@/lib/habitGoalStore';
import { currentWeekDayStates, lastSevenWeekStates } from './completionDays';

interface HabitGoalDetailsListProps {
    items: HabitGoal[];
    isLight?: boolean;
    onPressItem: (id: string) => void;
}

const GREEN_DARK = '#5fd6a0'; // on dark rows
const GREEN_LIGHT = '#1f8a5f'; // legible on light rows

function relativeLastCompleted(iso: string | null): string {
    if (!iso) return 'Not completed yet';
    const then = new Date(iso);
    const days = Math.floor((Date.now() - then.getTime()) / (1000 * 60 * 60 * 24));
    if (days <= 0) return 'Last completed today';
    if (days === 1) return 'Last completed yesterday';
    if (days < 30) return `Last completed ${days} days ago`;
    return `Last completed ${then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

// 16px status ring: filled disc + ring when completed, hairline ring when open.
function StatusRing({ completed, green, track }: { completed: boolean; green: string; track: string }) {
    const size = 16;
    const c = size / 2;
    return (
        <Svg width={size} height={size}>
            <Circle cx={c} cy={c} r={c - 1} stroke={completed ? green : track} strokeWidth={1.5} fill="none" />
            {completed && <Circle cx={c} cy={c} r={c - 4} fill={green} />}
        </Svg>
    );
}

function DotStrip({
    states,
    green,
    empty,
    caption,
    captionColor,
}: {
    states: boolean[];
    green: string;
    empty: string;
    caption: string;
    captionColor: string;
}) {
    return (
        <View style={styles.stripWrap}>
            <View style={styles.stripRow}>
                {states.map((on, i) => (
                    <View key={i} style={[styles.dot, { backgroundColor: on ? green : empty }]} />
                ))}
            </View>
            <Text style={[styles.stripCaption, { color: captionColor }]}>{caption}</Text>
        </View>
    );
}

export function HabitGoalDetailsList({ items, isLight, onPressItem }: HabitGoalDetailsListProps) {
    const primary = isLight ? '#1a1a1a' : '#fff';
    const secondary = isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)';
    const tertiary = isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)';
    const rowBg = isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)';
    const rowBorder = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.07)';
    const green = isLight ? GREEN_LIGHT : GREEN_DARK;
    const ringTrack = isLight ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.2)';
    const dotEmpty = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.12)';

    return (
        <View style={styles.list}>
            {items.map((item) => (
                <DetailRow
                    key={item.id}
                    item={item}
                    onPress={onPressItem}
                    colors={{ primary, secondary, tertiary, rowBg, rowBorder, green, ringTrack, dotEmpty }}
                />
            ))}
        </View>
    );
}

function DetailRow({
    item,
    onPress,
    colors,
}: {
    item: HabitGoal;
    onPress: (id: string) => void;
    colors: {
        primary: string;
        secondary: string;
        tertiary: string;
        rowBg: string;
        rowBorder: string;
        green: string;
        ringTrack: string;
        dotEmpty: string;
    };
}) {
    const unit = item.frequency === 'weekly' ? 'week' : 'day';
    const isWeekly = item.frequency === 'weekly';

    const states = useMemo(
        () => (isWeekly ? lastSevenWeekStates(item.completionHistory) : currentWeekDayStates(item.completionHistory)),
        [isWeekly, item.completionHistory]
    );

    return (
        <Pressable
            style={[styles.row, { backgroundColor: colors.rowBg, borderColor: colors.rowBorder }]}
            onPress={() => onPress(item.id)}
        >
            <View style={styles.ringWrap}>
                <StatusRing completed={item.isCompletedForCurrentPeriod} green={colors.green} track={colors.ringTrack} />
            </View>

            <View style={styles.rowBody}>
                {/* Title + type/frequency */}
                <View style={styles.titleRow}>
                    <Text style={[styles.title, { color: colors.primary }]} numberOfLines={1}>
                        {item.title}
                    </Text>
                    <Text style={[styles.typeLabel, { color: colors.tertiary }]}>
                        {item.type} · {item.frequency}
                    </Text>
                </View>

                {/* Status line */}
                <Text
                    style={[
                        styles.statusLine,
                        { color: item.isCompletedForCurrentPeriod ? colors.green : colors.secondary },
                    ]}
                >
                    {item.isCompletedForCurrentPeriod ? `Completed this ${unit}` : `Open this ${unit}`}
                </Text>

                {/* Stats */}
                <Text style={[styles.stats, { color: colors.tertiary }]}>
                    {item.currentStreak}-{unit} streak · best {item.bestStreak} · {item.totalCompletions} total
                </Text>
                <Text style={[styles.stats, { color: colors.tertiary }]}>
                    {relativeLastCompleted(item.lastCompletedAt)}
                </Text>

                {/* 7-dot completion strip */}
                <DotStrip
                    states={states}
                    green={colors.green}
                    empty={colors.dotEmpty}
                    caption={isWeekly ? 'Last 7 weeks' : 'This week'}
                    captionColor={colors.tertiary}
                />

                {/* Note */}
                {item.note ? (
                    <Text style={[styles.note, { color: colors.tertiary }]} numberOfLines={2}>
                        “{item.note}”
                    </Text>
                ) : null}
            </View>
        </Pressable>
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
    ringWrap: {
        marginTop: 2,
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
    stripWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 8,
    },
    stripRow: {
        flexDirection: 'row',
        gap: 5,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    stripCaption: {
        fontSize: 10,
        letterSpacing: 0.3,
        textTransform: 'uppercase',
    },
    note: {
        fontSize: 12,
        fontStyle: 'italic',
        marginTop: 4,
    },
});

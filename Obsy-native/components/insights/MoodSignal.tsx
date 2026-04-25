import React, { useMemo, memo, useState } from "react";
import { StyleSheet, View, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GlassCard } from "@/components/ui/GlassCard";
import { ThemedText } from "@/components/ui/ThemedText";
import Colors from "@/constants/Colors";
import { Capture } from "@/lib/captureStore";
import { getMoodSignal, MoodSignalRange } from "@/lib/moodSignals";
import { useObsyTheme } from "@/contexts/ThemeContext";

interface MoodSignalProps {
    captures: Capture[];
    flat?: boolean;
}

const FILTERS: { key: MoodSignalRange; label: string }[] = [
    { key: 'this_week', label: 'This Week' },
    { key: 'last_week', label: 'Last Week' },
    { key: 'month', label: 'This Month' },
    { key: 'all_time', label: 'All Time' },
];

export const MoodSignal = memo(function MoodSignal({ captures, flat = false }: MoodSignalProps) {
    const { colors, isLight } = useObsyTheme();
    const [selectedRange, setSelectedRange] = useState<MoodSignalRange>('this_week');
    const signalData = useMemo(() => getMoodSignal(captures, selectedRange), [captures, selectedRange]);

    const topMoods = useMemo(() => signalData.moodWeights.slice(0, 5), [signalData.moodWeights]);
    const extraMoodsCount = signalData.totalMoodsCount - topMoods.length;

    const content = (
        <View style={[styles.cardPadding, flat && styles.flatPadding]}>
            <View style={styles.header}>
                <View style={styles.titleRow}>
                    <Ionicons name="pulse-outline" size={18} color={colors.cardTextSecondary} />
                    <ThemedText type="defaultSemiBold" style={[styles.title, { color: colors.cardTextSecondary }]}>
                        Mood Signal
                    </ThemedText>
                </View>
                <ThemedText style={[styles.subtitle, { color: colors.cardTextSecondary }]}>Top moods of the day</ThemedText>
            </View>

            <View style={[styles.filtersContainer, { backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)' }]}>
                {FILTERS.map((filter) => {
                    const selected = filter.key === selectedRange;
                    return (
                        <TouchableOpacity
                            key={filter.key}
                            onPress={() => setSelectedRange(filter.key)}
                            style={[
                                styles.filterChip,
                                selected && {
                                    backgroundColor: isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.15)',
                                }
                            ]}
                            activeOpacity={0.85}
                        >
                            <ThemedText style={[styles.filterText, { color: selected ? colors.text : colors.cardTextSecondary }]}>
                                {filter.label}
                            </ThemedText>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {/* Visual Signal Area */}
            <View style={[styles.visualContainer, !signalData.hasEnoughData && { opacity: 0.3 }]}>
                <View style={styles.patternArea}>
                    {signalData.bars.map((day, idx) => {
                        const fillHeight = day.totalCaptures === 0 ? 0 : Math.max(20, Math.round(day.dominance * 100));
                        return (
                        <View key={`${day.dayName}-${idx}`} style={styles.dayColumn}>
                            <View style={[styles.barTrack, { backgroundColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)' }]}>
                                <View
                                    style={[
                                        styles.barFill,
                                        {
                                            height: `${fillHeight}%`,
                                            backgroundColor: day.color,
                                            opacity: day.totalCaptures > 0 ? 0.95 : 0,
                                        }
                                    ]}
                                />
                            </View>
                            <ThemedText style={[styles.dayLabel, { color: colors.cardTextSecondary }]}>{day.dayName}</ThemedText>
                        </View>
                        );
                    })}
                </View>

                {/* Horizontal Baseline */}
                <View style={[styles.baseline, { backgroundColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)' }]} />
            </View>

            {/* Mood Key (LEGEND) */}
            {signalData.hasEnoughData ? (
                <View style={styles.keyContainer}>
                    {topMoods.map((m, idx) => (
                        <View key={idx} style={styles.keyItem}>
                            <View style={[styles.keyDot, { backgroundColor: m.color }]} />
                            <ThemedText style={[styles.keyText, { color: colors.cardTextSecondary }]}>{m.mood}</ThemedText>
                        </View>
                    ))}
                    {extraMoodsCount > 0 && (
                        <ThemedText style={[styles.keyExtra, { color: colors.cardTextSecondary }]}>+{extraMoodsCount}</ThemedText>
                    )}
                </View>
            ) : null}
        </View>
    );

    if (flat) return content;

    return (
        <GlassCard noPadding>
            {content}
        </GlassCard>
    );
});

const styles = StyleSheet.create({
    cardPadding: {
        padding: 20,
        gap: 16,
    },
    flatPadding: {
        paddingHorizontal: 0,
        paddingVertical: 12,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between"
    },
    titleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    title: {
        color: Colors.obsy.silver,
    },
    subtitle: {
        fontSize: 14,
    },
    filtersContainer: {
        borderRadius: 12,
        padding: 4,
        flexDirection: 'row',
        gap: 6,
        flexWrap: 'wrap',
    },
    filterChip: {
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    filterText: {
        fontSize: 13,
        fontWeight: '500',
    },
    visualContainer: {
        height: 180,
        justifyContent: 'flex-end',
        paddingTop: 10,
    },
    patternArea: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
    },
    dayColumn: {
        width: 38,
        alignItems: 'center',
    },
    barTrack: {
        height: 130,
        width: 34,
        borderRadius: 16,
        overflow: 'hidden',
        justifyContent: 'flex-end',
        marginBottom: 8,
    },
    barFill: {
        width: '100%',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
    },
    dayLabel: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
        fontWeight: '500',
    },
    baseline: {
        height: 1,
        width: '100%',
    },
    keyContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginTop: -4,
    },
    keyItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    keyDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    keyText: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.4)',
        textTransform: 'capitalize',
    },
    keyExtra: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.3)',
        alignSelf: 'center',
    },
});

import React, { useMemo, memo } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GlassCard } from "@/components/ui/GlassCard";
import { ThemedText } from "@/components/ui/ThemedText";
import Colors from "@/constants/Colors";
import { Capture } from "@/lib/captureStore";
import { getWeeklyMoodSignal } from "@/lib/moodSignals";
import { useObsyTheme } from "@/contexts/ThemeContext";
import { useMoodResolver } from "@/hooks/useMoodResolver";

interface MoodSignalProps {
    captures: Capture[];
    flat?: boolean;
}

export const MoodSignal = memo(function MoodSignal({ captures, flat = false }: MoodSignalProps) {
    const { colors, isLight } = useObsyTheme();
    const { isLoading: isMoodCacheLoading } = useMoodResolver();
    const signalData = useMemo(() => getWeeklyMoodSignal(captures), [captures]);

    const topMoods = useMemo(() => signalData.moodWeights.slice(0, 5), [signalData.moodWeights]);
    const extraMoodsCount = signalData.totalMoodsCount - topMoods.length;

    // Show loading state while mood cache is being populated
    const isLoading = isMoodCacheLoading;

    const content = (
        <View style={[styles.cardPadding, flat && styles.flatPadding]}>
            <View style={styles.header}>
                <View style={styles.titleRow}>
                    <Ionicons name="pulse-outline" size={18} color={colors.cardTextSecondary} />
                    <ThemedText type="defaultSemiBold" style={[styles.title, { color: colors.cardTextSecondary }]}>
                        Mood Signal
                    </ThemedText>
                </View>
            </View>

            {/* Visual Signal Area */}
            <View style={[styles.visualContainer, (!signalData.hasEnoughData || isLoading) && { opacity: 0.3 }]}>
                <View style={styles.patternArea}>
                    {signalData.weeklyData.map((day, idx) => (
                        <View key={`${day.dayName}-${idx}`} style={styles.dayColumn}>
                            <View style={styles.dotTrack}>
                                {day.dots.map((dot, dIdx) => {
                                    // Subtle size variation based on energy tier
                                    const lowEnergy = ['numb', 'tired', 'drained', 'bored', 'depressed', 'lonely', 'melancholy', 'calm', 'relaxed', 'peaceful', 'safe'];
                                    const highEnergy = ['productive', 'creative', 'inspired', 'confident', 'joyful', 'social', 'busy', 'restless', 'stressed', 'overwhelmed', 'anxious', 'angry', 'pressured', 'enthusiastic', 'hyped', 'manic', 'playful'];

                                    let dotSize = 8; // Default
                                    if (lowEnergy.includes(dot.mood)) dotSize = 6;
                                    else if (highEnergy.includes(dot.mood)) dotSize = 10;

                                    return (
                                        <View
                                            key={dIdx}
                                            style={[
                                                styles.dot,
                                                {
                                                    bottom: `${dot.timePercent * 100}%`,
                                                    backgroundColor: dot.color,
                                                    opacity: dot.intensity,
                                                    width: dotSize,
                                                    height: dotSize,
                                                    borderRadius: dotSize / 2,
                                                    marginLeft: -(dotSize / 2) + 4, // Center on track
                                                    transform: [{ scale: 0.9 + dot.intensity * 0.2 }]
                                                }
                                            ]}
                                        />
                                    );
                                })}
                                {day.isHighlighted && <View style={[styles.dayHighlight, { backgroundColor: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)' }]} />}
                            </View>
                            <ThemedText style={[styles.dayLabel, { color: colors.cardTextSecondary }]}>{day.dayName}</ThemedText>
                        </View>
                    ))}
                </View>

                {/* Horizontal Baseline */}
                <View style={[styles.baseline, { backgroundColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)' }]} />
            </View>

            {/* Mood Key (LEGEND) - only show when not loading and has enough data */}
            {isLoading ? (
                <View style={styles.keyContainer}>
                    <View style={[styles.keyPlaceholder, { backgroundColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)' }]} />
                    <View style={[styles.keyPlaceholder, { backgroundColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)', width: 50 }]} />
                    <View style={[styles.keyPlaceholder, { backgroundColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)', width: 40 }]} />
                </View>
            ) : signalData.hasEnoughData ? (
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

            {/* Tiny Insight Text - show placeholder while loading */}
            <View style={styles.insightContainer}>
                {isLoading ? (
                    <View style={[styles.insightPlaceholder, { backgroundColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)' }]} />
                ) : (
                    <ThemedText style={[styles.insightText, { color: colors.cardTextSecondary }]}>
                        "{signalData.insight}"
                    </ThemedText>
                )}
            </View>
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
        justifyContent: "space-between",
    },
    titleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    title: {
        color: Colors.obsy.silver,
    },
    visualContainer: {
        height: 120,
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
        width: 32,
        alignItems: 'center',
    },
    dotTrack: {
        flex: 1,
        width: '100%',
        position: 'relative',
        marginBottom: 8,
    },
    dot: {
        position: 'absolute',
        width: 8,
        height: 8,
        borderRadius: 4,
        alignSelf: 'center',
    },
    dayHighlight: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 4,
        right: 4,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 4,
    },
    dayLabel: {
        fontSize: 10,
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
    keyPlaceholder: {
        height: 14,
        width: 60,
        borderRadius: 7,
    },
    insightContainer: {
        marginTop: 4,
    },
    insightText: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.6)',
        fontStyle: 'italic',
        lineHeight: 18,
    },
    insightPlaceholder: {
        height: 18,
        width: '80%',
        borderRadius: 4,
    },
});

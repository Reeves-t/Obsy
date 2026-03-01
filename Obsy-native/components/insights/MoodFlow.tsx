import React, { useMemo, useState, memo } from "react";
import { LayoutAnimation, Platform, StyleSheet, TouchableOpacity, UIManager, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { GlassCard } from "@/components/ui/GlassCard";
import { ThemedText } from "@/components/ui/ThemedText";
import Colors from "@/constants/Colors";
import { useMoodResolver } from "@/hooks/useMoodResolver";
import { useObsyTheme } from "@/contexts/ThemeContext";
import { MoodSegment, MoodFlowReading, MoodFlowData, isMoodFlowReading, isMoodFlowSegments } from "@/lib/dailyMoodFlows";
import { getMoodTheme } from "@/lib/moods";

interface MoodFlowProps {
    moodFlow?: MoodFlowData | null;
    loading?: boolean;
    flat?: boolean;
}

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

function buildGradientColors(flow: MoodSegment[]): [string, string, ...string[]] {
    if (!flow.length) return ["#1f2937", "#0f172a"];

    if (flow.length === 1) {
        // Single mood — use its canonical gradient stops for a rich, natural gradient
        const theme = getMoodTheme(flow[0].mood);
        return [theme.gradient.from, theme.gradient.to];
    }

    // Multiple moods — interleave each mood's gradient.from with blended transitions
    const colors: string[] = [];
    flow.forEach((segment, idx) => {
        const theme = getMoodTheme(segment.mood);
        colors.push(theme.gradient.from);
        if (idx < flow.length - 1) {
            // Transition: use this mood's "to" stop as the bridge to the next mood
            colors.push(theme.gradient.to);
        }
    });
    // Cap with the last mood's "to" stop
    const lastTheme = getMoodTheme(flow[flow.length - 1].mood);
    colors.push(lastTheme.gradient.to);

    return colors as [string, string, ...string[]];
}

export const MoodFlow = memo(function MoodFlow({ moodFlow, loading, flat = false }: MoodFlowProps) {
    const { colors, isLight } = useObsyTheme();
    const [expanded, setExpanded] = useState(false);
    const { isLoading: isMoodCacheLoading } = useMoodResolver();

    console.log('[MoodFlow] Received moodFlow prop:', JSON.stringify(moodFlow, null, 2));

    // Detect format: Reading (new) vs Segments (old)
    const isReadingFormat = useMemo(() => {
        return moodFlow && isMoodFlowReading(moodFlow);
    }, [moodFlow]);

    const isSegmentsFormat = useMemo(() => {
        return moodFlow && isMoodFlowSegments(moodFlow);
    }, [moodFlow]);

    // Validate and filter segments to ensure only valid ones are used
    const segments = useMemo(() => {
        if (isReadingFormat) return []; // Reading format has no segments
        if (!moodFlow || !Array.isArray(moodFlow)) return [];
        // Filter out invalid segments that are missing required fields
        return moodFlow.filter(s => s.mood && typeof s.percentage === 'number' && s.color);
    }, [moodFlow, isReadingFormat]);

    // Combine loading states to prevent flash of raw mood IDs
    const isLoadingMoods = loading || isMoodCacheLoading;

    // For Reading format, check if it has segments; otherwise use neutral gradient
    const gradientColors = useMemo(() => {
        console.log('[MoodFlow] Computing gradient colors...');
        console.log('[MoodFlow] isReadingFormat:', isReadingFormat);
        console.log('[MoodFlow] segments:', JSON.stringify(segments, null, 2));

        if (isReadingFormat) {
            // Check if reading format has segments embedded
            const reading = moodFlow as MoodFlowReading;
            console.log('[MoodFlow] Reading format detected, segments:', JSON.stringify(reading.segments, null, 2));
            if (reading.segments && Array.isArray(reading.segments) && reading.segments.length > 0) {
                // Use segments from reading format for colors
                const colors = buildGradientColors(reading.segments);
                console.log('[MoodFlow] Built gradient colors from reading segments:', colors);
                return colors;
            }
            // Fallback to neutral gradient if no segments
            console.log('[MoodFlow] No segments in reading format, using neutral gradient');
            return ["#4B5563", "#374151"] as [string, string];
        }
        const colors = buildGradientColors(segments);
        console.log('[MoodFlow] Built gradient colors from segments:', colors);
        return colors;
    }, [segments, isReadingFormat, moodFlow]);

    const toggle = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpanded((prev) => !prev);
    };

    const content = (
        <View style={[styles.cardPadding, flat && styles.flatPadding]}>
            <View style={styles.header}>
                <View style={styles.titleRow}>
                    <Ionicons name="sparkles-outline" size={18} color={colors.cardTextSecondary} />
                    <ThemedText type="defaultSemiBold" style={[styles.title, { color: colors.cardTextSecondary }]}>
                        Mood Flow
                    </ThemedText>
                </View>
                {/* Only show toggle for segments format (Reading format has no expandable segments) */}
                <TouchableOpacity onPress={toggle} disabled={isLoadingMoods || isReadingFormat || !segments.length}>
                    <Ionicons
                        name={expanded ? "chevron-up" : "chevron-down"}
                        size={18}
                        color={isReadingFormat ? 'transparent' : colors.cardTextSecondary}
                    />
                </TouchableOpacity>
            </View>

            <View style={styles.gradientWrapper}>
                <LinearGradient
                    colors={gradientColors}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={styles.gradientBar}
                />
            </View>

            {/* Reading format: show title, subtitle, and confidence badge */}
            {isReadingFormat && !isLoadingMoods && (
                <View style={styles.readingContainer}>
                    <ThemedText style={[styles.readingTitle, { color: colors.cardText }]}>
                        {(moodFlow as MoodFlowReading).title}
                    </ThemedText>
                    <ThemedText style={[styles.readingSubtitle, { color: colors.cardTextSecondary }]}>
                        {(moodFlow as MoodFlowReading).subtitle}
                    </ThemedText>
                    {(moodFlow as MoodFlowReading).confidence >= 70 && (
                        <View style={styles.confidenceBadge}>
                            <Ionicons name="checkmark-circle" size={14} color="#34D399" />
                            <ThemedText style={styles.confidenceText}>
                                {(moodFlow as MoodFlowReading).confidence}% confidence
                            </ThemedText>
                        </View>
                    )}
                </View>
            )}

            {isLoadingMoods && (
                <ThemedText style={[styles.placeholder, { color: colors.cardTextSecondary }]}>Generating today's mood flow...</ThemedText>
            )}

            {/* Empty state: only show if not loading, not Reading format, and no segments */}
            {!isLoadingMoods && !isReadingFormat && segments.length === 0 && (
                <ThemedText style={[styles.placeholder, { color: colors.cardTextSecondary }]}>
                    {moodFlow && Array.isArray(moodFlow) && moodFlow.length > 0
                        ? "Mood flow unavailable. Try regenerating this insight."
                        : "Capture moments today to see your mood transitions."}
                </ThemedText>
            )}

            {/* Segments format: expandable segment list */}
            {isSegmentsFormat && expanded && segments.length > 0 && (
                <View style={styles.segmentList}>
                    {segments.map((segment) => (
                        <View key={`${segment.mood}-${segment.percentage}`} style={styles.segmentCard}>
                            <View style={styles.segmentHeader}>
                                <View style={[styles.colorDot, { backgroundColor: segment.color || "#9CA3AF" }]} />
                                <ThemedText style={[styles.segmentMood, { color: colors.cardText }]}>{segment.mood}</ThemedText>
                                <ThemedText style={styles.segmentPercent}>
                                    {Math.round(segment.percentage)}%
                                </ThemedText>
                            </View>
                            {segment.context ? (
                                <ThemedText style={[styles.segmentContext, { color: colors.cardTextSecondary }]}>{segment.context}</ThemedText>
                            ) : null}
                        </View>
                    ))}
                </View>
            )}
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
        padding: 16,
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
    gradientWrapper: {
        backgroundColor: "rgba(255,255,255,0.05)",
        borderRadius: 999,
        padding: 6,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
    },
    gradientBar: {
        height: 12,
        borderRadius: 999,
    },
    placeholder: {
        color: "rgba(255,255,255,0.55)",
        fontSize: 13,
    },
    segmentList: {
        gap: 12,
    },
    segmentCard: {
        backgroundColor: "rgba(0,0,0,0.25)",
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.06)",
        gap: 6,
    },
    segmentHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    colorDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    segmentMood: {
        color: "#fff",
        fontWeight: "600",
        flex: 1,
    },
    segmentPercent: {
        fontFamily: "SpaceMono",
        color: Colors.obsy.silver,
        fontSize: 12,
    },
    segmentContext: {
        color: "rgba(255,255,255,0.7)",
        fontSize: 13,
        lineHeight: 18,
    },
    // Reading format styles
    readingContainer: {
        gap: 8,
        paddingTop: 4,
    },
    readingTitle: {
        fontSize: 16,
        fontWeight: "600",
        letterSpacing: 0.3,
    },
    readingSubtitle: {
        fontSize: 14,
        lineHeight: 20,
    },
    confidenceBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginTop: 4,
    },
    confidenceText: {
        fontSize: 12,
        color: "#34D399",
        fontFamily: "SpaceMono",
    },
});

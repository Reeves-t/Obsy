import React, { useMemo, useState, memo } from "react";
import { LayoutAnimation, Platform, StyleSheet, TouchableOpacity, UIManager, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { GlassCard } from "@/components/ui/GlassCard";
import { ThemedText } from "@/components/ui/ThemedText";
import Colors from "@/constants/Colors";
import { useMoodResolver } from "@/hooks/useMoodResolver";

type MoodSegment = {
    mood: string;
    percentage: number;
    color: string;
    context?: string;
};

interface MoodFlowProps {
    moodFlow?: MoodSegment[] | null;
    loading?: boolean;
    flat?: boolean;
}

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

function blendColor(a: string, b: string): string {
    const parse = (c: string) => {
        const v = c.replace("#", "");
        return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
    };
    const [r1, g1, b1] = parse(a);
    const [r2, g2, b2] = parse(b);
    const r = Math.round((r1 + r2) / 2);
    const g = Math.round((g1 + g2) / 2);
    const bVal = Math.round((b1 + b2) / 2);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bVal
        .toString(16)
        .padStart(2, "0")}`;
}

function buildGradientColors(flow: MoodSegment[]): [string, string, ...string[]] {
    if (!flow.length) return ["#1f2937", "#0f172a"];
    const colors: string[] = [];
    flow.forEach((segment, idx) => {
        const color = segment.color || "#9CA3AF";
        colors.push(color);
        const next = flow[idx + 1];
        if (next) {
            colors.push(blendColor(color, next.color || color));
        }
    });

    if (colors.length === 1) {
        return [colors[0], colors[0]];
    }

    return colors as [string, string, ...string[]];
}

export const MoodFlow = memo(function MoodFlow({ moodFlow, loading, flat = false }: MoodFlowProps) {
    const [expanded, setExpanded] = useState(false);
    const { isLoading: isMoodCacheLoading } = useMoodResolver();
    const segments = moodFlow || [];

    // Combine loading states to prevent flash of raw mood IDs
    const isLoadingMoods = loading || isMoodCacheLoading;

    const gradientColors = useMemo(() => buildGradientColors(segments), [segments]);

    const toggle = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpanded((prev) => !prev);
    };

    const content = (
        <View style={[styles.cardPadding, flat && styles.flatPadding]}>
            <View style={styles.header}>
                <View style={styles.titleRow}>
                    <Ionicons name="sparkles-outline" size={18} color={Colors.obsy.silver} />
                    <ThemedText type="defaultSemiBold" style={styles.title}>
                        Mood Flow
                    </ThemedText>
                </View>
                <TouchableOpacity onPress={toggle} disabled={isLoadingMoods || !segments.length}>
                    <Ionicons
                        name={expanded ? "chevron-up" : "chevron-down"}
                        size={18}
                        color={Colors.obsy.silver}
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

            {isLoadingMoods && (
                <ThemedText style={styles.placeholder}>Generating today's mood flow...</ThemedText>
            )}

            {!isLoadingMoods && segments.length === 0 && (
                <ThemedText style={styles.placeholder}>
                    Capture moments today to see your mood transitions.
                </ThemedText>
            )}

            {expanded && segments.length > 0 && (
                <View style={styles.segmentList}>
                    {segments.map((segment) => (
                        <View key={`${segment.mood}-${segment.percentage}`} style={styles.segmentCard}>
                            <View style={styles.segmentHeader}>
                                <View style={[styles.colorDot, { backgroundColor: segment.color || "#9CA3AF" }]} />
                                <ThemedText style={styles.segmentMood}>{segment.mood}</ThemedText>
                                <ThemedText style={styles.segmentPercent}>
                                    {Math.round(segment.percentage)}%
                                </ThemedText>
                            </View>
                            {segment.context ? (
                                <ThemedText style={styles.segmentContext}>{segment.context}</ThemedText>
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
});

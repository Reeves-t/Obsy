import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GlassCard } from "@/components/ui/GlassCard";
import { ThemedText } from "@/components/ui/ThemedText";
import Colors from "@/constants/Colors";
import { InsightHistory } from "@/services/insightHistory";

interface ChallengeInsightSectionProps {
    insight: InsightHistory | null;
    loading: boolean;
    isGenerating: boolean;
    allCompleted: boolean;
    onGenerate: (force: boolean) => void;
    onPress: () => void;
}

export function ChallengeInsightSection({
    insight,
    loading,
    isGenerating,
    allCompleted,
    onGenerate,
    onPress,
}: ChallengeInsightSectionProps) {
    const dateLabel = insight?.start_date
        ? new Date(insight.start_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })
        : "Recent";

    return (
        <Pressable onPress={onPress}>
            <GlassCard noPadding>
                <View style={styles.cardPadding}>
                    <View style={styles.header}>
                        <View style={styles.titleRow}>
                            <Ionicons name="locate-outline" size={18} color="#F2D6A2" />
                            <View>
                                <ThemedText type="defaultSemiBold" style={styles.title}>
                                    Challenge Insight
                                </ThemedText>
                                <ThemedText style={styles.dateText}>{dateLabel}</ThemedText>
                            </View>
                        </View>
                        <TouchableOpacity onPress={() => onGenerate(true)} disabled={isGenerating}>
                            {isGenerating ? (
                                <ActivityIndicator size="small" color={Colors.obsy.silver} />
                            ) : (
                                <ThemedText style={styles.link}>Regenerate</ThemedText>
                            )}
                        </TouchableOpacity>
                    </View>

                    {loading ? (
                        <View style={styles.loadingRow}>
                            <ActivityIndicator size="small" color={Colors.obsy.silver} />
                            <ThemedText style={styles.subtle}>Loading challenge insight...</ThemedText>
                        </View>
                    ) : insight ? (
                        <View style={styles.content}>
                            <ThemedText style={styles.insightText} numberOfLines={4}>
                                {insight.content}
                            </ThemedText>
                            <View style={styles.readMoreRow}>
                                <ThemedText style={styles.link}>Read full insight</ThemedText>
                                <Ionicons name="arrow-forward" size={14} color={Colors.obsy.silver} />
                            </View>
                        </View>
                    ) : allCompleted ? (
                        <View style={styles.emptyState}>
                            <ThemedText style={styles.subtle}>
                                Challenges are done. Generate an insight to summarize the run.
                            </ThemedText>
                            <TouchableOpacity
                                style={styles.generateBtn}
                                onPress={() => onGenerate(false)}
                                disabled={isGenerating}
                            >
                                {isGenerating ? (
                                    <ActivityIndicator size="small" color="#0f0f0f" />
                                ) : (
                                    <ThemedText style={styles.generateText}>Generate Insight</ThemedText>
                                )}
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <ThemedText style={styles.subtle}>
                            Complete daily challenges to unlock this insight.
                        </ThemedText>
                    )}
                </View>
            </GlassCard>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    cardPadding: {
        padding: 24,
        gap: 12,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    titleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    title: {
        color: Colors.obsy.silver,
    },
    dateText: {
        color: "rgba(255,255,255,0.6)",
        fontSize: 12,
    },
    link: {
        color: Colors.obsy.silver,
        fontSize: 12,
    },
    loadingRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    subtle: {
        color: "rgba(255,255,255,0.65)",
        fontSize: 13,
    },
    content: {
        gap: 12,
    },
    insightText: {
        color: "rgba(255,255,255,0.9)",
        lineHeight: 20,
    },
    readMoreRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    emptyState: {
        gap: 12,
    },
    generateBtn: {
        backgroundColor: "#F2D6A2",
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 999,
        alignSelf: "flex-start",
    },
    generateText: {
        color: "#0f0f0f",
        fontWeight: "700",
    },
});

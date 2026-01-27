import React, { memo } from "react";
import { ActivityIndicator, StyleSheet, TouchableOpacity, View, Alert } from "react-native";
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from "@expo/vector-icons";
import { GlassCard } from "@/components/ui/GlassCard";
import { ThemedText } from "@/components/ui/ThemedText";
import { InsightText } from "@/components/insights/InsightText";
import Colors from "@/constants/Colors";
import { InsightHistory } from "@/services/insightHistory";
import { WeeklyStats } from "@/lib/insightsAnalytics";
import { InsightSentence } from "@/services/dailyInsights";
import { archiveInsightWithResult, fetchArchives, ARCHIVE_ERROR_CODES } from "@/services/archive";
import { BookmarkButton } from "@/components/insights/BookmarkButton";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/contexts/AuthContext";
import { startOfWeek, format } from "date-fns";
import { useCaptureStore } from "@/lib/captureStore";
import { PendingInsightMessage } from "./PendingInsightMessage";

interface WeeklySummaryCardProps {
    weeklyInsight: InsightHistory | null;
    weeklyStats: WeeklyStats | null;
    isGenerating: boolean;
    onGenerate: () => void;
    onViewHistory: () => void;
    flat?: boolean;
    onArchiveFull?: () => void;
    pendingCount?: number;
}

export const WeeklySummaryCard = memo(function WeeklySummaryCard({
    weeklyInsight,
    weeklyStats,
    isGenerating,
    onGenerate,
    onViewHistory,
    flat = false,
    onArchiveFull,
    pendingCount = 0,
}: WeeklySummaryCardProps) {
    const { user } = useAuth();
    const { captures } = useCaptureStore();
    const hasInsight = !!weeklyInsight;

    const [isSaved, setIsSaved] = React.useState(false);
    const [saving, setSaving] = React.useState(false);

    // Check if saved
    React.useEffect(() => {
        const checkSaved = async () => {
            if (!user || !weeklyInsight) return;
            const archives = await fetchArchives(user.id);
            const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
            const dateStr = format(weekStart, "yyyy-MM-dd");
            const saved = archives.some(a => a.type === 'weekly' && a.date_scope.startsWith(dateStr));
            setIsSaved(saved);
        };
        checkSaved();
    }, [user?.id, weeklyInsight?.id]);

    const handleSave = async () => {
        if (!user) {
            Alert.alert("Sign In Required", "Please sign in to save insights to your archive.");
            return;
        }
        if (!weeklyInsight || isSaved || saving) return;

        if (onArchiveFull) {
            const archives = await fetchArchives(user.id);
            if (archives.length >= 150) {
                onArchiveFull();
                return;
            }
        }

        setSaving(true);
        try {
            const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
            const result = await archiveInsightWithResult({
                userId: user.id,
                type: 'weekly',
                insightText: weeklyInsight.content,
                relatedCaptureIds: weeklyInsight.capture_ids || [],
                date: weekStart,
            });

            if (result.data) {
                setIsSaved(true);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } else if (result.error) {
                console.error("[WeeklySummaryCard] Archive error:", {
                    weekStart: format(weekStart, 'yyyy-MM-dd'),
                    error: result.error,
                });

                const errorMessage = result.error.code === ARCHIVE_ERROR_CODES.RLS_VIOLATION
                    ? "You don't have permission to save this insight. Please try signing in again."
                    : "Failed to save weekly insight. Please try again.";
                Alert.alert("Error", errorMessage);
            }
        } catch (error) {
            console.error("[WeeklySummaryCard] Unexpected error saving insight:", error);
            Alert.alert("Error", "An unexpected error occurred. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    const content = (
        <View style={[styles.cardPadding, flat && styles.flatPadding]}>
            <View style={styles.header}>
                <View style={styles.titleRow}>
                    <Ionicons name="calendar-outline" size={18} color={Colors.obsy.silver} />
                    <View>
                        <ThemedText type="defaultSemiBold" style={styles.title}>
                            Week in Review
                        </ThemedText>
                        <ThemedText style={styles.subline}>
                            A reflection across your days so far
                        </ThemedText>
                    </View>
                </View>
                <View style={styles.actions}>
                    <TouchableOpacity onPress={onViewHistory}>
                        <ThemedText style={styles.historyHint}>View history</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onGenerate} disabled={isGenerating}>
                        {isGenerating ? (
                            <ActivityIndicator size="small" color={Colors.obsy.silver} />
                        ) : (
                            <Ionicons name="refresh" size={18} color={Colors.obsy.silver} />
                        )}
                    </TouchableOpacity>
                </View>
            </View>

            {pendingCount > 0 && (
                <View style={{ marginTop: -8, marginBottom: 8 }}>
                    <PendingInsightMessage
                        pendingCount={pendingCount}
                        onRefresh={onGenerate}
                        isRefreshing={isGenerating}
                    />
                </View>
            )}

            <View style={styles.insightBody}>
                {hasInsight ? (
                    <InsightText
                        sentences={weeklyInsight?.mood_summary?.sentences as InsightSentence[] | undefined}
                        fallbackText={weeklyInsight?.content}
                        collapsedSentences={4}
                        expandable={true}
                    />
                ) : (
                    <View style={styles.emptyState}>
                        <ThemedText style={styles.emptyText}>
                            Generate a weekly narrative to see your week's arc.
                        </ThemedText>
                        <TouchableOpacity onPress={onGenerate} disabled={isGenerating}>
                            <LinearGradient
                                colors={['#8B5CF6', '#6D28D9']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.generateBtn}
                            >
                                {isGenerating ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <ThemedText style={styles.generateText}>Generate Narrative</ThemedText>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            <View style={styles.divider} />

            <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                    <ThemedText style={styles.statLabel}>CAPTURES</ThemedText>
                    <ThemedText style={styles.statValue}>
                        {weeklyStats?.totalCaptures ?? "--"}
                    </ThemedText>
                </View>
                <View style={styles.statCard}>
                    <ThemedText style={styles.statLabel}>ACTIVE DAYS</ThemedText>
                    <ThemedText style={styles.statValue}>
                        {weeklyStats?.activeDays ?? "--"}
                    </ThemedText>
                </View>
                <View style={styles.statCard}>
                    <ThemedText style={styles.statLabel}>AVG / DAY</ThemedText>
                    <ThemedText style={styles.statValue}>
                        {weeklyStats?.avgPerActiveDay ?? "--"}
                    </ThemedText>
                </View>
            </View>

            <View style={styles.moodRow}>
                <ThemedText style={styles.statLabel}>DOMINANT MOOD</ThemedText>
                <ThemedText style={styles.moodValue}>
                    {weeklyStats?.dominantMood || "—"}
                </ThemedText>
            </View>

            {hasInsight && (
                <View style={styles.cardFooter}>
                    <BookmarkButton
                        isSaved={isSaved}
                        onPress={handleSave}
                        disabled={saving}
                    />
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
        padding: 24,
        gap: 16,
    },
    flatPadding: {
        paddingHorizontal: 0,
        paddingVertical: 12,
    },
    header: {
        flexDirection: "row",
        alignItems: "flex-start", // Changed to flex-start to align with multi-line title
        justifyContent: "space-between",
    },
    titleRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 10,
    },
    title: {
        color: Colors.obsy.silver,
    },
    subline: {
        color: "rgba(255,255,255,0.4)",
        fontSize: 10,
        marginTop: 2,
    },
    actions: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    historyHint: {
        color: "rgba(255,255,255,0.7)",
        fontSize: 12,
    },
    insightBody: {
        minHeight: 60,
    },
    insightText: {
        color: "rgba(255,255,255,0.9)",
        lineHeight: 20,
    },
    emptyState: {
        gap: 12,
    },
    emptyText: {
        color: "rgba(255,255,255,0.6)",
    },
    generateBtn: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 999,
        alignSelf: "flex-start",
    },
    generateText: {
        color: "#fff",
        fontWeight: "700",
    },
    divider: {
        height: 1,
        backgroundColor: "rgba(255,255,255,0.08)",
    },
    statsGrid: {
        flexDirection: "row",
        gap: 12,
    },
    statCard: {
        flex: 1,
        gap: 6,
    },
    statLabel: {
        color: "rgba(255,255,255,0.6)",
        fontSize: 11,
        letterSpacing: 1,
    },
    statValue: {
        color: "#fff",
        fontFamily: "SpaceMono",
        fontSize: 18,
    },
    moodRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    moodValue: {
        color: "#F97316",
        fontWeight: "700",
    },
    cardFooter: {
        marginTop: 8,
        alignItems: 'flex-end',
        marginRight: -8, // Offset button padding
    },
});

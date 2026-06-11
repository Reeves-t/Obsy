import React, { memo, useEffect } from "react";
import { ActivityIndicator, StyleSheet, TouchableOpacity, View, Alert } from "react-native";
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from "@/components/ui/ThemedText";
import { InsightText } from "@/components/insights/InsightText";
import { InsightSectionHeader } from "@/components/insights/InsightSectionHeader";
import { MoodRefreshLight, type MoodLight } from "@/components/insights/MoodRefreshLight";
import { useInsightLightGate } from "@/hooks/useInsightLightGate";
import { getMoodTheme } from "@/lib/moods/theme";
import { WeeklyStats } from "@/lib/insightsAnalytics";
import { archiveInsightWithResult, fetchArchives, ARCHIVE_ERROR_CODES } from "@/services/archive";
import { BookmarkButton } from "@/components/insights/BookmarkButton";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/contexts/AuthContext";
import { startOfWeek, endOfWeek, format } from "date-fns";
import { useCaptureStore } from "@/lib/captureStore";
import { PendingInsightMessage } from "./PendingInsightMessage";
import { useObsyTheme } from "@/contexts/ThemeContext";
import { getUserFriendlyErrorMessage, type InsightError } from "@/lib/insightErrorUtils";
import { useI18n } from '@/i18n/config';
import { useTranslatedInsight } from '@/hooks/useTranslatedInsight';
import { InsightMoodOrbField } from './InsightMoodOrbField';

interface WeeklySummaryCardProps {
    text: string | null;
    weeklyStats: WeeklyStats | null;
    isGenerating: boolean;
    onGenerate: () => void;
    onViewHistory?: () => void;
    flat?: boolean;
    onArchiveFull?: () => void;
    pendingCount?: number;
    error?: InsightError | null;
}

export const WeeklySummaryCard = memo(function WeeklySummaryCard({
    text,
    weeklyStats,
    isGenerating,
    onGenerate,
    onArchiveFull,
    pendingCount = 0,
    error = null,
}: WeeklySummaryCardProps) {
    const { colors, isLight } = useObsyTheme();
    const { t } = useI18n();
    const { user } = useAuth();
    const { captures } = useCaptureStore();
    const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
    const weekKey = format(currentWeekStart, 'yyyy-MM-dd');
    const currentWeekEnd = endOfWeek(new Date(), { weekStartsOn: 0 });
    const weekMoodIds = React.useMemo(() => {
        return captures
            .filter((capture) => {
                const date = new Date(capture.created_at);
                return date >= currentWeekStart && date <= currentWeekEnd;
            })
            .map((capture) => capture.mood_id)
            .filter(Boolean);
    }, [captures, currentWeekStart.getTime(), currentWeekEnd.getTime()]);

    // Light gate: holds new text behind the mood-light retraction animation
    const { displayText, lightLoading, onRetractComplete } = useInsightLightGate(isGenerating, text);

    // Derive mood lights from this week's captures (top 4 most frequent moods)
    const moodLights = React.useMemo((): MoodLight[] => {
        const freq = new Map<string, number>();
        for (const id of weekMoodIds) {
            freq.set(id, (freq.get(id) || 0) + 1);
        }
        return [...freq.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([id]) => {
                const theme = getMoodTheme(id);
                return {
                    primary: theme.gradient.primary,
                    mid: theme.gradient.mid,
                    secondary: theme.gradient.secondary,
                };
            });
    }, [weekMoodIds]);

    const translatedText = useTranslatedInsight({ insightId: `weekly-${weekKey}`, sourceText: displayText, sourceLanguage: 'en' });
    const hasInsight = !!translatedText;

    const [isSaved, setIsSaved] = React.useState(false);
    const [saving, setSaving] = React.useState(false);

    useEffect(() => {
        if (error) {
            console.error("[WeeklySummaryCard] Displaying error to user:", {
                stage: error.stage,
                message: getUserFriendlyErrorMessage(error),
                requestId: error.requestId,
            });
        }
    }, [error]);

    // Check if saved
    React.useEffect(() => {
        const checkSaved = async () => {
            if (!user || !text) return;
            const archives = await fetchArchives(user.id);
            const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
            const dateStr = format(weekStart, "yyyy-MM-dd");
            const saved = archives.some(a => a.type === 'weekly' && a.date_scope.startsWith(dateStr));
            setIsSaved(saved);
        };
        checkSaved();
    }, [user?.id, text]);

    const handleSave = async () => {
        if (!user) {
            Alert.alert("Sign In Required", "Please sign in to save insights to your archive.");
            return;
        }
        if (!text || isSaved || saving) return;

        if (onArchiveFull) {
            const archives = await fetchArchives(user.id);
            if (archives.length >= 150) {
                onArchiveFull();
                return;
            }
        }

        setSaving(true);
        try {
            const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
            const result = await archiveInsightWithResult({
                userId: user.id,
                type: 'weekly',
                insightText: text,
                relatedCaptureIds: [],
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
        <View style={styles.cardPadding}>
            <InsightSectionHeader
                icon="calendar-outline"
                title={t('insight.weekInReview')}
                subline={t('insight.weekSubline')}
                onRefresh={onGenerate}
                isRefreshing={isGenerating}
            />

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
                    <>
                    <InsightText
                        fallbackText={translatedText || ''}
                        collapsedSentences={4}
                        expandable={true}
                    />
                    <InsightMoodOrbField moodIds={weekMoodIds} variant="subtle" maxOrbs={8} />
                    </>
                ) : (
                    <View style={styles.emptyState}>
                        <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
                            {error ? getUserFriendlyErrorMessage(error) : "Generate a weekly narrative to see your week's arc."}
                        </ThemedText>
                        <InsightMoodOrbField moodIds={weekMoodIds} variant="focus" maxOrbs={10} />
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
                                    <ThemedText style={styles.generateText}>{t('insight.generateNarrative')}</ThemedText>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            <View style={[styles.divider, { backgroundColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)' }]} />

            <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                    <ThemedText style={[styles.statLabel, { color: colors.textSecondary }]}>CAPTURES</ThemedText>
                    <ThemedText style={[styles.statValue, { color: colors.text }]}>
                        {weeklyStats?.totalCaptures ?? "--"}
                    </ThemedText>
                </View>
                <View style={styles.statCard}>
                    <ThemedText style={[styles.statLabel, { color: colors.textSecondary }]}>ACTIVE DAYS</ThemedText>
                    <ThemedText style={[styles.statValue, { color: colors.text }]}>
                        {weeklyStats?.activeDays ?? "--"}
                    </ThemedText>
                </View>
                <View style={styles.statCard}>
                    <ThemedText style={[styles.statLabel, { color: colors.textSecondary }]}>AVG / DAY</ThemedText>
                    <ThemedText style={[styles.statValue, { color: colors.text }]}>
                        {weeklyStats?.avgPerActiveDay ?? "--"}
                    </ThemedText>
                </View>
            </View>

            <View style={styles.moodRow}>
                <ThemedText style={[styles.statLabel, { color: colors.textSecondary }]}>DOMINANT MOOD</ThemedText>
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

    return (
        <View style={styles.wrapper}>
            <MoodRefreshLight loading={lightLoading} moods={moodLights} onRetractComplete={onRetractComplete} />
            {content}
        </View>
    );
});

const styles = StyleSheet.create({
    wrapper: {
        overflow: 'visible' as const,
    },
    cardPadding: {
        paddingVertical: 24,
        gap: 16,
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

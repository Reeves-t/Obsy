import React, { useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, TouchableOpacity, View, ScrollView, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { GlassCard } from "@/components/ui/GlassCard";
import { ThemedText } from "@/components/ui/ThemedText";
import { MoodFlow } from "@/components/insights/MoodFlow";
import { MoodRingDial } from "@/components/insights/MoodRingDial";
import Colors from "@/constants/Colors";
import { InsightHistory } from "@/services/insightHistory";
import { Capture } from "@/types/capture";
import { DailyMoodFlowData, filterCapturesForDate, formatDateKey } from "@/lib/dailyMoodFlows";
import { getMoodColor } from "@/lib/moodColors";
import { archiveInsightWithResult, fetchArchives, ARCHIVE_ERROR_CODES } from "@/services/archive";
import { format } from "date-fns";
import { BookmarkButton } from "@/components/insights/BookmarkButton";
import { useAuth } from "@/contexts/AuthContext";
import * as Haptics from "expo-haptics";
import { PendingInsightMessage } from "./PendingInsightMessage";
import { useObsyTheme } from "@/contexts/ThemeContext";

interface MonthViewProps {
    currentMonth: Date;
    onMonthChange: (direction: "prev" | "next") => void;
    monthlyInsight: InsightHistory | null;
    onGenerate: () => void;
    isGenerating: boolean;
    captures: Capture[];
    dailyFlows: Record<string, DailyMoodFlowData>;
    /** Reasoning that explains WHY the monthPhrase title was chosen (for the dial) */
    aiReasoning?: string | null;
    monthPhrase?: string | null;
    onArchiveFull?: () => void;
    isEligibleForInsight: boolean;
    capturedDaysCount: number;
    pendingCount?: number;
}

export function MonthView({
    currentMonth,
    onMonthChange,
    monthlyInsight,
    onGenerate,
    isGenerating,
    captures,
    dailyFlows,
    aiReasoning,
    monthPhrase,
    onArchiveFull,
    isEligibleForInsight,
    capturedDaysCount,
    pendingCount = 0,
}: MonthViewProps) {
    const { colors, isLight } = useObsyTheme();
    const { user } = useAuth();
    const [selectedDay, setSelectedDay] = useState<number | null>(null);

    const [isSaved, setIsSaved] = useState(false);
    const [saving, setSaving] = useState(false);

    // Check if insight is already saved when component mounts or dependencies change
    React.useEffect(() => {
        const checkSaved = async () => {
            if (!user || !monthlyInsight) return;
            const archives = await fetchArchives(user.id);
            const dateStr = format(currentMonth, "yyyy-MM");
            const saved = archives.some(a => a.type === 'monthly' && a.date_scope === dateStr);
            setIsSaved(saved);
        };
        checkSaved();
    }, [user?.id, monthlyInsight?.id, currentMonth.getTime()]);

    const handleSave = async () => {
        if (!user) {
            Alert.alert("Sign In Required", "Please sign in to save insights to your archive.");
            return;
        }
        if (!monthlyInsight || isSaved || saving) return;

        if (onArchiveFull) {
            const archives = await fetchArchives(user.id);
            if (archives.length >= 150) {
                onArchiveFull();
                return;
            }
        }

        setSaving(true);
        try {
            const result = await archiveInsightWithResult({
                userId: user.id,
                type: 'monthly',
                insightText: monthlyInsight.content,
                relatedCaptureIds: monthlyInsight.capture_ids || [],
                date: currentMonth,
            });

            if (result.data) {
                setIsSaved(true);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } else if (result.error) {
                console.error("[MonthView] Archive error:", {
                    month: format(currentMonth, 'yyyy-MM'),
                    error: result.error,
                });

                const errorMessage = result.error.code === ARCHIVE_ERROR_CODES.RLS_VIOLATION
                    ? "You don't have permission to save this insight. Please try signing in again."
                    : "Failed to save monthly insight. Please try again.";
                Alert.alert("Error", errorMessage);
            }
        } catch (error) {
            console.error("[MonthView] Unexpected error saving insight:", error);
            Alert.alert("Error", "An unexpected error occurred. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    const daysInMonth = useMemo(() => {
        return new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
    }, [currentMonth]);

    // Get captures and flow for selected day
    const selectedDayData = useMemo(() => {
        if (!selectedDay) return null;
        const dateKey = formatDateKey(
            new Date(currentMonth.getFullYear(), currentMonth.getMonth(), selectedDay)
        );
        const dayCaptures = filterCapturesForDate(captures, dateKey);
        const flowData = dailyFlows[dateKey] || null;
        return { dateKey, dayCaptures, flowData };
    }, [selectedDay, currentMonth, captures, dailyFlows]);

    return (
        <View style={styles.stack}>
            <MonthHeader date={currentMonth} onChange={onMonthChange} />

            {/* Mood Ring Dial */}
            <View style={styles.floatingScrim}>
                <BlurView intensity={20} tint="dark" style={styles.blurContainer}>
                    <View style={styles.ringContainer}>
                        <MoodRingDial
                            dailyFlows={dailyFlows}
                            daysInMonth={daysInMonth}
                            monthYear={{ year: currentMonth.getFullYear(), month: currentMonth.getMonth() }}
                            monthPhrase={monthPhrase}
                            aiReasoning={aiReasoning}
                        />
                    </View>
                </BlurView>
            </View>

            <MonthSummaryCard
                insight={monthlyInsight}
                onGenerate={onGenerate}
                isGenerating={isGenerating}
                isSaved={isSaved}
                onSave={handleSave}
                saving={saving}
                onArchiveFull={onArchiveFull}
                isEligible={isEligibleForInsight}
                capturedDays={capturedDaysCount}
                pendingCount={pendingCount}
                isLight={isLight}
                colors={colors}
            />

            <MonthCalendar
                month={currentMonth}
                selectedDay={selectedDay}
                onSelectDay={setSelectedDay}
                dailyFlows={dailyFlows}
                isLight={isLight}
                colors={colors}
            />

            {/* Selected Day Panel - Inline below calendar */}
            {selectedDayData && (
                <SelectedDayPanel
                    dayCaptures={selectedDayData.dayCaptures}
                    flowData={selectedDayData.flowData}
                    selectedDay={selectedDay!}
                    currentMonth={currentMonth}
                    isLight={isLight}
                    colors={colors}
                />
            )}
        </View>
    );
}

function MonthSummaryCard({
    insight,
    onGenerate,
    isGenerating,
    isSaved,
    onSave,
    saving,
    onArchiveFull,
    isEligible,
    capturedDays,
    pendingCount,
    isLight,
    colors,
}: {
    insight: InsightHistory | null;
    onGenerate: () => void;
    isGenerating: boolean;
    isSaved: boolean;
    onSave: () => void;
    saving: boolean;
    onArchiveFull?: () => void;
    isEligible: boolean;
    capturedDays: number;
    pendingCount?: number;
    isLight?: boolean;
    colors?: { cardText: string; cardTextSecondary: string; cardBorder: string; };
}) {
    const timestamp = insight?.mood_summary?.generated_through_date;
    const formattedDate = timestamp ? format(new Date(timestamp + 'T12:00:00'), "MMM d") : null;

    return (
        <View style={styles.summaryCard}>
            <View style={styles.summaryHeader}>
                <View style={[styles.titleRow, { flex: 1 }]}>
                    <View>
                        <ThemedText type="defaultSemiBold" style={[styles.title, colors && { color: colors.cardText }]}>
                            Monthly Insight
                        </ThemedText>
                        {formattedDate && (
                            <ThemedText style={[styles.asOfText, colors && { color: colors.cardTextSecondary }]}>
                                As of {formattedDate}
                            </ThemedText>
                        )}
                    </View>
                </View>

                {isEligible ? (
                    <TouchableOpacity style={styles.refreshBtn} onPress={onGenerate} disabled={isGenerating}>
                        {isGenerating ? (
                            <ActivityIndicator size="small" color={colors?.cardTextSecondary || Colors.obsy.silver} />
                        ) : (
                            <Ionicons name="refresh-outline" size={24} color={colors?.cardTextSecondary || Colors.obsy.silver} />
                        )}
                    </TouchableOpacity>
                ) : (
                    <View style={styles.lockedContainer}>
                        <ThemedText style={[styles.lockedText, colors && { color: colors.cardTextSecondary }]}>Unlocks after week one</ThemedText>
                        <ThemedText style={[styles.progressText, colors && { color: colors.cardTextSecondary }]}>{capturedDays}/7 days captured</ThemedText>
                    </View>
                )}
            </View>

            {isEligible && (pendingCount ?? 0) > 0 && (
                <View style={{ marginBottom: 12 }}>
                    <PendingInsightMessage
                        pendingCount={pendingCount!}
                        onRefresh={onGenerate}
                        isRefreshing={isGenerating}
                    />
                </View>
            )}

            <View style={styles.summaryBody}>
                {insight ? (
                    <ThemedText style={[styles.summaryText, colors && { color: colors.cardText }]}>
                        {insight.content}
                    </ThemedText>
                ) : (
                    <ThemedText style={[styles.placeholder, colors && { color: colors.cardTextSecondary }]}>
                        {isEligible
                            ? "Create a monthly narrative to see long-form patterns."
                            : "Keep capturing your days to unlock this insight."}
                    </ThemedText>
                )}
            </View>

            {insight && (
                <View style={styles.summaryFooter}>
                    <BookmarkButton
                        isSaved={isSaved}
                        onPress={onSave}
                        disabled={saving}
                    />
                </View>
            )}
        </View>
    );
}

function MonthCalendar({
    month,
    selectedDay,
    onSelectDay,
    dailyFlows,
    isLight,
    colors,
}: {
    month: Date;
    selectedDay: number | null;
    onSelectDay: (day: number) => void;
    dailyFlows: Record<string, DailyMoodFlowData>;
    isLight?: boolean;
    colors?: { cardText: string; cardTextSecondary: string; };
}) {
    const days = useMemo(() => getCalendarDays(month), [month]);
    const year = month.getFullYear();
    const monthNum = month.getMonth();

    const getDateKeyForDay = (day: number): string => {
        const m = String(monthNum + 1).padStart(2, "0");
        const d = String(day).padStart(2, "0");
        return `${year}-${m}-${d}`;
    };

    return (
        <View style={styles.calendarContainer}>
            <View style={styles.weekdayRow}>
                {["S", "M", "T", "W", "T", "F", "S"].map((d, idx) => (
                    <ThemedText key={`weekday-${idx}`} style={[styles.weekday, colors && { color: colors.cardTextSecondary }]}>
                        {d}
                    </ThemedText>
                ))}
            </View>
            <View style={styles.daysGrid}>
                {days.map((day, idx) => {
                    const isSelected = selectedDay === day;
                    const dateKey = day > 0 ? getDateKeyForDay(day) : "";
                    const flowData = dateKey ? dailyFlows[dateKey] : null;
                    const hasData = flowData && flowData.totalCaptures > 0;
                    const moodColor = hasData ? getMoodColor(flowData.dominant) : null;

                    return (
                        <TouchableOpacity
                            key={idx}
                            style={[
                                styles.dayCell,
                                { backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)' },
                                isSelected && { borderColor: isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)' },
                                day === 0 && styles.emptyCell,
                            ]}
                            disabled={day === 0}
                            onPress={() => day && onSelectDay(day)}
                        >
                            {day !== 0 && (
                                <>
                                    <ThemedText style={[styles.dayNumber, colors && { color: colors.cardText }]}>{day}</ThemedText>
                                    {hasData && moodColor && (
                                        <View
                                            style={[
                                                styles.moodDotIndicator,
                                                { backgroundColor: moodColor },
                                            ]}
                                        />
                                    )}
                                </>
                            )}
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

function SelectedDayPanel({
    dayCaptures,
    flowData,
    selectedDay,
    currentMonth,
    isLight,
    colors,
}: {
    dayCaptures: Capture[];
    flowData: DailyMoodFlowData | null;
    selectedDay: number;
    currentMonth: Date;
    isLight?: boolean;
    colors?: { cardText: string; cardTextSecondary: string; cardBorder: string; };
}) {
    const dateLabel = new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth(),
        selectedDay
    ).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

    const dominantMood = flowData?.dominant || "neutral";
    const captureCount = dayCaptures.length;

    return (
        <View style={[styles.selectedDayPanel, { borderTopColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)' }]}>
            <View style={styles.selectedDayHeader}>
                <ThemedText type="defaultSemiBold" style={[styles.selectedDayTitle, colors && { color: colors.cardText }]}>
                    {dateLabel}
                </ThemedText>
                <View style={styles.selectedDayMeta}>
                    <View style={[styles.dominantDot, { backgroundColor: getMoodColor(dominantMood) }]} />
                    <ThemedText style={[styles.metaText, colors && { color: colors.cardTextSecondary }]}>{dominantMood}</ThemedText>
                    <ThemedText style={[styles.metaText, colors && { color: colors.cardTextSecondary }]}>• {captureCount} captures</ThemedText>
                </View>
            </View>

            {/* Image Grid */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageScroll}>
                <View style={styles.imageGrid}>
                    {dayCaptures.filter(c => c.image_url).slice(0, 6).map((capture) => (
                        <View key={capture.id} style={styles.imageWrapper}>
                            <Image
                                source={{ uri: capture.image_url }}
                                style={styles.captureImage}
                                contentFit="cover"
                            />
                        </View>
                    ))}
                </View>
            </ScrollView>

            {/* Mood Flow Bar */}
            {flowData && flowData.segments.length > 0 && (
                <View style={styles.moodFlowWrapper}>
                    <MoodFlow moodFlow={flowData.segments} />
                </View>
            )}
        </View>
    );
}

function MonthHeader({ date, onChange }: { date: Date; onChange: (dir: "prev" | "next") => void }) {
    const label = date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    return (
        <View style={styles.floatingScrim}>
            <BlurView intensity={20} tint="dark" style={styles.blurContainer}>
                <View style={styles.headerCard}>
                    <TouchableOpacity style={styles.navBtn} onPress={() => onChange("prev")}>
                        <Ionicons name="chevron-back" size={28} color={Colors.obsy.silver} />
                    </TouchableOpacity>
                    <ThemedText type="defaultSemiBold" style={styles.headerTitle}>
                        {label}
                    </ThemedText>
                    <TouchableOpacity style={styles.navBtn} onPress={() => onChange("next")}>
                        <Ionicons name="chevron-forward" size={28} color={Colors.obsy.silver} />
                    </TouchableOpacity>
                </View>
            </BlurView>
        </View>
    );
}

function getCalendarDays(date: Date): number[] {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: number[] = [];

    for (let i = 0; i < firstDay; i++) {
        cells.push(0);
    }
    for (let d = 1; d <= daysInMonth; d++) {
        cells.push(d);
    }
    while (cells.length % 7 !== 0) {
        cells.push(0);
    }
    return cells;
}

const daySize = 44;

const styles = StyleSheet.create({
    stack: {
        gap: 0,
    },
    floatingScrim: {
        marginHorizontal: 16,
        marginBottom: 24,
        overflow: "hidden",
        borderRadius: 24,
    },
    blurContainer: {
        padding: 2,
    },
    headerCard: {
        padding: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    headerTitle: {
        color: Colors.obsy.silver,
        fontSize: 26,
    },
    navBtn: {
        padding: 8,
    },
    summaryCard: {
        padding: 20,
        marginBottom: 24,
    },
    summaryHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: 16,
        gap: 12,
    },
    titleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    title: {
        fontSize: 32,
        lineHeight: 36,
        color: Colors.obsy.silver,
        fontWeight: "700",
    },
    asOfText: {
        fontSize: 12,
        color: Colors.obsy.silver,
        opacity: 0.6,
        marginTop: 8,
    },
    refreshBtn: {
        padding: 8,
        borderRadius: 20,
        backgroundColor: "rgba(255,255,255,0.05)",
    },
    generatePill: {
        backgroundColor: Colors.obsy.silver,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        minWidth: 80,
        alignItems: "center",
    },
    generatePillText: {
        color: "#0f0f0f",
        fontSize: 12,
        fontWeight: "600",
    },
    lockedContainer: {
        alignItems: "flex-end",
    },
    lockedText: {
        fontSize: 12,
        color: Colors.obsy.silver,
        opacity: 0.5,
    },
    progressText: {
        fontSize: 10,
        color: Colors.obsy.silver,
        opacity: 0.4,
        marginTop: 2,
    },
    summaryBody: {
        marginBottom: 16,
    },
    summaryText: {
        fontSize: 16,
        lineHeight: 24,
        color: "#fff",
    },
    placeholder: {
        color: Colors.obsy.silver,
        opacity: 0.4,
        fontSize: 15,
        fontStyle: "italic",
    },
    summaryFooter: {
        flexDirection: "row",
        justifyContent: "flex-end",
    },
    ringContainer: {
        padding: 24,
        alignItems: "center",
    },
    calendarContainer: {
        paddingHorizontal: 16,
        marginBottom: 24,
    },
    weekdayRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 8,
    },
    weekday: {
        color: "rgba(255,255,255,0.4)",
        width: daySize,
        textAlign: "center",
        fontSize: 12,
    },
    daysGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    dayCell: {
        width: daySize,
        height: daySize,
        borderRadius: 12,
        backgroundColor: "rgba(255,255,255,0.05)",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        borderWidth: 1,
        borderColor: "transparent",
    },
    emptyCell: {
        backgroundColor: "transparent",
        borderColor: "transparent",
    },
    dayNumber: {
        fontSize: 14,
        color: Colors.obsy.silver,
        opacity: 0.8,
    },
    moodDotIndicator: {
        width: 4,
        height: 4,
        borderRadius: 2,
    },
    selectedDayPanel: {
        padding: 20,
        marginTop: 8,
        borderTopWidth: 1,
        borderTopColor: "rgba(255,255,255,0.1)",
    },
    selectedDayHeader: {
        gap: 4,
        marginBottom: 16,
    },
    selectedDayTitle: {
        color: "#fff",
        fontSize: 18,
    },
    selectedDayMeta: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    dominantDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    metaText: {
        color: "rgba(255,255,255,0.6)",
        fontSize: 12,
    },
    imageScroll: {
        marginHorizontal: -20,
        paddingHorizontal: 20,
        marginBottom: 16,
    },
    imageGrid: {
        flexDirection: "row",
        gap: 8,
    },
    imageWrapper: {
        width: 80,
        height: 80,
        borderRadius: 12,
        overflow: "hidden",
    },
    captureImage: {
        width: "100%",
        height: "100%",
    },
    moodFlowWrapper: {
        marginTop: 8,
    },
});

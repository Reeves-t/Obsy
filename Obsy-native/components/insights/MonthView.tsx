import React, { useMemo, useRef, useState } from "react";
import { StyleSheet, TouchableOpacity, View, ScrollView, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { ThemedText } from "@/components/ui/ThemedText";
import { MoodFlow } from "@/components/insights/MoodFlow";
import { SkiaMoodRing } from "@/components/insights/ring/SkiaMoodRing";
import { InsightReaderOverlay, OriginRect } from "@/components/insights/InsightReaderOverlay";
import { CalendarModeToggle } from "@/components/insights/CalendarModeToggle";
import Colors from "@/constants/Colors";
import { Capture } from "@/types/capture";
import { DailyMoodFlowData, filterCapturesForDate, formatDateKey } from "@/lib/dailyMoodFlows";
import { getMoodTheme } from "@/lib/moods";
import { computeMoodDistribution, hexToRgba } from "@/lib/moodDistribution";
import { CalendarDisplayMode, useCalendarModeStore } from "@/lib/calendarModeStore";
import { archiveInsightWithResult, fetchArchives, ARCHIVE_ERROR_CODES } from "@/services/archive";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import * as Haptics from "expo-haptics";
import { useObsyTheme } from "@/contexts/ThemeContext";
import { useTranslatedInsight } from '@/hooks/useTranslatedInsight';

interface MonthViewProps {
    currentMonth: Date;
    onMonthChange: (direction: "prev" | "next") => void;
    text: string | null;
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
    text,
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

    // Full-screen insight reader, morphing out of the ring's measured position
    const ringRef = useRef<View>(null);
    const [readerVisible, setReaderVisible] = useState(false);
    const [originRect, setOriginRect] = useState<OriginRect | null>(null);

    const openReader = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const node = ringRef.current;
        if (!node) {
            setReaderVisible(true);
            return;
        }
        node.measureInWindow((x, y, width, height) => {
            setOriginRect({ x, y, width, height });
            setReaderVisible(true);
        });
    };

    // Check if insight is already saved when component mounts or dependencies change
    React.useEffect(() => {
        const checkSaved = async () => {
            if (!user || !text) return;
            const archives = await fetchArchives(user.id);
            const dateStr = format(currentMonth, "yyyy-MM");
            const saved = archives.some(a => a.type === 'monthly' && a.date_scope === dateStr);
            setIsSaved(saved);
        };
        checkSaved();
    }, [user?.id, text, currentMonth.getTime()]);

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
            const result = await archiveInsightWithResult({
                userId: user.id,
                type: 'monthly',
                insightText: text,
                relatedCaptureIds: [],
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

    const monthlyMoodIds = useMemo(() => {
        return Object.values(dailyFlows)
            .map((flow) => flow.dominantId || flow.dominant)
            .filter((value): value is string => !!value);
    }, [dailyFlows]);

    const monthKey = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;
    const translatedText = useTranslatedInsight({ insightId: `monthly-${monthKey}`, sourceText: text, sourceLanguage: 'en' });

    // Top two mood colors tint the reader's continuity ghost during the morph
    const ghostColors = useMemo<[string, string]>(() => {
        const distribution = computeMoodDistribution(dailyFlows, daysInMonth, {
            year: currentMonth.getFullYear(),
            month: currentMonth.getMonth(),
        });
        const first = distribution[0]?.color ?? '#3f3f46';
        return [first, distribution[1]?.color ?? first];
    }, [dailyFlows, daysInMonth, currentMonth]);


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

            {/* Mood ring — floats on the background; tap to open the full-screen reader */}
            <View style={styles.ringContainer}>
                <View ref={ringRef} collapsable={false}>
                    <SkiaMoodRing
                        dailyFlows={dailyFlows}
                        daysInMonth={daysInMonth}
                        monthYear={{ year: currentMonth.getFullYear(), month: currentMonth.getMonth() }}
                        monthPhrase={monthPhrase}
                        isEligible={isEligibleForInsight}
                        showCenterMoodOrbs={!text}
                        centerMoodOrbIds={monthlyMoodIds}
                        onPress={openReader}
                    />
                </View>
            </View>

            <InsightReaderOverlay
                visible={readerVisible}
                originRect={originRect}
                monthPhrase={monthPhrase}
                aiReasoning={aiReasoning}
                text={translatedText}
                isEligible={isEligibleForInsight}
                isGenerating={isGenerating}
                onGenerate={onGenerate}
                pendingCount={pendingCount}
                isSaved={isSaved}
                saving={saving}
                onSave={handleSave}
                onClose={() => setReaderVisible(false)}
                ghostColors={ghostColors}
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

    const mode = useCalendarModeStore((s) => s.mode);
    const setMode = useCalendarModeStore((s) => s.setMode);

    const maxCaptures = useMemo(() => {
        let max = 1;
        for (const flow of Object.values(dailyFlows)) {
            if (flow.totalCaptures > max) max = flow.totalCaptures;
        }
        return max;
    }, [dailyFlows]);

    const getDateKeyForDay = (day: number): string => {
        const m = String(monthNum + 1).padStart(2, "0");
        const d = String(day).padStart(2, "0");
        return `${year}-${m}-${d}`;
    };

    return (
        <View style={styles.calendarContainer}>
            <View style={styles.calendarToolbar}>
                <CalendarModeToggle mode={mode} onChange={setMode} />
            </View>
            <View style={styles.weekdayRow}>
                {["S", "M", "T", "W", "T", "F", "S"].map((d, idx) => (
                    <ThemedText key={`weekday-${idx}`} style={[styles.weekday, colors && { color: colors.cardTextSecondary }]}>
                        {d}
                    </ThemedText>
                ))}
            </View>
            <View style={styles.daysGrid}>
                {days.map((day, idx) => (
                    <DayCell
                        key={idx}
                        day={day}
                        mode={mode}
                        flowData={day > 0 ? dailyFlows[getDateKeyForDay(day)] ?? null : null}
                        isSelected={selectedDay === day && day > 0}
                        isLight={isLight}
                        colors={colors}
                        maxCaptures={maxCaptures}
                        onSelect={onSelectDay}
                    />
                ))}
            </View>
        </View>
    );
}

// GitHub-style capture-count buckets for the activity heatmap
function activityLevel(captureCount: number): number {
    if (captureCount <= 0) return 0;
    if (captureCount === 1) return 1;
    if (captureCount <= 3) return 2;
    if (captureCount <= 6) return 3;
    return 4;
}

const ACTIVITY_ALPHAS_DARK = [0.05, 0.12, 0.22, 0.34, 0.5];
const ACTIVITY_ALPHAS_LIGHT = [0.05, 0.1, 0.18, 0.28, 0.4];

const DayCell = React.memo(function DayCell({
    day,
    mode,
    flowData,
    isSelected,
    isLight,
    colors,
    maxCaptures,
    onSelect,
}: {
    day: number;
    mode: CalendarDisplayMode;
    flowData: DailyMoodFlowData | null;
    isSelected: boolean;
    isLight?: boolean;
    colors?: { cardText: string; cardTextSecondary: string; };
    maxCaptures: number;
    onSelect: (day: number) => void;
}) {
    if (day === 0) {
        return <View style={[styles.dayCell, styles.emptyCell]} />;
    }

    const hasData = !!flowData && flowData.totalCaptures > 0;
    let cellBg = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
    if (mode === 'mood' && hasData) {
        const solid = getMoodTheme(flowData.dominantId || flowData.dominant).solid;
        const alpha = 0.18 + 0.55 * Math.min(1, flowData.totalCaptures / maxCaptures);
        cellBg = hexToRgba(solid, alpha);
    } else if (mode === 'activity') {
        const alphas = isLight ? ACTIVITY_ALPHAS_LIGHT : ACTIVITY_ALPHAS_DARK;
        const alpha = alphas[activityLevel(flowData?.totalCaptures ?? 0)];
        cellBg = isLight ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`;
    }

    return (
        <TouchableOpacity
            style={[
                styles.dayCell,
                { backgroundColor: cellBg },
                isSelected && { borderColor: isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)' },
            ]}
            onPress={() => onSelect(day)}
        >
            <ThemedText style={[styles.dayNumber, colors && { color: colors.cardText }]}>{day}</ThemedText>
            {mode === 'flow' && hasData && (
                <View style={styles.flowBar}>
                    {flowData.segments.slice(0, 4).map((segment, i) => (
                        <View
                            key={i}
                            style={{
                                flex: Math.max(segment.percentage, 1),
                                backgroundColor: segment.color || getMoodTheme(segment.moodId || segment.mood).solid,
                            }}
                        />
                    ))}
                </View>
            )}
        </TouchableOpacity>
    );
});

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
    const dominantMoodId = flowData?.dominantId || dominantMood;
    const captureCount = dayCaptures.length;

    return (
        <View style={[styles.selectedDayPanel, { borderTopColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)' }]}>
            <View style={styles.selectedDayHeader}>
                <ThemedText type="defaultSemiBold" style={[styles.selectedDayTitle, colors && { color: colors.cardText }]}>
                    {dateLabel}
                </ThemedText>
                <View style={styles.selectedDayMeta}>
                    <View style={[styles.dominantDot, { backgroundColor: getMoodTheme(dominantMoodId).solid }]} />
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
    ringContainer: {
        paddingVertical: 8,
        marginBottom: 24,
        alignItems: "center",
    },
    calendarContainer: {
        paddingHorizontal: 16,
        marginBottom: 24,
    },
    calendarToolbar: {
        flexDirection: "row",
        justifyContent: "flex-end",
        marginBottom: 10,
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
    flowBar: {
        position: "absolute",
        bottom: 6,
        left: "15%",
        right: "15%",
        height: 4,
        borderRadius: 2,
        overflow: "hidden",
        flexDirection: "row",
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

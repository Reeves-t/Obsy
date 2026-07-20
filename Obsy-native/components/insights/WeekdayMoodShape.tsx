import React, { memo, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/ui/ThemedText';
import Colors from '@/constants/Colors';
import type { Capture } from '@/types/capture';
import { useAiFreeMode } from '@/hooks/useAiFreeMode';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { callMoodSignalInterpretation, resolveMoodSignalTonePayload, type MoodSignalTonePayload } from '@/services/moodSignalClient';
import { supabase } from '@/lib/supabase';
import {
    buildMoodSignalInterpretationKey,
    loadMoodSignalInterpretation,
    saveMoodSignalInterpretation,
} from '@/lib/moodSignalInterpretationStore';
import {
    getWeekdayMoodShape,
    WEEKDAY_MOOD_OPTIONS,
    type WeekdayMoodKey,
    type WeekdayMoodShapeData,
} from '@/lib/weekdayMoodShape';
import { CHART_HEIGHT, WeekdayShapeChart } from '@/components/insights/WeekdayShapeChart';

interface WeekdayMoodShapeProps {
    captures: Capture[];
    flat?: boolean;
    toneId?: string;
}

function currentWeekdayKey(): WeekdayMoodKey {
    const today = new Date().getDay();
    return WEEKDAY_MOOD_OPTIONS.find((option) => option.jsDay === today)?.key ?? 'mon';
}

export const WeekdayMoodShape = memo(function WeekdayMoodShape({ captures, toneId }: WeekdayMoodShapeProps) {
    const { width: screenWidth } = useWindowDimensions();
    const { colors, isLight } = useObsyTheme();
    const { aiFreeMode } = useAiFreeMode();
    const [selectedWeekday, setSelectedWeekday] = useState<WeekdayMoodKey>(() => currentWeekdayKey());
    const [aiText, setAiText] = useState<string | null>(null);
    const [aiError, setAiError] = useState<string | null>(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const [savedContextLabel, setSavedContextLabel] = useState<string | null>(null);
    const [selectedMoodId, setSelectedMoodId] = useState<string | null>(null);
    const [tonePayload, setTonePayload] = useState<MoodSignalTonePayload | null>(null);

    const shapeData = useMemo(
        () => getWeekdayMoodShape(captures, selectedWeekday),
        [captures, selectedWeekday]
    );
    const chartWidth = Math.max(320, screenWidth - 40);
    const canUseAiInterpretation = !aiFreeMode && shapeData.hasEnoughData;
    const interpretationStorageKey = useMemo(() => {
        if (!userId || !tonePayload) return null;
        return buildMoodSignalInterpretationKey(userId, 'weekday_shape', `${selectedWeekday}:all_time:${tonePayload.toneKey}`);
    }, [selectedWeekday, tonePayload, userId]);
    const selectedMoodLabel = useMemo(() => {
        if (!selectedMoodId) return null;
        return shapeData.layers.find((layer) => layer.moodId === selectedMoodId)?.label ?? null;
    }, [selectedMoodId, shapeData.layers]);

    useEffect(() => {
        setSelectedMoodId(null);
    }, [selectedWeekday]);

    useEffect(() => {
        let mounted = true;
        supabase.auth.getUser().then(({ data }) => {
            if (mounted) setUserId(data.user?.id ?? null);
        });
        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        resolveMoodSignalTonePayload(toneId).then((payload) => {
            if (!cancelled) setTonePayload(payload);
        });
        return () => {
            cancelled = true;
        };
    }, [toneId]);

    useEffect(() => {
        let cancelled = false;

        setAiText(null);
        setAiError(null);
        setSavedContextLabel(null);

        if (!canUseAiInterpretation || !interpretationStorageKey) return;

        loadMoodSignalInterpretation(interpretationStorageKey).then((saved) => {
            if (cancelled || !saved) return;
            setAiText(saved.text);
            setSavedContextLabel(saved.contextLabel);
        });

        return () => {
            cancelled = true;
        };
    }, [canUseAiInterpretation, interpretationStorageKey]);

    const handleInterpret = async () => {
        if (!canUseAiInterpretation || aiLoading || !tonePayload) return;
        setAiLoading(true);
        setAiError(null);

        try {
            // The edge function only reads the first 7 time slices, so send the
            // most recent active months instead of the full (possibly empty-padded) span.
            const recentActiveBuckets = shapeData.buckets
                .filter((bucket) => bucket.totalCaptures > 0)
                .slice(-7);

            const response = await callMoodSignalInterpretation({
                kind: 'weekday_shape',
                range: 'all_time',
                rangeLabel: `${shapeData.weekdayLabel}s across months, all time`,
                weekdayLabel: shapeData.weekdayLabel,
                tone: tonePayload.tone,
                customTonePrompt: tonePayload.customTonePrompt,
                summary: shapeData.summary,
                moodWeights: shapeData.layers.map((layer) => ({
                    mood: layer.label,
                    moodId: layer.moodId,
                    color: layer.color,
                    count: layer.totalCount,
                    percentage: shapeData.summary.totalEntries > 0
                        ? (layer.totalCount / shapeData.summary.totalEntries) * 100
                        : 0,
                })),
                // `dayName` is the server's generic time-slice label; here it carries
                // month labels ("Mar '25"), rendered under "Time slice summaries".
                days: recentActiveBuckets.map((bucket) => ({
                    dayName: bucket.label,
                    totalCaptures: bucket.totalCaptures,
                    topMood: topMoodForBucket(bucket.moodCounts, shapeData),
                    dominance: bucket.totalCaptures > 0
                        ? Math.max(...Object.values(bucket.moodCounts)) / bucket.totalCaptures
                        : 0,
                    mixLevel: Object.keys(bucket.moodCounts).length > 2
                        ? 'highly_mixed'
                        : Object.keys(bucket.moodCounts).length > 1
                            ? 'blended'
                            : bucket.totalCaptures > 0
                                ? 'single'
                                : 'empty',
                    segments: shapeData.layers
                        .map((layer, index) => ({
                            mood: layer.label,
                            count: bucket.moodCounts[layer.moodId] ?? 0,
                            percentage: bucket.totalCaptures > 0
                                ? ((bucket.moodCounts[layer.moodId] ?? 0) / bucket.totalCaptures) * 100
                                : 0,
                            index,
                        }))
                        .filter((segment) => segment.count > 0)
                        .map(({ mood, count, percentage }) => ({ mood, count, percentage })),
                })),
            });

            if (!response.ok) {
                setAiError(response.error.message);
                return;
            }
            setAiText(response.text);
            setSavedContextLabel(`${shapeData.weekdayLabel} all time`);
            if (interpretationStorageKey) {
                await saveMoodSignalInterpretation(interpretationStorageKey, {
                    kind: 'weekday_shape',
                    key: `${selectedWeekday}:all_time:${tonePayload.toneKey}`,
                    text: response.text,
                    generatedAt: new Date().toISOString(),
                    contextLabel: `${shapeData.weekdayLabel} all time`,
                });
            }
        } catch (error: any) {
            setAiError(error?.message ?? 'Unable to interpret this shape right now.');
        } finally {
            setAiLoading(false);
        }
    };

    return (
        <View style={styles.wrapper}>
            <ThemedText style={[styles.subtitle, { color: colors.cardTextSecondary }]}>
                All-time mood shape by selected weekday.
            </ThemedText>

            <View style={[styles.selector, { backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)' }]}>
                {WEEKDAY_MOOD_OPTIONS.map((option) => {
                    const selected = option.key === selectedWeekday;
                    return (
                        <TouchableOpacity
                            key={option.key}
                            activeOpacity={0.84}
                            onPress={() => setSelectedWeekday(option.key)}
                            style={[
                                styles.dayChip,
                                selected && {
                                    backgroundColor: isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.15)',
                                },
                            ]}
                        >
                            <ThemedText style={[styles.dayChipText, { color: selected ? colors.text : colors.cardTextSecondary }]}>
                                {option.label}
                            </ThemedText>
                        </TouchableOpacity>
                    );
                })}
            </View>

            <View style={[styles.chartShell, { borderColor: isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.07)' }]}>
                {shapeData.hasEnoughData ? (
                    <WeekdayShapeChart
                        shapeData={shapeData}
                        chartWidth={chartWidth}
                        isLight={isLight}
                        selectedMoodId={selectedMoodId}
                        selectedMoodLabel={selectedMoodLabel}
                        onSelectMood={setSelectedMoodId}
                    />
                ) : (
                    <View style={styles.emptyState}>
                        <Ionicons name="analytics-outline" size={20} color={colors.cardTextSecondary} />
                        <ThemedText style={[styles.emptyText, { color: colors.cardTextSecondary }]}>
                            Log more {shapeData.weekdayLabel} moods to see this shape.
                        </ThemedText>
                    </View>
                )}
            </View>

            {shapeData.hasEnoughData ? (
                <View style={styles.statsGrid}>
                    <ShapeStat label="Entries" value={`${shapeData.summary.totalEntries}`} mutedColor={colors.cardTextSecondary} textColor={colors.cardText} />
                    <ShapeStat label="Logged days" value={`${shapeData.summary.activeDays}`} mutedColor={colors.cardTextSecondary} textColor={colors.cardText} />
                    <ShapeStat label="Dominant" value={shapeData.summary.dominantMood ?? '—'} mutedColor={colors.cardTextSecondary} textColor={colors.cardText} />
                    <ShapeStat label="Energy" value={shapeData.summary.energyLabel} mutedColor={colors.cardTextSecondary} textColor={colors.cardText} />
                    <ShapeStat label="Mood mix" value={shapeData.summary.mixLabel} mutedColor={colors.cardTextSecondary} textColor={colors.cardText} />
                    <ShapeStat label="Peak month" value={shapeData.summary.strongestDay ?? '—'} mutedColor={colors.cardTextSecondary} textColor={colors.cardText} />
                </View>
            ) : null}

            {canUseAiInterpretation ? (
                <View style={[styles.aiPanel, { borderColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)' }]}>
                    <View style={styles.aiPanelHeader}>
                        <View style={styles.aiTitleRow}>
                            <Ionicons name="sparkles-outline" size={14} color={colors.cardTextSecondary} />
                            <ThemedText style={[styles.aiTitle, { color: colors.cardTextSecondary }]}>
                                Weekday interpretation
                            </ThemedText>
                        </View>
                        <TouchableOpacity
                            onPress={handleInterpret}
                            disabled={aiLoading || !tonePayload}
                            activeOpacity={0.82}
                            style={[styles.aiButton, (aiLoading || !tonePayload) && styles.aiButtonDisabled]}
                        >
                            {aiLoading ? (
                                <ActivityIndicator size="small" color="#0A0A0A" />
                            ) : (
                                <ThemedText style={styles.aiButtonText}>
                                    {aiText ? 'Refresh' : 'Interpret shape'}
                                </ThemedText>
                            )}
                        </TouchableOpacity>
                    </View>

                    {aiText ? (
                        <View style={styles.aiTextBlock}>
                            <ThemedText style={[styles.aiText, { color: colors.cardText }]}>
                                {aiText}
                            </ThemedText>
                            <ThemedText style={[styles.aiContext, { color: colors.cardTextSecondary }]}>
                                Generated for {savedContextLabel ?? `${shapeData.weekdayLabel} all time`}
                            </ThemedText>
                        </View>
                    ) : aiError ? (
                        <ThemedText style={styles.aiError}>{aiError}</ThemedText>
                    ) : (
                        <ThemedText style={[styles.aiHint, { color: colors.cardTextSecondary }]}>
                            Generate a short read on this weekday pattern.
                        </ThemedText>
                    )}
                </View>
            ) : null}
        </View>
    );
});

function topMoodForBucket(moodCounts: Record<string, number>, data: WeekdayMoodShapeData): string | null {
    const top = Object.entries(moodCounts).sort(([, a], [, b]) => b - a)[0];
    if (!top) return null;
    return data.layers.find((layer) => layer.moodId === top[0])?.label ?? null;
}

function ShapeStat({
    label,
    value,
    mutedColor,
    textColor,
}: {
    label: string;
    value: string;
    mutedColor: string;
    textColor: string;
}) {
    return (
        <View style={styles.statItem}>
            <ThemedText style={[styles.statLabel, { color: mutedColor }]} numberOfLines={1}>
                {label}
            </ThemedText>
            <ThemedText style={[styles.statValue, { color: textColor }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                {value}
            </ThemedText>
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        gap: 14,
    },
    subtitle: {
        fontSize: 13,
        marginTop: -4,
    },
    selector: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        borderRadius: 12,
        padding: 4,
    },
    dayChip: {
        flexGrow: 1,
        alignItems: 'center',
        borderRadius: 10,
        paddingHorizontal: 9,
        paddingVertical: 8,
        minWidth: 38,
    },
    dayChipText: {
        fontSize: 12,
        fontWeight: '700',
    },
    chartShell: {
        minHeight: CHART_HEIGHT,
        borderRadius: 16,
        borderWidth: 1,
        backgroundColor: 'rgba(255,255,255,0.025)',
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyState: {
        minHeight: CHART_HEIGHT,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingHorizontal: 24,
    },
    emptyText: {
        fontSize: 13,
        textAlign: 'center',
        lineHeight: 19,
    },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    statItem: {
        flexBasis: '48%',
        flexGrow: 1,
        minHeight: 58,
        justifyContent: 'center',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: 'rgba(255,255,255,0.045)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    statLabel: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 1.1,
        textTransform: 'uppercase',
    },
    statValue: {
        marginTop: 4,
        fontSize: 14,
        fontWeight: '700',
    },
    aiPanel: {
        gap: 10,
        borderRadius: 14,
        padding: 12,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
    },
    aiPanelHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },
    aiTitleRow: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    aiTitle: {
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 0.4,
    },
    aiButton: {
        minHeight: 34,
        minWidth: 108,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 999,
        paddingHorizontal: 12,
        backgroundColor: Colors.obsy.silver,
    },
    aiButtonDisabled: {
        opacity: 0.7,
    },
    aiButtonText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#0A0A0A',
    },
    aiText: {
        fontSize: 13,
        lineHeight: 19,
    },
    aiTextBlock: {
        gap: 6,
    },
    aiContext: {
        fontSize: 11,
        lineHeight: 15,
    },
    aiHint: {
        fontSize: 12.5,
        lineHeight: 18,
    },
    aiError: {
        fontSize: 12.5,
        lineHeight: 18,
        color: '#FF8A8A',
    },
});

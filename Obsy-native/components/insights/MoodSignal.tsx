import React, { useEffect, useMemo, memo, useState } from "react";
import { ActivityIndicator, StyleSheet, View, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { GlassCard } from "@/components/ui/GlassCard";
import { ThemedText } from "@/components/ui/ThemedText";
import Colors from "@/constants/Colors";
import { Capture } from "@/types/capture";
import { getMoodSignal, MoodSignalRange } from "@/lib/moodSignals";
import { useObsyTheme } from "@/contexts/ThemeContext";
import { useAiFreeMode } from "@/hooks/useAiFreeMode";
import { callMoodSignalInterpretation, resolveMoodSignalTonePayload, type MoodSignalTonePayload } from "@/services/moodSignalClient";
import { supabase } from "@/lib/supabase";
import {
    buildMoodSignalInterpretationKey,
    loadMoodSignalInterpretation,
    saveMoodSignalInterpretation,
} from "@/lib/moodSignalInterpretationStore";

// ─── Color helpers (pure JS, no deps) ────────────────────────────────────────
function shade(hex: string, amount: number): string {
    const h = hex.replace('#', '');
    if (h.length < 6) return hex;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const m = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 - amount))));
    return `rgb(${m(r)}, ${m(g)}, ${m(b)})`;
}
function lighten(hex: string, amount: number): string {
    const h = hex.replace('#', '');
    if (h.length < 6) return hex;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const m = (c: number) => Math.max(0, Math.min(255, Math.round(c + (255 - c) * amount)));
    return `rgb(${m(r)}, ${m(g)}, ${m(b)})`;
}

/** Convert any CSS color to a 6-char hex so shade/lighten can parse it. */
function toHex6(color: string): string {
    if (color.startsWith('#') && color.length === 7) return color;
    if (color.startsWith('#') && color.length === 4) {
        const [, r, g, b] = color;
        return `#${r}${r}${g}${g}${b}${b}`;
    }
    const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (m) {
        const hex = (n: number) => n.toString(16).padStart(2, '0');
        return `#${hex(+m[1])}${hex(+m[2])}${hex(+m[3])}`;
    }
    return '#888888'; // safe fallback for rgba with alpha / named colors
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface MoodSignalProps {
    captures: Capture[];
    flat?: boolean;
    toneId?: string;
}

const FILTERS: { key: MoodSignalRange; label: string }[] = [
    { key: 'this_week', label: 'This Week' },
    { key: 'last_week', label: 'Last Week' },
    { key: 'month', label: 'This Month' },
    { key: 'all_time', label: 'All Time' },
];

// ─── Bar3D ───────────────────────────────────────────────────────────────────
// Isometric box built from 3 layered <View>s:
//   front face (flat), right side (skewY -30°), top cap (skewX -60°).
// tan(60) = 1/tan(30) ensures the top cap lands exactly above the side face.

interface Bar3DProps {
    color: string;       // hex color of the bar
    gradientColors: [string, string, ...string[]];
    gradientLocations: [number, number, ...number[]];
    height: number;      // fill height in px
    trackHeight: number;
    width: number;
    depth: number;
    empty: boolean;
    isLight: boolean;
}

function asGradientTuple(colors: string[]): [string, string, ...string[]] {
    if (colors.length >= 2) return colors as [string, string, ...string[]];
    return ['#888888', '#666666'];
}

function Bar3D({ color, gradientColors, gradientLocations, height, trackHeight, width, depth, empty, isLight }: Bar3DProps) {
    const fillH = empty ? 0 : Math.max(height, 14);
    const baseY = trackHeight - fillH;

    const ISO_DEG = 30;
    const iso = depth * Math.tan((ISO_DEG * Math.PI) / 180);
    const TOP_SKEW = 60;

    const wrapW = width + depth;
    const wrapH = trackHeight + iso;

    const trackAlpha = isLight ? 0.06 : 0.04;
    const trackSideAlpha = isLight ? 0.04 : 0.025;
    const trackTopAlpha = isLight ? 0.08 : 0.06;

    const hex = toHex6(color);
    const frontColors = asGradientTuple(gradientColors);
    const topColors = asGradientTuple(gradientColors.map((c) => lighten(toHex6(c), 0.12)));
    const sideColors = asGradientTuple(gradientColors.map((c) => shade(toHex6(c), 0.34)));

    return (
        <View style={{ position: 'relative', width: wrapW, height: wrapH }}>
            {/* ─── Empty track (always behind the bar) ─── */}
            {/* Right side – pivot top-left so left edge stays flush with front face right edge */}
            <View style={{
                position: 'absolute', left: width, top: iso,
                width: depth, height: trackHeight,
                backgroundColor: isLight ? `rgba(0,0,0,${trackSideAlpha})` : `rgba(255,255,255,${trackSideAlpha})`,
                transform: [{ skewY: `-${ISO_DEG}deg` }],
                transformOrigin: 'top left',
            }} />
            {/* Top cap – pivot bottom-left so bottom edge stays flush with front face top edge */}
            <View style={{
                position: 'absolute', left: 0, top: 0,
                width, height: iso,
                backgroundColor: isLight ? `rgba(0,0,0,${trackTopAlpha})` : `rgba(255,255,255,${trackTopAlpha})`,
                transform: [{ skewX: `-${TOP_SKEW}deg` }],
                transformOrigin: 'bottom left',
            }} />
            <View style={{
                position: 'absolute', left: 0, top: iso,
                width, height: trackHeight,
                backgroundColor: isLight ? `rgba(0,0,0,${trackAlpha})` : `rgba(255,255,255,${trackAlpha})`,
                borderRadius: 4,
            }} />

            {/* ─── Filled bar ─── */}
            {!empty && (
                <>
                    {/* Right side face – pivot top-left */}
                    <View style={{
                        position: 'absolute', left: width, top: iso + baseY,
                        width: depth, height: fillH,
                        transform: [{ skewY: `-${ISO_DEG}deg` }],
                        transformOrigin: 'top left',
                        overflow: 'hidden',
                    }}>
                        <LinearGradient
                            colors={sideColors}
                            locations={gradientLocations as any}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={StyleSheet.absoluteFill}
                        />
                    </View>

                    {/* Top cap – pivot bottom-left */}
                    <View style={{
                        position: 'absolute', left: 0, top: baseY,
                        width, height: iso,
                        transform: [{ skewX: `-${TOP_SKEW}deg` }],
                        transformOrigin: 'bottom left',
                        overflow: 'hidden',
                    }}>
                        <LinearGradient
                            colors={topColors}
                            locations={gradientLocations as any}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={StyleSheet.absoluteFill}
                        />
                    </View>

                    {/* Front face */}
                    <View style={{
                        position: 'absolute', left: 0, top: iso + baseY,
                        width, height: fillH,
                        overflow: 'hidden',
                    }}>
                        <LinearGradient
                            colors={frontColors}
                            locations={gradientLocations as any}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={StyleSheet.absoluteFill}
                        />
                        {/* 1px top highlight */}
                        <View style={{
                            position: 'absolute', left: 0, right: 0, top: 0, height: 1,
                            backgroundColor: lighten(hex, 0.28),
                        }} />
                    </View>
                </>
            )}
        </View>
    );
}

// ─── FloorRunway ─────────────────────────────────────────────────────────────
// Colored parallelogram under each bar with the day name as a vertical letter stack.

interface FloorRunwayProps {
    color: string;
    gradientColors: [string, string, ...string[]];
    gradientLocations: [number, number, ...number[]];
    label: string;
    width: number;
    runwayDrop: number;
    depth: number;
    empty: boolean;
    isLight: boolean;
}

function FloorRunway({ color, gradientColors, gradientLocations, label, width, runwayDrop, depth, empty, isLight }: FloorRunwayProps) {
    const SLANT_DEG = 30;
    const hex = toHex6(empty ? (isLight ? '#b0b0b0' : '#1f1f24') : color);
    const floorColors = empty
        ? [shade(hex, 0.05), shade(hex, 0.32)] as [string, string]
        : asGradientTuple(gradientColors.map((c) => shade(toHex6(c), 0.18)));
    const skewShift = runwayDrop * Math.tan((SLANT_DEG * Math.PI) / 180);
    const letters = label.toUpperCase().split('');

    return (
        <View style={{ position: 'relative', width: width + depth, height: runwayDrop, overflow: 'visible' }}>
            {/* Parallelogram floor tile – pivot top-left so top edge aligns with bar bottom */}
            <View style={{
                position: 'absolute', left: 0, top: 0,
                width, height: runwayDrop,
                transform: [{ skewX: `-${SLANT_DEG}deg` }],
                transformOrigin: 'top left',
                opacity: empty ? 0.65 : 1,
                overflow: 'hidden',
            }}>
                <LinearGradient
                    colors={floorColors}
                    locations={(empty ? [0, 1] : gradientLocations) as any}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                />
                {!empty && (
                    <View style={{
                        position: 'absolute', left: 0, right: 0, top: 0, height: 1,
                        backgroundColor: lighten(hex, 0.15),
                    }} />
                )}
            </View>

            {/* Vertical day label – centered on the parallelogram's visual centroid.
               With transformOrigin 'top left', top edge stays put and bottom edge
               shifts left by skewShift, so the centroid x = (width - skewShift) / 2. */}
            <View style={{
                position: 'absolute',
                left: (width - skewShift) / 2,
                top: runwayDrop / 2,
                transform: [
                    { translateX: -4 },
                    { translateY: -(letters.length * 12) / 2 },
                ],
                alignItems: 'center',
            }} pointerEvents="none">
                {letters.map((ch, i) => (
                    <ThemedText key={i} style={{
                        fontSize: 11,
                        fontWeight: '800',
                        lineHeight: 12,
                        color: empty
                            ? (isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.55)')
                            : (isLight ? 'rgba(0,0,0,0.85)' : '#fff'),
                        textShadowColor: empty ? 'transparent' : 'rgba(0,0,0,0.5)',
                        textShadowOffset: { width: 0, height: 1 },
                        textShadowRadius: 1,
                    }}>{ch}</ThemedText>
                ))}
            </View>
        </View>
    );
}

// ─── Main component ──────────────────────────────────────────────────────────

const BAR_WIDTH = 28;
const BAR_DEPTH = 14;
const TRACK_HEIGHT = 160;
const RUNWAY_DROP = 48;

export const MoodSignal = memo(function MoodSignal({ captures, flat = false, toneId }: MoodSignalProps) {
    const { colors, isLight } = useObsyTheme();
    const { aiFreeMode } = useAiFreeMode();
    const [selectedRange, setSelectedRange] = useState<MoodSignalRange>('this_week');
    const [aiText, setAiText] = useState<string | null>(null);
    const [aiError, setAiError] = useState<string | null>(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const [savedContextLabel, setSavedContextLabel] = useState<string | null>(null);
    const [tonePayload, setTonePayload] = useState<MoodSignalTonePayload | null>(null);
    const signalData = useMemo(() => getMoodSignal(captures, selectedRange), [captures, selectedRange]);

    const topMoods = useMemo(() => signalData.moodWeights.slice(0, 5), [signalData.moodWeights]);
    const extraMoodsCount = signalData.totalMoodsCount - topMoods.length;
    const canUseAiInterpretation = !aiFreeMode && signalData.hasEnoughData;
    const rangeLabel = FILTERS.find((filter) => filter.key === selectedRange)?.label ?? 'This Week';
    const interpretationStorageKey = useMemo(() => {
        if (!userId || !tonePayload) return null;
        return buildMoodSignalInterpretationKey(userId, 'weekly_signal', `${signalData.rangeContext.cacheKey}:${tonePayload.toneKey}`);
    }, [signalData.rangeContext.cacheKey, tonePayload, userId]);

    const ISO_DEG = 30;
    const iso = BAR_DEPTH * Math.tan((ISO_DEG * Math.PI) / 180);

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

    const handleInterpretSignal = async () => {
        if (!canUseAiInterpretation || aiLoading || !tonePayload) return;

        setAiLoading(true);
        setAiError(null);
        try {
            const response = await callMoodSignalInterpretation({
                kind: 'weekly_signal',
                range: selectedRange,
                rangeLabel,
                tone: tonePayload?.tone,
                customTonePrompt: tonePayload?.customTonePrompt,
                summary: signalData.summary,
                moodWeights: signalData.moodWeights,
                days: signalData.bars.map((bar) => ({
                    dayName: bar.dayName,
                    totalCaptures: bar.totalCaptures,
                    topMood: bar.topMood,
                    dominance: bar.dominance,
                    mixLevel: bar.mixLevel,
                    segments: bar.segments.map((segment) => ({
                        mood: segment.label,
                        count: segment.count,
                        percentage: segment.percentage,
                    })),
                })),
            });

            if (!response.ok) {
                setAiError(response.error.message);
                return;
            }

            setAiText(response.text);
            setSavedContextLabel(signalData.rangeContext.displayLabel);
            if (interpretationStorageKey) {
                await saveMoodSignalInterpretation(interpretationStorageKey, {
                    kind: 'weekly_signal',
                    key: `${signalData.rangeContext.cacheKey}:${tonePayload?.toneKey ?? 'tone:unknown'}`,
                    text: response.text,
                    generatedAt: new Date().toISOString(),
                    contextLabel: signalData.rangeContext.displayLabel,
                });
            }
        } catch (error: any) {
            setAiError(error?.message ?? 'Unable to interpret this signal right now.');
        } finally {
            setAiLoading(false);
        }
    };

    const content = (
        <View style={[styles.cardPadding, flat && styles.flatPadding]}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.titleRow}>
                    <Ionicons name="pulse-outline" size={18} color={colors.cardTextSecondary} />
                    <ThemedText type="defaultSemiBold" style={[styles.title, { color: colors.cardTextSecondary }]}>
                        Mood Signal
                    </ThemedText>
                </View>
                <ThemedText style={[styles.subtitle, { color: colors.cardTextSecondary }]}>Top moods of the day</ThemedText>
            </View>

            {/* Timeline filters */}
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

            {/* 3D Bar chart */}
            <View style={[styles.chartContainer, !signalData.hasEnoughData && { opacity: 0.3 }]}>
                {/* Bars row */}
                <View style={[styles.barsRow, { height: TRACK_HEIGHT + iso }]}>
                    {signalData.bars.map((day, idx) => {
                        const empty = day.totalCaptures === 0;
                        const fillHeight = empty ? 0 : Math.max(0.15, day.dominance) * TRACK_HEIGHT;
                        return (
                            <View key={`${day.dayName}-${idx}`} style={styles.cell}>
                                <Bar3D
                                    color={day.color}
                                    gradientColors={day.gradientColors}
                                    gradientLocations={day.gradientLocations}
                                    height={fillHeight}
                                    trackHeight={TRACK_HEIGHT}
                                    width={BAR_WIDTH}
                                    depth={BAR_DEPTH}
                                    empty={empty}
                                    isLight={isLight}
                                />
                            </View>
                        );
                    })}
                </View>

                {/* Floor runways */}
                <View style={[styles.floorRow, { height: RUNWAY_DROP }]}>
                    {signalData.bars.map((day, idx) => {
                        const empty = day.totalCaptures === 0;
                        return (
                            <View key={`floor-${day.dayName}-${idx}`} style={styles.cell}>
                                <FloorRunway
                                    color={day.color}
                                    gradientColors={day.gradientColors}
                                    gradientLocations={day.gradientLocations}
                                    label={day.dayName}
                                    width={BAR_WIDTH}
                                    runwayDrop={RUNWAY_DROP}
                                    depth={BAR_DEPTH}
                                    empty={empty}
                                    isLight={isLight}
                                />
                            </View>
                        );
                    })}
                </View>
            </View>

            {/* Divider */}
            <View style={[styles.divider, { backgroundColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)' }]} />

            {signalData.hasEnoughData ? (
                <View style={styles.statsGrid}>
                    <SignalStat label="Active days" value={`${signalData.summary.activeDays}`} mutedColor={colors.cardTextSecondary} textColor={colors.cardText} />
                    <SignalStat label="Mood mix" value={signalData.summary.mixLabel} mutedColor={colors.cardTextSecondary} textColor={colors.cardText} />
                    <SignalStat label="Dominant" value={signalData.summary.dominantMood ?? '—'} mutedColor={colors.cardTextSecondary} textColor={colors.cardText} />
                    <SignalStat
                        label={signalData.summary.mostBlendedDay ? 'Most blended' : 'Strongest'}
                        value={signalData.summary.mostBlendedDay ?? signalData.summary.strongestDay ?? '—'}
                        mutedColor={colors.cardTextSecondary}
                        textColor={colors.cardText}
                    />
                </View>
            ) : null}

            {/* Legend */}
            {signalData.hasEnoughData ? (
                <View style={styles.keyContainer}>
                    {topMoods.map((m) => (
                        <View key={m.moodId} style={styles.keyItem}>
                            <View style={[styles.keyDot, { backgroundColor: m.color }]} />
                            <ThemedText style={[styles.keyText, { color: colors.cardTextSecondary }]}>{m.mood}</ThemedText>
                        </View>
                    ))}
                    {extraMoodsCount > 0 && (
                        <ThemedText style={[styles.keyExtra, { color: colors.cardTextSecondary }]}>+{extraMoodsCount}</ThemedText>
                    )}
                </View>
            ) : null}

            {canUseAiInterpretation ? (
                <View style={[styles.aiPanel, { borderColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)' }]}>
                    <View style={styles.aiPanelHeader}>
                        <View style={styles.aiTitleRow}>
                            <Ionicons name="sparkles-outline" size={14} color={colors.cardTextSecondary} />
                            <ThemedText style={[styles.aiTitle, { color: colors.cardTextSecondary }]}>
                                Signal interpretation
                            </ThemedText>
                        </View>
                        <TouchableOpacity
                            onPress={handleInterpretSignal}
                            disabled={aiLoading || !tonePayload}
                            activeOpacity={0.82}
                            style={[styles.aiButton, (aiLoading || !tonePayload) && styles.aiButtonDisabled]}
                        >
                            {aiLoading ? (
                                <ActivityIndicator size="small" color="#0A0A0A" />
                            ) : (
                                <ThemedText style={styles.aiButtonText}>
                                    {aiText ? 'Refresh' : 'Interpret signal'}
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
                                Generated for {savedContextLabel ?? signalData.rangeContext.displayLabel}
                            </ThemedText>
                        </View>
                    ) : aiError ? (
                        <ThemedText style={styles.aiError}>
                            {aiError}
                        </ThemedText>
                    ) : (
                        <ThemedText style={[styles.aiHint, { color: colors.cardTextSecondary }]}>
                            Generate a short read on the pattern above.
                        </ThemedText>
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

function SignalStat({
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

// ─── Styles ──────────────────────────────────────────────────────────────────

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
    chartContainer: {
        paddingHorizontal: 2,
        paddingBottom: 4,
    },
    barsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
    },
    floorRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    cell: {
        flex: 1,
        alignItems: 'center',
    },
    divider: {
        height: 1,
        width: '100%',
        marginTop: -4,
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

import React, { useMemo, memo, useState } from "react";
import { StyleSheet, View, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { GlassCard } from "@/components/ui/GlassCard";
import { ThemedText } from "@/components/ui/ThemedText";
import Colors from "@/constants/Colors";
import { Capture } from "@/types/capture";
import { getMoodSignal, MoodSignalRange } from "@/lib/moodSignals";
import { useObsyTheme } from "@/contexts/ThemeContext";

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
    height: number;      // fill height in px
    trackHeight: number;
    width: number;
    depth: number;
    empty: boolean;
    isLight: boolean;
}

function Bar3D({ color, height, trackHeight, width, depth, empty, isLight }: Bar3DProps) {
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
                            colors={[shade(hex, 0.28), shade(hex, 0.5)]}
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
                            colors={[lighten(hex, 0.22), lighten(hex, 0.05)]}
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
                            colors={[hex, shade(hex, 0.18)]}
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
    label: string;
    width: number;
    runwayDrop: number;
    depth: number;
    empty: boolean;
    isLight: boolean;
}

function FloorRunway({ color, label, width, runwayDrop, depth, empty, isLight }: FloorRunwayProps) {
    const SLANT_DEG = 30;
    const hex = toHex6(empty ? (isLight ? '#b0b0b0' : '#1f1f24') : color);
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
                    colors={[shade(hex, 0.05), shade(hex, 0.32)]}
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

export const MoodSignal = memo(function MoodSignal({ captures, flat = false }: MoodSignalProps) {
    const { colors, isLight } = useObsyTheme();
    const [selectedRange, setSelectedRange] = useState<MoodSignalRange>('this_week');
    const signalData = useMemo(() => getMoodSignal(captures, selectedRange), [captures, selectedRange]);

    const topMoods = useMemo(() => signalData.moodWeights.slice(0, 5), [signalData.moodWeights]);
    const extraMoodsCount = signalData.totalMoodsCount - topMoods.length;

    const ISO_DEG = 30;
    const iso = BAR_DEPTH * Math.tan((ISO_DEG * Math.PI) / 180);

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

            {/* Legend */}
            {signalData.hasEnoughData ? (
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
        </View>
    );

    if (flat) return content;

    return (
        <GlassCard noPadding>
            {content}
        </GlassCard>
    );
});

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
});

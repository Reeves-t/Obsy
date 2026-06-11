import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, Dimensions } from "react-native";
import Svg, { Path, G } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import Animated, { useSharedValue, useAnimatedStyle, withSpring, interpolate, Extrapolation } from "react-native-reanimated";
import { ThemedText } from "@/components/ui/ThemedText";
import { getMoodTheme } from "@/lib/moods";
import { DailyMoodFlowData } from "@/lib/dailyMoodFlows";
import { useObsyTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/i18n/config";
import { InsightMoodOrbField } from "./InsightMoodOrbField";
import { InsightText } from "./InsightText";
import { PendingInsightMessage } from "./PendingInsightMessage";
import { BookmarkButton } from "./BookmarkButton";

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const CIRCLE_SIZE = 270;
const CARD_WIDTH = SCREEN_WIDTH - 40;
const CARD_HEIGHT = Math.min(SCREEN_HEIGHT * 0.62, 520);

interface MoodRingDialProps {
    dailyFlows: Record<string, DailyMoodFlowData>;
    daysInMonth: number;
    monthYear: { year: number; month: number };
    monthPhrase?: string | null;
    /** Reasoning that explains WHY the monthPhrase title was chosen */
    aiReasoning?: string | null;
    /** Full monthly insight narrative (already translated). Shown inside the tap display. */
    text?: string | null;
    isEligible?: boolean;
    isGenerating?: boolean;
    onGenerate?: () => void;
    pendingCount?: number;
    isSaved?: boolean;
    saving?: boolean;
    onSave?: () => void;
    showCenterMoodOrbs?: boolean;
    centerMoodOrbIds?: string[];
}

/**
 * Convert polar coordinates to Cartesian
 */
function polarToCartesian(
    centerX: number,
    centerY: number,
    radius: number,
    angleInDegrees: number
): { x: number; y: number } {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
        x: centerX + radius * Math.cos(angleInRadians),
        y: centerY + radius * Math.sin(angleInRadians),
    };
}

/**
 * Generate SVG arc path
 */
function describeArc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number
): string {
    const start = polarToCartesian(x, y, radius, endAngle);
    const end = polarToCartesian(x, y, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

/**
 * Format date key for a specific day in month
 */
function getDateKeyForDay(year: number, month: number, day: number): string {
    const m = String(month + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    return `${year}-${m}-${d}`;
}

/**
 * Compute mood distribution from daily flows for the month
 * Uses full segment totals per mood (not just dominant) for accurate distribution
 */
function computeMoodDistribution(
    dailyFlows: Record<string, DailyMoodFlowData>,
    daysInMonth: number,
    monthYear: { year: number; month: number }
): Array<{ mood: string; percentage: number; color: string }> {
    const moodTotals: Record<string, number> = {};
    const moodColors: Record<string, string> = {};
    const moodLabels: Record<string, string> = {};
    let totalWeight = 0;

    // Aggregate by moodId (original ID) instead of descriptive name to avoid
    // splitting the same mood across multiple entries with different labels
    for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = getDateKeyForDay(monthYear.year, monthYear.month, day);
        const flowData = dailyFlows[dateKey];
        if (flowData && flowData.segments && flowData.segments.length > 0) {
            for (const segment of flowData.segments) {
                const weight = segment.percentage * flowData.totalCaptures / 100;
                // Use moodId as the aggregation key when available; fall back to mood name
                const key = segment.moodId || segment.mood;
                moodTotals[key] = (moodTotals[key] || 0) + weight;
                // Resolve color from the canonical theme using moodId
                if (!moodColors[key]) {
                    if (segment.moodId) {
                        moodColors[key] = getMoodTheme(segment.moodId).solid;
                    } else if (segment.color && HEX_COLOR_RE.test(segment.color)) {
                        moodColors[key] = segment.color;
                    }
                }
                if (!moodLabels[key]) {
                    moodLabels[key] = segment.mood;
                }
                totalWeight += weight;
            }
        }
    }

    if (totalWeight === 0) {
        return [{ mood: "neutral", percentage: 100, color: "#3f3f46" }];
    }

    const distribution = Object.entries(moodTotals)
        .map(([key, weight]) => {
            const color = (moodColors[key] && HEX_COLOR_RE.test(moodColors[key]))
                ? moodColors[key]
                : getMoodTheme(key).solid;
            return { mood: moodLabels[key] || key, percentage: (weight / totalWeight) * 100, color };
        })
        .sort((a, b) => b.percentage - a.percentage);

    return distribution;
}

const HEX_COLOR_RE = /^#?[0-9A-Fa-f]{6}$/;

/**
 * Ensure a color string is a valid 6-digit hex.
 * Returns the color if valid, otherwise a fallback.
 */
function safeHex(color: string | undefined, fallback = "#9CA3AF"): string {
    if (color && HEX_COLOR_RE.test(color)) return color.startsWith("#") ? color : `#${color}`;
    return fallback;
}

/**
 * Interpolate between two hex colors
 * @param color1 - Start color (hex)
 * @param color2 - End color (hex)
 * @param t - Interpolation factor (0-1)
 */
function interpolateColor(color1: string, color2: string, t: number): string {
    const c1 = safeHex(color1);
    const c2 = safeHex(color2);
    const hex1 = c1.replace("#", "");
    const hex2 = c2.replace("#", "");

    const r1 = parseInt(hex1.substring(0, 2), 16);
    const g1 = parseInt(hex1.substring(2, 4), 16);
    const b1 = parseInt(hex1.substring(4, 6), 16);

    const r2 = parseInt(hex2.substring(0, 2), 16);
    const g2 = parseInt(hex2.substring(2, 4), 16);
    const b2 = parseInt(hex2.substring(4, 6), 16);

    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);

    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export function MoodRingDial({
    dailyFlows,
    daysInMonth,
    monthYear,
    monthPhrase,
    aiReasoning,
    text,
    isEligible = true,
    isGenerating = false,
    onGenerate,
    pendingCount = 0,
    isSaved = false,
    saving = false,
    onSave,
    showCenterMoodOrbs = false,
    centerMoodOrbIds = [],
}: MoodRingDialProps) {
    const { colors, isLight } = useObsyTheme();
    const { t } = useI18n();
    const SIZE = CIRCLE_SIZE;
    const CENTER = SIZE / 2;
    const RADIUS = 105;
    const STROKE_WIDTH = 24;
    const SEGMENT_COUNT = 180; // Micro-segments for smooth gradient effect

    // Morph/Expand animation state. `isExpanded` mirrors the shared value on the
    // JS thread so we can toggle pointerEvents / gate the ScrollView per layer.
    const expanded = useSharedValue(0);
    const [isExpanded, setIsExpanded] = useState(false);

    const toggle = (next: boolean) => {
        setIsExpanded(next);
        expanded.value = withSpring(next ? 1 : 0, {
            damping: 18,
            stiffness: 90,
        });
    };

    // Container morph: Circle -> Rectangle
    const containerStyle = useAnimatedStyle(() => {
        return {
            width: interpolate(expanded.value, [0, 1], [CIRCLE_SIZE, CARD_WIDTH]),
            height: interpolate(expanded.value, [0, 1], [CIRCLE_SIZE, CARD_HEIGHT]),
            borderRadius: interpolate(expanded.value, [0, 1], [CIRCLE_SIZE / 2, 24]),
            transform: [
                { scale: interpolate(expanded.value, [0, 0.5, 1], [1, 0.98, 1]) }
            ],
        };
    });

    // Dial content: Fades OUT when expanding
    const dialContentStyle = useAnimatedStyle(() => {
        return {
            opacity: interpolate(expanded.value, [0, 0.3], [1, 0], Extrapolation.CLAMP),
            // No scale to avoid blur during transition
        };
    });

    // Text content: Fades IN when expanded
    const textContentStyle = useAnimatedStyle(() => {
        return {
            opacity: interpolate(expanded.value, [0.5, 1], [0, 1], Extrapolation.CLAMP),
            // No scale to avoid blur
        };
    });

    // Compute mood distribution for gradient
    const moodDistribution = useMemo(() => {
        return computeMoodDistribution(dailyFlows, daysInMonth, monthYear);
    }, [dailyFlows, daysInMonth, monthYear]);

    // Generate gradient segments with smooth color interpolation
    const gradientSegments = useMemo(() => {
        const segments: Array<{ path: string; color: string; opacity: number }> = [];
        const anglePerSegment = 360 / SEGMENT_COUNT;

        // Build cumulative distribution with midpoints for interpolation
        let cumulativePercentage = 0;
        const colorStops: Array<{ midPct: number; color: string }> = [];

        for (const item of moodDistribution) {
            const midPct = cumulativePercentage + item.percentage / 2;
            colorStops.push({
                midPct,
                color: item.color,
            });
            cumulativePercentage += item.percentage;
        }

        // If only one mood, use solid color
        if (colorStops.length <= 1) {
            const singleColor = colorStops.length === 1 ? colorStops[0].color : "#3f3f46";
            for (let i = 0; i < SEGMENT_COUNT; i++) {
                const startAngle = i * anglePerSegment;
                const endAngle = (i + 1) * anglePerSegment - 0.3;
                const path = describeArc(CENTER, CENTER, RADIUS, startAngle, endAngle);
                segments.push({ path, color: singleColor, opacity: 0.85 });
            }
            return segments;
        }

        // Generate micro-segments with interpolated colors between adjacent mood stops
        for (let i = 0; i < SEGMENT_COUNT; i++) {
            const startAngle = i * anglePerSegment;
            const endAngle = (i + 1) * anglePerSegment - 0.3; // Small gap
            const path = describeArc(CENTER, CENTER, RADIUS, startAngle, endAngle);

            // Map segment position to percentage around the ring
            const positionPct = (i / SEGMENT_COUNT) * 100;

            // Find the two adjacent color stops to interpolate between
            let prevStop = colorStops[colorStops.length - 1];
            let nextStop = colorStops[0];

            for (let j = 0; j < colorStops.length; j++) {
                const currentStop = colorStops[j];
                const nextIdx = (j + 1) % colorStops.length;
                const followingStop = colorStops[nextIdx];

                // Handle wraparound case
                let currentMid = currentStop.midPct;
                let followingMid = followingStop.midPct;
                if (followingMid < currentMid) {
                    followingMid += 100;
                }

                let adjustedPos = positionPct;
                if (adjustedPos < currentMid && j === colorStops.length - 1) {
                    adjustedPos += 100;
                }

                if (adjustedPos >= currentMid && adjustedPos < followingMid) {
                    prevStop = currentStop;
                    nextStop = followingStop;
                    break;
                }
            }

            // Calculate interpolation factor
            let prevMid = prevStop.midPct;
            let nextMid = nextStop.midPct;
            let adjustedPos = positionPct;

            // Handle wraparound
            if (nextMid < prevMid) {
                nextMid += 100;
                if (adjustedPos < prevMid) {
                    adjustedPos += 100;
                }
            }

            const range = nextMid - prevMid;
            const t = range > 0 ? Math.max(0, Math.min(1, (adjustedPos - prevMid) / range)) : 0;

            const segmentColor = interpolateColor(prevStop.color, nextStop.color, t);

            segments.push({
                path,
                color: segmentColor,
                opacity: 0.85,
            });
        }

        return segments;
    }, [moodDistribution, CENTER, RADIUS]);

    const collapsedSubtext = showCenterMoodOrbs
        ? (isEligible ? 'Tap to generate' : t('insight.unlockAfterWeekOne'))
        : 'Tap for details';

    return (
        <View style={styles.wrapper}>
            <Animated.View style={[styles.morphContainer, containerStyle]}>

                {/* STATE A: THE DIAL (fades out when expanding) */}
                <Animated.View
                    style={[styles.contentLayer, dialContentStyle]}
                    pointerEvents={isExpanded ? 'none' : 'auto'}
                >
                    <Pressable onPress={() => toggle(true)} style={styles.collapsedPressable}>
                        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
                            <G>
                                {gradientSegments.map((segment, index) => (
                                    <Path
                                        key={index}
                                        d={segment.path}
                                        stroke={segment.color}
                                        strokeWidth={STROKE_WIDTH}
                                        strokeLinecap="butt"
                                        fill="none"
                                        opacity={segment.opacity}
                                    />
                                ))}
                            </G>
                        </Svg>
                        {/* Center label - Month Phrase */}
                        <View style={styles.dialCenterLabel}>
                            {showCenterMoodOrbs ? (
                                <>
                                    <InsightMoodOrbField moodIds={centerMoodOrbIds} variant="tiny" maxOrbs={12} />
                                    <ThemedText style={[styles.monthSubtext, { color: colors.textSecondary }]}>{collapsedSubtext}</ThemedText>
                                </>
                            ) : monthPhrase ? (
                                <>
                                    <ThemedText style={[styles.monthPhraseText, { color: colors.text }]}>{monthPhrase}</ThemedText>
                                    <ThemedText style={[styles.monthSubtext, { color: colors.textSecondary }]}>{collapsedSubtext}</ThemedText>
                                </>
                            ) : (
                                <ThemedText style={[styles.placeholderText, { color: colors.textSecondary }]}>—</ThemedText>
                            )}
                        </View>
                    </Pressable>
                </Animated.View>

                {/* STATE B: THE TEXT DETAILS (fades in when expanded) - NO SCALE */}
                <Animated.View
                    style={[styles.contentLayer, textContentStyle]}
                    pointerEvents={isExpanded ? 'auto' : 'none'}
                >
                    <View style={styles.textContainer}>
                        <ThemedText style={[styles.headerText, { color: colors.text }]}>
                            Why "{monthPhrase || 'This Month'}"?
                        </ThemedText>
                        <View style={[styles.divider, { backgroundColor: isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.15)' }]} />

                        <ScrollView
                            style={styles.bodyScroll}
                            contentContainerStyle={styles.bodyScrollContent}
                            showsVerticalScrollIndicator={false}
                            scrollEnabled={isExpanded}
                        >
                            {/* The "why" — phrase reasoning */}
                            {aiReasoning ? (
                                <View style={styles.contentScroll}>
                                    <ThemedText style={[styles.bodyText, { color: colors.text }]}>
                                        {aiReasoning.split('\n')[0]}
                                    </ThemedText>
                                    <View style={styles.bulletContainer}>
                                        {aiReasoning
                                            .split('\n')
                                            .slice(1) // Skip the first line as it's the header summary
                                            .filter((line: string) => line.trim().length > 0)
                                            .map((line: string, index: number) => {
                                                const cleanLine = line.trim().replace(/^(-\s*|\x20*-\s*)/, '');
                                                return (
                                                    <ThemedText key={index} style={[styles.bulletText, { color: colors.text }]}>
                                                        - {cleanLine}
                                                    </ThemedText>
                                                );
                                            })}
                                    </View>
                                </View>
                            ) : null}

                            {pendingCount > 0 && (
                                <View style={styles.pendingWrap}>
                                    <PendingInsightMessage
                                        pendingCount={pendingCount}
                                        onRefresh={onGenerate ?? (() => { })}
                                        isRefreshing={isGenerating}
                                    />
                                </View>
                            )}

                            {/* The actual monthly insight narrative */}
                            {text ? (
                                <InsightText
                                    fallbackText={text}
                                    collapsedSentences={0}
                                    expandable={false}
                                    textStyle={[styles.bodyText, { color: colors.text }]}
                                />
                            ) : (
                                <ThemedText style={[styles.placeholderText, { color: colors.textSecondary }]}>
                                    {isEligible ? t('insight.createMonthly') : t('insight.keepCapturing')}
                                </ThemedText>
                            )}
                        </ScrollView>

                        {/* Action row: regenerate + save */}
                        <View style={styles.actionRow}>
                            {isEligible && onGenerate && (
                                <Pressable
                                    onPress={onGenerate}
                                    disabled={isGenerating}
                                    style={[
                                        styles.refreshPill,
                                        {
                                            backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)',
                                            borderColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)',
                                        },
                                    ]}
                                >
                                    {isGenerating ? (
                                        <ActivityIndicator size="small" color={colors.textSecondary} />
                                    ) : (
                                        <Ionicons name="refresh" size={14} color={colors.textSecondary} />
                                    )}
                                    <ThemedText style={[styles.refreshText, { color: colors.textSecondary }]}>
                                        {t('common.refresh')}
                                    </ThemedText>
                                </Pressable>
                            )}
                            {text && onSave && (
                                <BookmarkButton isSaved={isSaved} onPress={onSave} disabled={saving} />
                            )}
                        </View>

                        <Pressable onPress={() => toggle(false)}>
                            <ThemedText style={[styles.tapHint, { color: colors.textTertiary }]}>Tap to collapse</ThemedText>
                        </Pressable>
                    </View>
                </Animated.View>

            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: CIRCLE_SIZE + 24,
    },
    morphContainer: {
        backgroundColor: 'transparent',
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
    },
    contentLayer: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    collapsedPressable: {
        flex: 1,
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    dialCenterLabel: {
        position: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
    },
    monthPhraseText: {
        fontSize: 20,
        fontWeight: "700",
        textAlign: "center",
        letterSpacing: 0.5,
    },
    monthSubtext: {
        fontSize: 11,
        marginTop: 4,
        textTransform: "uppercase",
        letterSpacing: 1,
    },
    placeholderText: {
        fontSize: 14,
        textAlign: 'center',
    },
    textContainer: {
        paddingHorizontal: 8,
        paddingVertical: 20,
        width: '100%',
        height: '100%',
        justifyContent: 'flex-start',
    },
    headerText: {
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 12,
        textAlign: 'center',
    },
    divider: {
        height: 1,
        width: '40%',
        alignSelf: 'center',
        marginBottom: 16,
    },
    bodyScroll: {
        flex: 1,
        width: '100%',
    },
    bodyScrollContent: {
        paddingBottom: 8,
    },
    bodyText: {
        fontSize: 15,
        lineHeight: 22,
        textAlign: 'left',
        marginBottom: 16,
    },
    contentScroll: {
        width: '100%',
    },
    bulletContainer: {
        width: '100%',
    },
    bulletText: {
        fontSize: 15,
        lineHeight: 22,
        textAlign: 'left',
        marginBottom: 8,
    },
    pendingWrap: {
        marginBottom: 16,
    },
    actionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 12,
    },
    refreshPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
    },
    refreshText: {
        fontSize: 13,
        fontWeight: '600',
    },
    tapHint: {
        fontSize: 12,
        textAlign: 'center',
        paddingTop: 12,
    },
});


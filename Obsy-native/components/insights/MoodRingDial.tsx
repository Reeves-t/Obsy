import React, { useMemo } from "react";
import { StyleSheet, View, TouchableOpacity, Dimensions } from "react-native";
import Svg, { Path, G, Circle } from "react-native-svg";
import Animated, { useSharedValue, useAnimatedStyle, withSpring, interpolate, Extrapolation } from "react-native-reanimated";
import { ThemedText } from "@/components/ui/ThemedText";
import { getMoodColor, MOOD_COLOR_MAP } from "@/lib/moodColors";
import { DailyMoodFlowData } from "@/lib/dailyMoodFlows";
import { useObsyTheme } from "@/contexts/ThemeContext";

const SCREEN_WIDTH = Dimensions.get('window').width;
const CIRCLE_SIZE = 240;
const CARD_WIDTH = SCREEN_WIDTH - 40;
const CARD_HEIGHT = 320;

interface MoodRingDialProps {
    dailyFlows: Record<string, DailyMoodFlowData>;
    daysInMonth: number;
    monthYear: { year: number; month: number };
    monthPhrase?: string | null;
    /** Reasoning that explains WHY the monthPhrase title was chosen */
    aiReasoning?: string | null;
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
    let totalWeight = 0;

    // Sum all daily flow segment totals per mood (not just dominant)
    for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = getDateKeyForDay(monthYear.year, monthYear.month, day);
        const flowData = dailyFlows[dateKey];
        if (flowData && flowData.segments && flowData.segments.length > 0) {
            for (const segment of flowData.segments) {
                // Each segment has a mood and percentage - use percentage as weight
                const weight = segment.percentage * flowData.totalCaptures / 100;
                moodTotals[segment.mood] = (moodTotals[segment.mood] || 0) + weight;
                totalWeight += weight;
            }
        }
    }

    if (totalWeight === 0) {
        return [{ mood: "neutral", percentage: 100, color: "#3f3f46" }];
    }

    const distribution = Object.entries(moodTotals)
        .map(([mood, weight]) => ({
            mood,
            percentage: (weight / totalWeight) * 100,
            color: getMoodColor(mood),
        }))
        .sort((a, b) => b.percentage - a.percentage);

    return distribution;
}

/**
 * Interpolate between two hex colors
 * @param color1 - Start color (hex)
 * @param color2 - End color (hex)
 * @param t - Interpolation factor (0-1)
 */
function interpolateColor(color1: string, color2: string, t: number): string {
    const hex1 = color1.replace("#", "");
    const hex2 = color2.replace("#", "");

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
}: MoodRingDialProps) {
    const { colors, isLight } = useObsyTheme();
    const SIZE = CIRCLE_SIZE;
    const CENTER = SIZE / 2;
    const RADIUS = 90;
    const STROKE_WIDTH = 22;
    const SEGMENT_COUNT = 180; // Micro-segments for smooth gradient effect

    // Morph/Expand animation state
    const expanded = useSharedValue(0);

    const handlePress = () => {
        expanded.value = withSpring(expanded.value > 0.5 ? 0 : 1, {
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

    return (
        <View style={styles.wrapper}>
            <TouchableOpacity activeOpacity={1} onPress={handlePress}>
                <Animated.View style={[
                    styles.morphContainer,
                    containerStyle,
                    {
                        backgroundColor: isLight ? colors.cardBackground : '#121212',
                        borderColor: colors.cardBorder,
                    }
                ]}>

                    {/* STATE A: THE DIAL (fades out when expanding) */}
                    <Animated.View style={[styles.contentLayer, dialContentStyle]}>
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
                                {/* Center circle */}
                                <Circle cx={CENTER} cy={CENTER} r={RADIUS - STROKE_WIDTH - 8} fill="rgba(0,0,0,0.3)" />
                            </G>
                        </Svg>
                        {/* Center label - Month Phrase */}
                        <View style={styles.dialCenterLabel}>
                            {monthPhrase ? (
                                <>
                                    <ThemedText style={[styles.monthPhraseText, { color: colors.cardText }]}>{monthPhrase}</ThemedText>
                                    <ThemedText style={[styles.monthSubtext, { color: colors.cardTextSecondary }]}>Tap for details</ThemedText>
                                </>
                            ) : (
                                <ThemedText style={[styles.placeholderText, { color: colors.cardTextSecondary }]}>—</ThemedText>
                            )}
                        </View>
                    </Animated.View>

                    {/* STATE B: THE TEXT DETAILS (fades in when expanded) - NO SCALE */}
                    <Animated.View style={[styles.contentLayer, textContentStyle]}>
                        <View style={styles.textContainer}>
                            <ThemedText style={[styles.headerText, { color: colors.cardText }]}>
                                Why "{monthPhrase || 'This Month'}"?
                            </ThemedText>
                            <View style={styles.divider} />
                            {aiReasoning ? (
                                <View style={styles.contentScroll}>
                                    <ThemedText style={[styles.bodyText, { color: colors.cardText }]}>
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
                                                    <ThemedText key={index} style={[styles.bulletText, { color: colors.cardText }]}>
                                                        - {cleanLine}
                                                    </ThemedText>
                                                );
                                            })}
                                    </View>
                                </View>
                            ) : (
                                <ThemedText style={[styles.placeholderText, { color: colors.cardTextSecondary }]}>
                                    Reasoning will appear after generating the monthly insight.
                                </ThemedText>
                            )}
                            <ThemedText style={[styles.tapHint, { color: colors.cardTextSecondary }]}>Tap to collapse</ThemedText>
                        </View>
                    </Animated.View>

                </Animated.View>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: CARD_HEIGHT,
    },
    morphContainer: {
        backgroundColor: '#121212',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
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
    dialCenterLabel: {
        position: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
    },
    monthPhraseText: {
        color: "#fff",
        fontSize: 18,
        fontWeight: "700",
        textAlign: "center",
        letterSpacing: 0.5,
    },
    monthSubtext: {
        color: "rgba(255,255,255,0.5)",
        fontSize: 11,
        marginTop: 4,
        textTransform: "uppercase",
        letterSpacing: 1,
    },
    placeholderText: {
        color: "rgba(255,255,255,0.4)",
        fontSize: 14,
        textAlign: 'center',
    },
    textContainer: {
        padding: 24,
        width: '100%',
        height: '100%',
        justifyContent: 'flex-start',
    },
    headerText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 12,
        textAlign: 'center',
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.15)',
        width: '40%',
        alignSelf: 'center',
        marginBottom: 16,
    },
    bodyText: {
        color: 'rgba(255,255,255,0.85)',
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
        color: 'rgba(255,255,255,0.85)',
        fontSize: 15,
        lineHeight: 22,
        textAlign: 'left',
        marginBottom: 8,
    },
    tapHint: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 12,
        textAlign: 'center',
        marginTop: 'auto',
        paddingTop: 16,
    },
});


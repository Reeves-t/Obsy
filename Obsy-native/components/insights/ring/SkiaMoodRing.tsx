import React, { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Canvas, Fill, Shader, useClock } from "@shopify/react-native-skia";
import { useDerivedValue } from "react-native-reanimated";
import { ThemedText } from "@/components/ui/ThemedText";
import { DailyMoodFlowData } from "@/lib/dailyMoodFlows";
import { useObsyTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/i18n/config";
import { InsightMoodOrbField } from "../InsightMoodOrbField";
import {
    computeMoodDistribution,
    distributionToGradientStops,
} from "@/lib/moodDistribution";
import {
    MOOD_RING_EFFECT,
    RING_CANVAS_SIZE,
    RING_RADIUS,
    RING_STROKE,
} from "./moodRingShader";

interface SkiaMoodRingProps {
    dailyFlows: Record<string, DailyMoodFlowData>;
    daysInMonth: number;
    monthYear: { year: number; month: number };
    monthPhrase?: string | null;
    isEligible?: boolean;
    showCenterMoodOrbs?: boolean;
    centerMoodOrbIds?: string[];
    onPress: () => void;
}

// Keep the phrase clear of the thicker ring band
const CENTER_LABEL_MAX_WIDTH = (RING_RADIUS - RING_STROKE / 2) * 1.5;

export function SkiaMoodRing({
    dailyFlows,
    daysInMonth,
    monthYear,
    monthPhrase,
    isEligible = true,
    showCenterMoodOrbs = false,
    centerMoodOrbIds = [],
    onPress,
}: SkiaMoodRingProps) {
    const { colors, isLight } = useObsyTheme();
    const { t } = useI18n();
    const clock = useClock();

    const distribution = useMemo(
        () => computeMoodDistribution(dailyFlows, daysInMonth, monthYear),
        [dailyFlows, daysInMonth, monthYear]
    );
    const stops = useMemo(() => distributionToGradientStops(distribution), [distribution]);

    const uniforms = useDerivedValue(() => ({
        u_res: [RING_CANVAS_SIZE, RING_CANVAS_SIZE],
        u_time: clock.value / 1000,
        u_count: stops.count,
        u_colors: stops.colors,
        u_mids: stops.mids,
        u_light: isLight ? 1 : 0,
        u_flat: stops.count <= 1 ? 1 : 0,
    }));

    const collapsedSubtext = showCenterMoodOrbs
        ? (isEligible ? 'Tap to generate' : t('insight.unlockAfterWeekOne'))
        : 'Tap for details';

    return (
        <Pressable onPress={onPress} style={styles.wrapper}>
            {MOOD_RING_EFFECT ? (
                <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
                    <Fill>
                        <Shader source={MOOD_RING_EFFECT} uniforms={uniforms} />
                    </Fill>
                </Canvas>
            ) : (
                // Shader compilation should never fail in practice; keep the dial usable.
                <View
                    pointerEvents="none"
                    style={[styles.fallbackRing, { borderColor: distribution[0]?.color ?? '#3f3f46' }]}
                />
            )}
            <View style={styles.centerLabel} pointerEvents="none">
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
    );
}

const styles = StyleSheet.create({
    wrapper: {
        width: RING_CANVAS_SIZE,
        height: RING_CANVAS_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
    },
    fallbackRing: {
        position: 'absolute',
        top: RING_CANVAS_SIZE / 2 - RING_RADIUS - RING_STROKE / 2,
        left: RING_CANVAS_SIZE / 2 - RING_RADIUS - RING_STROKE / 2,
        width: RING_RADIUS * 2 + RING_STROKE,
        height: RING_RADIUS * 2 + RING_STROKE,
        borderRadius: RING_RADIUS + RING_STROKE / 2,
        borderWidth: RING_STROKE,
        opacity: 0.85,
    },
    centerLabel: {
        maxWidth: CENTER_LABEL_MAX_WIDTH,
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
});

import React, { memo, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GlassCard } from "@/components/ui/GlassCard";
import { ThemedText } from "@/components/ui/ThemedText";
import Colors from "@/constants/Colors";
import { Capture } from "@/lib/captureStore";
import { format } from "date-fns";
import { useObsyTheme } from "@/contexts/ThemeContext";

interface ChronotypeDialProps {
    captures: Capture[];
    totalEntries: number;
    flat?: boolean;
}

const DIAL_SIZE = 160;

export const ChronotypeDial = memo(function ChronotypeDial({ captures, totalEntries, flat = false }: ChronotypeDialProps) {
    const { isLight } = useObsyTheme();

    // 1. Filter captures for the Dial (Last 48 Hours)
    const dialCaptures = useMemo(() => {
        const fortyEightHoursAgo = new Date().getTime() - (48 * 60 * 60 * 1000);
        return captures.filter(c => new Date(c.created_at).getTime() >= fortyEightHoursAgo);
    }, [captures]);

    // 2. Filter captures for the Stats (Last 72 Hours)
    const rollingCaptures = useMemo(() => {
        const seventyTwoHoursAgo = new Date().getTime() - (72 * 60 * 60 * 1000);
        return captures.filter(c => new Date(c.created_at).getTime() >= seventyTwoHoursAgo);
    }, [captures]);

    // Map today's hourly counts for the dial (using dialCaptures which is 48h)
    const hourlyCounts = useMemo(() => {
        const counts: Record<number, number> = {};
        for (let i = 0; i < 24; i++) counts[i] = 0;
        dialCaptures.forEach(c => {
            const h = new Date(c.created_at).getHours();
            counts[h] = (counts[h] || 0) + 1;
        });
        return counts;
    }, [dialCaptures]);

    // Calculate Average Capture Time (72h)
    const avgTimeLabel = useMemo(() => {
        if (rollingCaptures.length === 0) return "--";
        const totalMinutes = rollingCaptures.reduce((acc, c) => {
            const date = new Date(c.created_at);
            return acc + date.getHours() * 60 + date.getMinutes();
        }, 0);
        const avgMinutes = totalMinutes / rollingCaptures.length;
        const avgHours = Math.floor(avgMinutes / 60);
        const avgMinsRemaining = Math.floor(avgMinutes % 60);

        const d = new Date();
        d.setHours(avgHours, avgMinsRemaining);
        return format(d, 'h:mm a');
    }, [rollingCaptures]);

    // Calculate Peak Hour Detail (72h)
    const peakHourDetail = useMemo(() => {
        const hourCounts: Record<number, number> = {};
        rollingCaptures.forEach(c => {
            const h = new Date(c.created_at).getHours();
            hourCounts[h] = (hourCounts[h] || 0) + 1;
        });
        const peak = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
        if (!peak) return "--";

        const hour = parseInt(peak[0]);
        const start = format(new Date().setHours(hour, 0), 'h a');
        const end = format(new Date().setHours(hour + 1, 0), 'h a');
        return `${start}-${end}`;
    }, [rollingCaptures]);

    // Calculate Lowest Activity Window (72h)
    const lowestWindow = useMemo(() => {
        if (rollingCaptures.length === 0) return "--";
        const hourCounts: Record<number, number> = {};
        for (let i = 0; i < 24; i++) hourCounts[i] = 0;
        rollingCaptures.forEach(c => {
            const h = new Date(c.created_at).getHours();
            hourCounts[h] = (hourCounts[h] || 0) + 1;
        });

        let minCount = Infinity;
        let startHour = 0;
        for (let i = 0; i < 24; i++) {
            const count = hourCounts[i] + hourCounts[(i + 1) % 24];
            if (count < minCount) {
                minCount = count;
                startHour = i;
            }
        }

        const start = format(new Date().setHours(startHour, 0), 'h a');
        const end = format(new Date().setHours((startHour + 2) % 24, 0), 'h a');
        return `${start}-${end}`;
    }, [rollingCaptures]);

    const content = (
        <View style={[styles.cardPadding, flat && styles.flatPadding]}>
            <View style={styles.header}>
                <View style={styles.titleRow}>
                    <Ionicons name="time-outline" size={18} color={isLight ? "rgba(0,0,0,0.5)" : Colors.obsy.silver} />
                    <ThemedText type="defaultSemiBold" style={[styles.title, isLight && { color: 'rgba(0,0,0,0.6)' }]}>
                        Routines
                    </ThemedText>
                </View>
                <ThemedText style={[styles.subtleText, isLight && { color: 'rgba(0,0,0,0.4)' }]}>{totalEntries} captures</ThemedText>
            </View>

            <View style={styles.body}>
                <View style={[styles.dial, isLight && { backgroundColor: 'rgba(0,0,0,0.02)', borderColor: 'rgba(0,0,0,0.08)' }]}>
                    {[...Array(24).keys()].map((hour) => {
                        const count = hourlyCounts[hour];
                        const angle = (hour / 24) * 360;

                        // Height by intensity - slightly thicker for 48h to show bulk
                        const height = count >= 6 ? 14 : (count >= 3 ? 10 : (count >= 1 ? 6 : 4));

                        // Yellow -> Orange scale
                        let tickColor = isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.12)";
                        if (count >= 6) tickColor = "#EA580C"; // Deep Orange
                        else if (count >= 3) tickColor = "#F97316"; // Orange
                        else if (count >= 1) tickColor = "#FBBF24"; // Yellow

                        return (
                            <View
                                key={hour}
                                style={[
                                    styles.tick,
                                    {
                                        height,
                                        backgroundColor: tickColor,
                                        marginTop: -height / 2,
                                        transform: [
                                            { rotate: `${angle}deg` },
                                            { translateY: -DIAL_SIZE / 2 + 12 },
                                        ],
                                    },
                                ]}
                            />
                        );
                    })}
                    <View style={[styles.dialCenter, isLight && { backgroundColor: 'rgba(0,0,0,0.03)', borderColor: 'rgba(0,0,0,0.06)' }]}>
                        <ThemedText style={[styles.centerLabel, isLight && { color: 'rgba(0,0,0,0.4)' }]}>48h</ThemedText>
                    </View>
                </View>

                <View style={styles.metrics}>
                    <View style={styles.statsHeader}>
                        <ThemedText style={[styles.statsBadge, isLight && { backgroundColor: 'rgba(0,0,0,0.05)', color: 'rgba(0,0,0,0.4)' }]}>72H RHYTHM</ThemedText>
                    </View>

                    <View style={styles.metricRow}>
                        <ThemedText style={[styles.metricLabel, isLight && { color: 'rgba(0,0,0,0.4)' }]}>Avg Time</ThemedText>
                        <ThemedText style={styles.metricValue}>{avgTimeLabel}</ThemedText>
                    </View>
                    <View style={styles.metricRow}>
                        <ThemedText style={[styles.metricLabel, isLight && { color: 'rgba(0,0,0,0.4)' }]}>Peak Hour</ThemedText>
                        <ThemedText style={styles.metricValue}>{peakHourDetail}</ThemedText>
                    </View>
                    <View style={styles.metricRow}>
                        <ThemedText style={[styles.metricLabel, isLight && { color: 'rgba(0,0,0,0.4)' }]}>Lowest</ThemedText>
                        <ThemedText style={[styles.metricValue, { color: isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)' }]}>{lowestWindow}</ThemedText>
                    </View>
                </View>
            </View>
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
        gap: 20,
    },
    flatPadding: {
        paddingHorizontal: 0,
        paddingVertical: 12,
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    titleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    title: {
        color: Colors.obsy.silver,
        fontSize: 16,
    },
    subtleText: {
        color: "rgba(255,255,255,0.4)",
        fontSize: 12,
    },
    body: {
        flexDirection: "row",
        gap: 24,
        alignItems: "center",
    },
    dial: {
        width: DIAL_SIZE,
        height: DIAL_SIZE,
        borderRadius: DIAL_SIZE / 2,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.06)",
        backgroundColor: "rgba(255,255,255,0.01)",
        justifyContent: "center",
        alignItems: "center",
        position: "relative",
    },
    tick: {
        position: "absolute",
        width: 3,
        borderRadius: 1.5,
        top: '50%',
        left: '50%',
        marginLeft: -1.5, // Center horizontal
        marginTop: 0, // Pivot around center
    },
    dialCenter: {
        width: 54,
        height: 54,
        borderRadius: 27,
        backgroundColor: "rgba(255,255,255,0.03)",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.06)",
    },
    centerLabel: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 12,
        fontWeight: "700",
        letterSpacing: 0.5,
    },
    metrics: {
        flex: 1,
        gap: 12,
    },
    statsHeader: {
        marginBottom: 4,
    },
    statsBadge: {
        fontSize: 10,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.25)',
        backgroundColor: 'rgba(255,255,255,0.04)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        alignSelf: 'flex-start',
        letterSpacing: 1,
    },
    metricRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    metricLabel: {
        color: "rgba(255,255,255,0.4)",
        fontSize: 12,
    },
    metricValue: {
        color: "#FBBF24", // Match dial yellow
        fontWeight: "600",
        fontSize: 14,
    },
});

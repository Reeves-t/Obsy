import React, { memo } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GlassCard } from "@/components/ui/GlassCard";
import { ThemedText } from "@/components/ui/ThemedText";
import Colors from "@/constants/Colors";

interface ObjectOfWeekProps {
    objectOfWeek?: string | null;
    flat?: boolean;
}

export const ObjectOfWeek = memo(function ObjectOfWeek({ objectOfWeek, flat = false }: ObjectOfWeekProps) {
    if (!objectOfWeek) return null;

    const content = (
        <View style={[styles.cardPadding, flat && styles.flatPadding]}>
            <View style={styles.header}>
                <Ionicons name="camera-outline" size={16} color={Colors.obsy.silver} />
                <ThemedText style={styles.label}>OBJECT OF THE WEEK</ThemedText>
            </View>
            <ThemedText style={styles.objectText}>{objectOfWeek}</ThemedText>
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
        padding: 20,
        gap: 8,
    },
    flatPadding: {
        paddingHorizontal: 0,
        paddingVertical: 12,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    label: {
        fontSize: 10,
        letterSpacing: 1,
        color: "rgba(255,255,255,0.6)",
    },
    objectText: {
        fontSize: 20,
        fontWeight: "600",
        color: "#fff",
    },
});

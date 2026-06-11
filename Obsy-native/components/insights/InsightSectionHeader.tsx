// InsightSectionHeader.tsx
// Shared header for on-background insight sections (Day in a Glance, Week in Review).
// Renders a leading accent icon + title + optional subline, with a refresh pill on the right.

import React from "react";
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemedText } from "@/components/ui/ThemedText";
import { useObsyTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/i18n/config";

type Props = {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    subline?: string;
    onRefresh?: () => void;
    isRefreshing?: boolean;
};

export function InsightSectionHeader({ icon, title, subline, onRefresh, isRefreshing = false }: Props) {
    const { colors, isLight } = useObsyTheme();
    const { t } = useI18n();

    return (
        <View style={styles.header}>
            <View style={styles.titleRow}>
                <Ionicons name={icon} size={18} color={colors.textSecondary} style={styles.icon} />
                <View style={styles.titleColumn}>
                    <ThemedText style={[styles.title, { color: colors.text }]}>{title}</ThemedText>
                    {!!subline && (
                        <ThemedText style={[styles.subline, { color: colors.textTertiary }]}>{subline}</ThemedText>
                    )}
                </View>
            </View>

            {onRefresh && (
                <TouchableOpacity
                    onPress={onRefresh}
                    disabled={isRefreshing}
                    style={[
                        styles.pill,
                        {
                            backgroundColor: isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.08)",
                            borderColor: isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.12)",
                        },
                    ]}
                >
                    {isRefreshing ? (
                        <ActivityIndicator size="small" color={colors.textSecondary} />
                    ) : (
                        <Ionicons name="refresh" size={14} color={colors.textSecondary} />
                    )}
                    <ThemedText style={[styles.pillText, { color: colors.textSecondary }]}>
                        {t("common.refresh")}
                    </ThemedText>
                </TouchableOpacity>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
    },
    titleRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 10,
        flexShrink: 1,
    },
    icon: {
        marginTop: 2,
    },
    titleColumn: {
        flexShrink: 1,
    },
    title: {
        fontSize: 18,
        fontWeight: "700",
    },
    subline: {
        fontSize: 11,
        marginTop: 2,
    },
    pill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
    },
    pillText: {
        fontSize: 13,
        fontWeight: "600",
    },
});

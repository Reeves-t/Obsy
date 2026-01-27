import React, { memo } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GlassCard } from "@/components/ui/GlassCard";
import { ThemedText } from "@/components/ui/ThemedText";
import Colors from "@/constants/Colors";
import { archiveInsightWithResult, fetchArchives, ARCHIVE_ERROR_CODES } from "@/services/archive";
import { BookmarkButton } from "@/components/insights/BookmarkButton";
import { useAuth } from "@/contexts/AuthContext";
import { useCaptureStore } from "@/lib/captureStore";
import * as Haptics from "expo-haptics";

interface TagReflectionsProps {
    tags: string[];
    onGenerateTagInsight: (tag: string) => void;
    generatedInsight: string | null;
    loading: boolean;
    onClose: () => void;
    flat?: boolean;
    onArchiveFull?: () => void;
}

export const TagReflections = memo(function TagReflections({
    tags,
    onGenerateTagInsight,
    generatedInsight,
    loading,
    onClose,
    flat = false,
    onArchiveFull,
}: TagReflectionsProps) {
    const { user } = useAuth();
    const { captures } = useCaptureStore();
    const [selectedTag, setSelectedTag] = React.useState<string | null>(null);
    const [isSaved, setIsSaved] = React.useState(false);
    const [saving, setSaving] = React.useState(false);

    // Track which tag was used for generation
    React.useEffect(() => {
        if (!generatedInsight) {
            setIsSaved(false);
        }
    }, [generatedInsight]);

    const handleTagPress = (tag: string) => {
        setSelectedTag(tag);
        onGenerateTagInsight(tag);
    };

    const handleSave = async () => {
        if (!user) {
            Alert.alert("Sign In Required", "Please sign in to save insights to your archive.");
            return;
        }
        if (!generatedInsight || !selectedTag || isSaved || saving) return;

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
                type: 'tagging',
                insightText: generatedInsight,
                relatedCaptureIds: captures.filter(c => c.tags?.includes(selectedTag)).map(c => c.id),
                date: new Date(),
                tagName: selectedTag,
                tags: [selectedTag]
            });

            if (result.data) {
                setIsSaved(true);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } else if (result.error) {
                console.error("[TagReflections] Archive error:", {
                    tag: selectedTag,
                    error: result.error,
                });

                const errorMessage = result.error.code === ARCHIVE_ERROR_CODES.RLS_VIOLATION
                    ? "You don't have permission to save this insight. Please try signing in again."
                    : "Failed to save tag insight. Please try again.";
                Alert.alert("Error", errorMessage);
            }
        } catch (error) {
            console.error("[TagReflections] Unexpected error saving insight:", error);
            Alert.alert("Error", "An unexpected error occurred. Please try again.");
        } finally {
            setSaving(false);
        }
    };
    const content = (
        <View style={[styles.cardPadding, flat && styles.flatPadding]}>
            <ThemedText style={styles.topDescriptiveText}>Tag photos to unlock quick, focused insights.</ThemedText>

            <View style={styles.header}>
                <View style={styles.titleRow}>
                    <Ionicons name="pricetag-outline" size={18} color={Colors.obsy.silver} />
                    <ThemedText type="defaultSemiBold" style={styles.title}>
                        Tag Reflections
                    </ThemedText>
                </View>
            </View>

            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.tagsRow}
            >
                {tags.map((tag) => (
                    <TouchableOpacity
                        key={tag}
                        style={styles.tagPill}
                        onPress={() => handleTagPress(tag)}
                        disabled={loading}
                    >
                        <ThemedText style={styles.tagText}>#{tag}</ThemedText>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {generatedInsight && (
                <View style={styles.insightCard}>
                    <View style={styles.insightHeader}>
                        <ThemedText style={styles.insightLabel}>Generated Insight</ThemedText>
                        <TouchableOpacity onPress={onClose}>
                            <Ionicons name="close" size={16} color={Colors.obsy.silver} />
                        </TouchableOpacity>
                    </View>
                    <ThemedText style={styles.insightText}>"{generatedInsight}"</ThemedText>
                    <View style={styles.insightFooter}>
                        <BookmarkButton
                            isSaved={isSaved}
                            onPress={handleSave}
                            disabled={saving}
                            size={18}
                        />
                    </View>
                </View>
            )}

            {loading && (
                <View style={styles.loadingRow}>
                    <ActivityIndicator size="small" color={Colors.obsy.silver} />
                    <ThemedText style={styles.loadingText}>Generating insight...</ThemedText>
                </View>
            )}
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
        gap: 16,
    },
    flatPadding: {
        paddingHorizontal: 0,
        paddingVertical: 12,
    },
    topDescriptiveText: {
        color: "rgba(255,255,255,0.5)",
        fontSize: 13,
        marginBottom: 4,
    },
    header: {
        gap: 4,
    },
    titleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    title: {
        color: Colors.obsy.silver,
    },
    tagsRow: {
        gap: 10,
    },
    tagPill: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 16,
        backgroundColor: "rgba(255,255,255,0.05)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.1)",
    },
    tagText: {
        color: "#fff",
        fontSize: 13,
    },
    insightCard: {
        backgroundColor: "rgba(0,0,0,0.2)",
        borderRadius: 14,
        padding: 14,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        gap: 6,
    },
    insightHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    insightLabel: {
        color: "rgba(255,255,255,0.7)",
        fontSize: 12,
    },
    insightText: {
        color: "rgba(255,255,255,0.9)",
        fontStyle: "italic",
        lineHeight: 20,
    },
    loadingRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    loadingText: {
        color: "rgba(255,255,255,0.6)",
    },
    insightFooter: {
        marginTop: 4,
        alignItems: 'flex-end',
        marginRight: -4,
    },
});

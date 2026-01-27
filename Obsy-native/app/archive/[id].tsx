import React, { useEffect, useState, useMemo } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { Image } from 'expo-image';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ThemedText } from '@/components/ui/ThemedText';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { fetchArchiveById } from '@/services/archive';
import { ArchiveInsight } from '@/types/insights';
import { useCaptureStore, Capture } from '@/lib/captureStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IMAGE_GAP = 10;
const CONTENT_PADDING = 20;

export default function ArchiveDetailScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id: string }>();
    const [insight, setInsight] = useState<ArchiveInsight | null>(null);
    const [loading, setLoading] = useState(true);
    const { captures } = useCaptureStore();

    useEffect(() => {
        loadInsight();
    }, [id]);

    const loadInsight = async () => {
        if (!id) return;
        setLoading(true);
        try {
            const data = await fetchArchiveById(id);
            setInsight(data);
        } catch (error) {
            console.error("Error loading insight detail:", error);
        } finally {
            setLoading(false);
        }
    };

    // Get related captures from store
    const relatedCaptures = useMemo(() => {
        if (!insight?.related_capture_ids || insight.related_capture_ids.length === 0) {
            return [];
        }
        return insight.related_capture_ids
            .map(captureId => captures.find(c => c.id === captureId))
            .filter((c): c is Capture => c !== undefined);
    }, [insight?.related_capture_ids, captures]);

    const handleImagePress = (captureId: string) => {
        router.push(`/archive/image-viewer?captureId=${captureId}`);
    };

    // Calculate image sizes based on count
    const getImageSize = (count: number) => {
        const availableWidth = SCREEN_WIDTH - (CONTENT_PADDING * 2);
        if (count === 1) {
            return availableWidth * 0.65;
        }
        return (availableWidth - IMAGE_GAP) / 2;
    };

    const renderImageGrid = () => {
        if (relatedCaptures.length === 0) return null;

        const imageSize = getImageSize(relatedCaptures.length);
        const isSingle = relatedCaptures.length === 1;

        return (
            <View style={styles.imageGridSection}>
                <View style={styles.imageGridDivider} />
                <View style={[
                    styles.imageGrid,
                    isSingle && styles.imageGridCentered
                ]}>
                    {relatedCaptures.map((capture) => (
                        <TouchableOpacity
                            key={capture.id}
                            activeOpacity={0.8}
                            onPress={() => handleImagePress(capture.id)}
                            style={[
                                styles.imageItem,
                                { width: imageSize, height: imageSize }
                            ]}
                        >
                            <Image
                                source={{ uri: capture.image_url }}
                                style={styles.image}
                                contentFit="cover"
                                transition={200}
                            />
                        </TouchableOpacity>
                    ))}
                </View>
            </View>
        );
    };

    if (loading) {
        return (
            <ScreenWrapper hideFloatingBackground>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={Colors.obsy.silver} />
                </View>
            </ScreenWrapper>
        );
    }

    if (!insight) {
        return (
            <ScreenWrapper hideFloatingBackground>
                <View style={styles.errorContainer}>
                    <ThemedText>Insight not found.</ThemedText>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <ThemedText style={{ color: Colors.obsy.silver }}>Go Back</ThemedText>
                    </TouchableOpacity>
                </View>
            </ScreenWrapper>
        );
    }

    return (
        <ScreenWrapper hideFloatingBackground>
            <Stack.Screen options={{ headerShown: false }} />
            {/* Transparent Header */}
            <View style={styles.header}>
                <View style={styles.headerContent}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                        <Ionicons name="chevron-back" size={24} color={Colors.obsy.silver} />
                    </TouchableOpacity>
                    <ThemedText type="defaultSemiBold" style={styles.headerTitle}>
                        {insight.type.startsWith('journal_')
                            ? `Journal ${insight.type.replace('journal_', '').charAt(0).toUpperCase() + insight.type.replace('journal_', '').slice(1)} Insight`
                            : `${insight.type.charAt(0).toUpperCase() + insight.type.slice(1)} Insight`}
                    </ThemedText>
                    <View style={{ width: 24 }} />
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Date */}
                <ThemedText style={styles.dateText}>{insight.date_scope}</ThemedText>

                {/* Title */}
                <ThemedText type="title" style={styles.title}>{insight.title}</ThemedText>

                {/* Body text */}
                <ThemedText style={styles.bodyText}>
                    {insight.body}
                </ThemedText>

                {/* Image Grid - skip for journal insights (text-only) */}
                {!insight.type.startsWith('journal_') && renderImageGrid()}

                {/* Footer */}
                <View style={styles.footer}>
                    <ThemedText style={styles.footerText}>
                        Generated on {new Date(insight.created_at).toLocaleDateString()}
                    </ThemedText>
                </View>
            </ScrollView>
        </ScreenWrapper>
    );
}

const styles = StyleSheet.create({
    header: {
        paddingTop: 60,
        paddingBottom: 16,
        backgroundColor: 'transparent',
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
    },
    iconButton: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.8)',
    },
    scrollContent: {
        padding: CONTENT_PADDING,
        paddingBottom: 100,
        gap: 16,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
    },
    backButton: {
        padding: 10,
    },
    dateText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.45)',
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    title: {
        fontSize: 24,
        lineHeight: 32,
        marginTop: 4,
    },
    bodyText: {
        fontSize: 16,
        lineHeight: 26,
        color: 'rgba(255,255,255,0.85)',
        marginTop: 8,
    },
    imageGridSection: {
        marginTop: 24,
    },
    imageGridDivider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.08)',
        marginBottom: 20,
    },
    imageGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: IMAGE_GAP,
    },
    imageGridCentered: {
        justifyContent: 'center',
    },
    imageItem: {
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    footer: {
        marginTop: 32,
        alignItems: 'center',
    },
    footerText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.3)',
    },
});

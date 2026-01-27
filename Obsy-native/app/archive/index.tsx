import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ThemedText } from '@/components/ui/ThemedText';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthContext';
import { fetchArchives, deleteArchivedInsight, countArchivedInsights, purgeExpiredRecycleBin } from '@/services/archive';
import { ArchiveInsight, ArchiveInsightType } from '@/types/insights';
import { ExportInsightsModal } from '@/components/insights/ExportInsightsModal';
import { ArchiveStorageIndicator } from '@/components/insights/ArchiveStorageIndicator';
import { DeleteConfirmModal } from '@/components/insights/DeleteConfirmModal';
import * as Haptics from 'expo-haptics';
type ExpandableSectionType = ArchiveInsightType;

const PREVIEW_COUNT = 0;
const PAGINATION_INCREMENT = 10;
const UNDO_TIMEOUT = 5000;

export default function ArchiveScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const [archives, setArchives] = useState<ArchiveInsight[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedSection, setExpandedSection] = useState<ExpandableSectionType | null>(null);
    const [paginationState, setPaginationState] = useState<Record<ExpandableSectionType, number>>({
        daily: PAGINATION_INCREMENT,
        weekly: PAGINATION_INCREMENT,
        monthly: PAGINATION_INCREMENT,
        album: PAGINATION_INCREMENT,
        tagging: PAGINATION_INCREMENT,
    });
    const [exportModalVisible, setExportModalVisible] = useState(false);
    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [insightToDelete, setInsightToDelete] = useState<ArchiveInsight | null>(null);

    useEffect(() => {
        if (user) {
            loadArchives();
            purgeExpiredRecycleBin(user.id);
        }
    }, [user]);

    const loadArchives = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const data = await fetchArchives(user.id);
            setArchives(data);
        } catch (error) {
            console.error("Error loading archives:", error);
        } finally {
            setLoading(false);
        }
    };

    const groupedArchives = useMemo(() => {
        const groups: Record<ArchiveInsightType, ArchiveInsight[]> = {
            daily: [] as ArchiveInsight[],
            weekly: [] as ArchiveInsight[],
            monthly: [] as ArchiveInsight[],
            album: [] as ArchiveInsight[],
            tagging: [] as ArchiveInsight[],
        };

        archives.forEach(insight => {
            if (groups[insight.type]) {
                groups[insight.type].push(insight);
            }
        });

        return groups;
    }, [archives]);

    const toggleSection = (type: ExpandableSectionType) => {
        setExpandedSection(prev => prev === type ? null : type);
    };

    const loadMoreItems = (type: ExpandableSectionType) => {
        setPaginationState(prev => ({
            ...prev,
            [type]: prev[type] + PAGINATION_INCREMENT,
        }));
    };

    const confirmDelete = (insight: ArchiveInsight) => {
        setInsightToDelete(insight);
        setDeleteModalVisible(true);
    };

    const handleDelete = async () => {
        if (!insightToDelete) return;

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // Optimistic update
        const backup = [...archives];
        setArchives(prev => prev.filter(a => a.id !== insightToDelete.id));
        setDeleteModalVisible(false);

        try {
            const success = await deleteArchivedInsight(insightToDelete.id);
            if (!success) {
                setArchives(backup);
            }
        } catch (error) {
            console.error("Error deleting insight:", error);
            setArchives(backup);
        } finally {
            setInsightToDelete(null);
        }
    };

    // Memoized Card Component
    const ArchiveCard = React.memo(({ insight, isLast, onPress, onDelete }: {
        insight: ArchiveInsight,
        isLast: boolean,
        onPress: (id: string) => void,
        onDelete: (insight: ArchiveInsight) => void
    }) => (
        <View style={styles.cardContainer}>
            <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => onPress(insight.id)}
                style={styles.card}
            >
                <View style={styles.cardHeader}>
                    <ThemedText style={styles.dateText}>{insight.date_scope}</ThemedText>
                    <TouchableOpacity onPress={() => onDelete(insight)} style={styles.deleteBtn}>
                        <Ionicons name="trash-outline" size={16} color="rgba(255,255,255,0.3)" />
                    </TouchableOpacity>
                </View>
                <ThemedText type="defaultSemiBold" style={styles.cardTitle}>{insight.title}</ThemedText>
                <ThemedText numberOfLines={2} style={styles.cardSummary}>
                    {insight.summary}
                </ThemedText>
                {insight.tags && insight.tags.length > 0 && (
                    <View style={styles.tagRow}>
                        {insight.tags.map((tag, idx) => (
                            <View key={idx} style={styles.tagBadge}>
                                <ThemedText style={styles.tagText}>#{tag}</ThemedText>
                            </View>
                        ))}
                    </View>
                )}
            </TouchableOpacity>
            {!isLast && <View style={styles.itemDivider} />}
        </View>
    ));

    const handleCardPress = useCallback((id: string) => {
        router.push(`/archive/${id}`);
    }, [router]);

    // Flatten data for FlatList
    const flatData = useMemo(() => {
        const data: any[] = [];
        const sections: { title: string, type: ArchiveInsightType }[] = [
            { title: "Daily Insights", type: "daily" },
            { title: "Weekly Insights", type: "weekly" },
            { title: "Monthly Insights", type: "monthly" },
            { title: "Album Insights", type: "album" },
            { title: "Tagging Insights", type: "tagging" },
        ];

        sections.forEach(section => {
            const items = groupedArchives[section.type];
            data.push({ type: 'header', title: section.title, insightType: section.type, itemCount: items.length });

            if (items.length === 0) {
                data.push({ type: 'empty', insightType: section.type });
            } else {
                const isExpanded = expandedSection === section.type;
                const displayItems = isExpanded
                    ? items.slice(0, paginationState[section.type])
                    : items.slice(0, PREVIEW_COUNT);

                displayItems.forEach((insight, index) => {
                    data.push({
                        type: 'card',
                        insight,
                        isLast: index === displayItems.length - 1 && (!isExpanded || items.length <= paginationState[section.type])
                    });
                });

                if (!isExpanded && items.length > PREVIEW_COUNT) {
                    data.push({ type: 'viewAll', insightType: section.type, count: items.length });
                } else if (isExpanded && items.length > paginationState[section.type]) {
                    data.push({ type: 'loadMore', insightType: section.type, remaining: items.length - paginationState[section.type] });
                }
            }
        });
        return data;
    }, [groupedArchives, expandedSection, paginationState]);

    const renderItem = useCallback(({ item }: { item: any }) => {
        switch (item.type) {
            case 'header':
                return (
                    <TouchableOpacity
                        style={styles.sectionHeader}
                        onPress={() => toggleSection(item.insightType)}
                        activeOpacity={0.7}
                    >
                        <View style={styles.sectionHeaderLeft}>
                            <ThemedText type="subtitle" style={styles.sectionTitle}>{item.title}</ThemedText>
                        </View>
                        <Ionicons
                            name={expandedSection === item.insightType ? "chevron-up" : "chevron-down"}
                            size={20}
                            color={Colors.obsy.silver}
                        />
                    </TouchableOpacity>
                );
            case 'card':
                return (
                    <ArchiveCard
                        insight={item.insight}
                        isLast={item.isLast}
                        onPress={handleCardPress}
                        onDelete={confirmDelete}
                    />
                );
            case 'empty':
                return <ThemedText style={styles.emptyText}>No {item.insightType} insights yet.</ThemedText>;
            case 'viewAll':
                return (
                    <TouchableOpacity
                        style={styles.viewAllButton}
                        onPress={() => toggleSection(item.insightType)}
                        activeOpacity={0.7}
                    >
                        <ThemedText style={styles.viewAllText}>
                            View all {item.count} insights
                        </ThemedText>
                    </TouchableOpacity>
                );
            case 'loadMore':
                return (
                    <TouchableOpacity
                        style={styles.loadMoreButton}
                        onPress={() => loadMoreItems(item.insightType)}
                        activeOpacity={0.7}
                    >
                        <ThemedText style={styles.loadMoreText}>
                            Load more ({item.remaining} remaining)
                        </ThemedText>
                    </TouchableOpacity>
                );
            default:
                return null;
        }
    }, [expandedSection, handleCardPress]);

    return (
        <ScreenWrapper screenName="archive" hideFloatingBackground>
            <Stack.Screen options={{ headerShown: false }} />
            {/* Transparent Header */}
            <View style={styles.header}>
                <View style={styles.headerContent}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <Ionicons name="chevron-back" size={24} color={Colors.obsy.silver} />
                    </TouchableOpacity>
                    <ThemedText type="title" style={styles.headerTitle}>Archive ({archives.length}/150)</ThemedText>
                    <TouchableOpacity onPress={() => router.push('/archive/recycle-bin')} style={styles.headerBtn}>
                        <Ionicons name="trash-outline" size={20} color={Colors.obsy.silver} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setExportModalVisible(true)} style={styles.headerBtn}>
                        <Ionicons name="share-outline" size={20} color={Colors.obsy.silver} />
                    </TouchableOpacity>
                </View>
            </View>

            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={Colors.obsy.silver} />
                </View>
            ) : (
                <FlatList
                    data={flatData}
                    renderItem={renderItem}
                    keyExtractor={(item: any, index: number) => `${item.type}-${index}`}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    removeClippedSubviews={true}
                    initialNumToRender={15}
                    maxToRenderPerBatch={10}
                    windowSize={5}
                />
            )}

            <View style={styles.footerContainer}>
                <TouchableOpacity
                    style={styles.recycleBinLink}
                    onPress={() => router.push('/archive/recycle-bin')}
                >
                    <Ionicons name="trash-bin-outline" size={16} color="rgba(255,255,255,0.4)" />
                    <ThemedText style={styles.recycleBinText}>Recycle Bin</ThemedText>
                </TouchableOpacity>

                <ArchiveStorageIndicator
                    current={archives.length}
                    max={150}
                />
            </View>

            <DeleteConfirmModal
                visible={deleteModalVisible}
                onClose={() => setDeleteModalVisible(false)}
                onConfirm={handleDelete}
            />

            <ExportInsightsModal
                visible={exportModalVisible}
                onClose={() => setExportModalVisible(false)}
                userId={user?.id || ''}
            />
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
    backButton: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 18,
    },
    headerBtn: {
        padding: 8,
    },
    footerContainer: {
        padding: 20,
        paddingTop: 10,
        paddingBottom: 40,
        backgroundColor: 'transparent',
        gap: 12,
    },
    recycleBinLink: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 8,
    },
    recycleBinText: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.4)',
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 100,
        gap: 24,
    },
    loadingContainer: {
        padding: 40,
        alignItems: 'center',
    },
    section: {
        gap: 8,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 8,
    },
    sectionHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    sectionTitle: {
        fontSize: 18,
        color: Colors.obsy.silver,
    },
    sectionCount: {
        backgroundColor: 'rgba(255,255,255,0.15)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
    },
    sectionCountText: {
        fontSize: 12,
        color: Colors.obsy.silver,
        fontWeight: '600',
    },
    cardsContainer: {
        marginTop: 4,
    },
    emptyText: {
        color: 'rgba(255,255,255,0.4)',
        fontStyle: 'italic',
        fontSize: 14,
        marginTop: 4,
    },
    cardContainer: {
        // Simple container without background
    },
    card: {
        paddingVertical: 16,
        paddingHorizontal: 4,
        gap: 6,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    dateText: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.45)',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    cardTitle: {
        fontSize: 16,
        color: '#FFFFFF',
    },
    cardSummary: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
        lineHeight: 20,
    },
    itemDivider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    viewAllButton: {
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
        borderRadius: 12,
        marginTop: 12,
    },
    viewAllText: {
        fontSize: 14,
        color: Colors.obsy.silver,
        fontWeight: '500',
    },
    loadMoreButton: {
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 12,
        marginTop: 12,
    },
    loadMoreText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
        fontWeight: '500',
    },
    exportButton: {
        padding: 4,
    },
    deleteBtn: {
        padding: 4,
        marginRight: -4,
    },
    tagRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 4,
    },
    tagBadge: {
        backgroundColor: 'rgba(255,255,255,0.06)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
    },
    tagText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
    },
    undoToast: {
        position: 'absolute',
        bottom: 40,
        left: 20,
        right: 20,
        backgroundColor: '#2A2A2A',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    undoText: {
        color: '#FFFFFF',
        fontSize: 14,
    },
    undoAction: {
        color: Colors.obsy.silver,
        fontWeight: '700',
        fontSize: 14,
        letterSpacing: 0.5,
    },
});

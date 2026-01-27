import React, { useEffect, useState } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ThemedText } from '@/components/ui/ThemedText';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthContext';
import { fetchRecycleBin, restoreArchivedInsight, permanentlyDeleteInsight } from '@/services/archive';
import { ArchiveInsight } from '@/types/insights';
import * as Haptics from 'expo-haptics';
import { formatDistanceToNow, addDays } from 'date-fns';

export default function RecycleBinScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const [items, setItems] = useState<ArchiveInsight[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionId, setActionId] = useState<string | null>(null);
    const [massDeleting, setMassDeleting] = useState(false);

    useEffect(() => {
        loadRecycleBin();
    }, [user]);

    const loadRecycleBin = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const data = await fetchRecycleBin(user.id);
            setItems(data);
        } catch (error) {
            console.error("Error loading recycle bin:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleRestore = async (insight: ArchiveInsight) => {
        setActionId(insight.id);
        try {
            const success = await restoreArchivedInsight(insight.id);
            if (success) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setItems(prev => prev.filter(i => i.id !== insight.id));
            }
        } catch (error) {
            console.error("Error restoring insight:", error);
            Alert.alert("Error", "Failed to restore insight.");
        } finally {
            setActionId(null);
        }
    };

    const handlePermanentDelete = (insight: ArchiveInsight) => {
        Alert.alert(
            "Delete Permanently?",
            "This action cannot be undone.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete Forever",
                    style: "destructive",
                    onPress: async () => {
                        setActionId(insight.id);
                        try {
                            const success = await permanentlyDeleteInsight(insight.id);
                            if (success) {
                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                                setItems(prev => prev.filter(i => i.id !== insight.id));
                            }
                        } catch (error) {
                            console.error("Error deleting insight:", error);
                            Alert.alert("Error", "Failed to delete insight.");
                        } finally {
                            setActionId(null);
                        }
                    }
                }
            ]
        );
    };

    const handleEmptyAll = () => {
        if (items.length === 0) return;

        Alert.alert(
            "Empty Recycle Bin?",
            `This will permanently delete ${items.length} insight${items.length > 1 ? 's' : ''}. This cannot be undone.`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Empty All",
                    style: "destructive",
                    onPress: async () => {
                        setMassDeleting(true);
                        try {
                            for (const item of items) {
                                await permanentlyDeleteInsight(item.id);
                            }
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                            setItems([]);
                        } catch (error) {
                            console.error("Error emptying recycle bin:", error);
                            Alert.alert("Error", "Failed to empty recycle bin.");
                            loadRecycleBin();
                        } finally {
                            setMassDeleting(false);
                        }
                    }
                }
            ]
        );
    };

    const renderItem = ({ item }: { item: ArchiveInsight }) => {
        const deletedDate = item.deleted_at ? new Date(item.deleted_at) : new Date();
        const expiryDate = addDays(deletedDate, 30);
        const timeLeft = formatDistanceToNow(expiryDate);
        const isProcessing = actionId === item.id;

        return (
            <View style={styles.card}>
                <View style={styles.cardHeader}>
                    <ThemedText style={styles.dateText}>Deleted {formatDistanceToNow(deletedDate)} ago</ThemedText>
                    <ThemedText style={styles.expiryText}>Purge in {timeLeft}</ThemedText>
                </View>

                <ThemedText type="defaultSemiBold" style={styles.cardTitle}>{item.title}</ThemedText>
                <ThemedText numberOfLines={1} style={styles.cardSummary}>{item.summary}</ThemedText>

                <View style={styles.actions}>
                    <TouchableOpacity
                        style={[styles.actionBtn, styles.restoreBtn]}
                        onPress={() => handleRestore(item)}
                        disabled={!!actionId}
                    >
                        {isProcessing ? (
                            <ActivityIndicator size="small" color={Colors.obsy.silver} />
                        ) : (
                            <>
                                <Ionicons name="refresh-outline" size={16} color={Colors.obsy.silver} />
                                <ThemedText style={styles.actionText}>Restore</ThemedText>
                            </>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.actionBtn, styles.deleteBtn]}
                        onPress={() => handlePermanentDelete(item)}
                        disabled={!!actionId}
                    >
                        <Ionicons name="trash-outline" size={16} color="rgba(255,255,255,0.4)" />
                        <ThemedText style={[styles.actionText, styles.deleteText]}>Delete</ThemedText>
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    return (
        <ScreenWrapper screenName="archive" hideFloatingBackground>
            <Stack.Screen options={{ headerShown: false }} />

            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="chevron-back" size={24} color={Colors.obsy.silver} />
                </TouchableOpacity>
                <ThemedText type="title" style={styles.headerTitle}>Recycle Bin</ThemedText>

                {items.length > 0 && (
                    <TouchableOpacity
                        onPress={handleEmptyAll}
                        style={styles.emptyAllBtn}
                        disabled={massDeleting}
                    >
                        {massDeleting ? (
                            <ActivityIndicator size="small" color="#FF3B30" />
                        ) : (
                            <ThemedText style={styles.emptyAllText}>Empty All</ThemedText>
                        )}
                    </TouchableOpacity>
                )}

                {items.length === 0 && <View style={{ width: 60 }} />}
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={Colors.obsy.silver} />
                </View>
            ) : items.length === 0 ? (
                <View style={styles.center}>
                    <Ionicons name="trash-bin-outline" size={48} color="rgba(255,255,255,0.2)" />
                    <ThemedText style={styles.emptyTitle}>Empty Bin</ThemedText>
                    <ThemedText style={styles.emptySubtitle}>Deleted insights appear here for 30 days before being permanently removed.</ThemedText>
                </View>
            ) : (
                <FlatList
                    data={items}
                    renderItem={renderItem}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                />
            )}
        </ScreenWrapper>
    );
}

const styles = StyleSheet.create({
    header: {
        paddingTop: 60,
        paddingBottom: 16,
        paddingHorizontal: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 18,
    },
    emptyAllBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    emptyAllText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#FF3B30',
    },
    listContent: {
        padding: 20,
        paddingBottom: 40,
        gap: 16,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.4)',
        marginTop: 16,
    },
    emptySubtitle: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.3)',
        textAlign: 'center',
        marginTop: 8,
        lineHeight: 20,
    },
    card: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    dateText: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.4)',
    },
    expiryText: {
        fontSize: 11,
        color: '#A855F7', // Obsy purple
        fontWeight: '600',
    },
    cardTitle: {
        fontSize: 16,
        color: '#FFFFFF',
        marginBottom: 4,
    },
    cardSummary: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.5)',
        marginBottom: 16,
    },
    actions: {
        flexDirection: 'row',
        gap: 10,
    },
    actionBtn: {
        flex: 1,
        height: 36,
        borderRadius: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    restoreBtn: {
        backgroundColor: 'rgba(255,255,255,0.12)',
    },
    deleteBtn: {
        // Subtle delete button
    },
    actionText: {
        fontSize: 13,
        fontWeight: '600',
        color: Colors.obsy.silver,
    },
    deleteText: {
        color: 'rgba(255,255,255,0.4)',
    },
});

import React from 'react';
import { View, StyleSheet, Modal, TouchableOpacity, ScrollView, TouchableWithoutFeedback, ActivityIndicator, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassCard } from '@/components/ui/GlassCard';
import { ThemedText } from '@/components/ui/ThemedText';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import Colors from '@/constants/Colors';

interface InsightModalProps {
    visible: boolean;
    onClose: () => void;
    insightText?: string;
    onRefresh?: () => void;
    isRefreshing?: boolean;
    onPostToAlbum?: () => void;
    isPosting?: boolean;
    authorName?: string;
    authorAvatarUrl?: string | null;
}

export function InsightModal({
    visible,
    onClose,
    insightText,
    onRefresh,
    isRefreshing,
    onPostToAlbum,
    isPosting,
    authorName,
    authorAvatarUrl,
}: InsightModalProps) {
    return (
        <Modal
            animationType="fade"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <TouchableWithoutFeedback onPress={onClose}>
                <BlurView intensity={60} tint="dark" style={styles.container}>
                    <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                        <View style={styles.card}>
                            {/* Header Section */}
                            <View style={styles.header}>
                                <ThemedText type="subtitle" style={styles.title}>Album Insight</ThemedText>

                                <View style={styles.headerRight}>
                                    {onRefresh && !authorName && (
                                        <TouchableOpacity
                                            style={styles.refreshButton}
                                            onPress={onRefresh}
                                            disabled={isRefreshing}
                                        >
                                            {isRefreshing ? (
                                                <ActivityIndicator size="small" color="white" />
                                            ) : (
                                                <Ionicons name="sync-outline" size={22} color={Colors.obsy.silver} />
                                            )}
                                        </TouchableOpacity>
                                    )}
                                    <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                                        <Ionicons name="close" size={24} color="rgba(255,255,255,0.7)" />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            <View style={styles.divider} />

                            <ScrollView
                                contentContainerStyle={styles.scrollContent}
                                showsVerticalScrollIndicator={false}
                            >
                                <View style={styles.content}>
                                    {isRefreshing ? (
                                        <View style={styles.loadingContainer}>
                                            <ActivityIndicator size="large" color={Colors.obsy.silver} />
                                            <ThemedText style={styles.loadingText}>Regenerating insight...</ThemedText>
                                        </View>
                                    ) : (
                                        <ThemedText style={styles.insightText}>
                                            {insightText || "No insight generated yet."}
                                        </ThemedText>
                                    )}

                                    {/* Author Attribution - Only show if authorName is provided */}
                                    {authorName && !isRefreshing && (
                                        <View style={styles.authorSection}>
                                            <View style={styles.authorBadge}>
                                                {authorAvatarUrl ? (
                                                    <Image source={{ uri: authorAvatarUrl }} style={styles.authorAvatar} contentFit="cover" />
                                                ) : (
                                                    <View style={styles.authorPlaceholder}>
                                                        <Ionicons name="person" size={12} color="rgba(255,255,255,0.7)" />
                                                    </View>
                                                )}
                                            </View>
                                            <ThemedText style={styles.authorText}>
                                                Shared by {authorName}
                                            </ThemedText>
                                        </View>
                                    )}

                                    <View style={styles.buttonRow}>
                                        {onPostToAlbum && !authorName && (
                                            <TouchableOpacity
                                                style={[styles.postButton, (isPosting || isRefreshing) && styles.buttonDisabled]}
                                                onPress={onPostToAlbum}
                                                disabled={isPosting || isRefreshing}
                                            >
                                                {isPosting ? (
                                                    <ActivityIndicator size="small" color="black" />
                                                ) : (
                                                    <>
                                                        <Ionicons name="share-outline" size={18} color="black" style={styles.buttonIcon} />
                                                        <ThemedText style={styles.postText}>Post to album</ThemedText>
                                                    </>
                                                )}
                                            </TouchableOpacity>
                                        )}
                                        <TouchableOpacity style={styles.doneButton} onPress={onClose}>
                                            <ThemedText style={styles.doneText}>Done</ThemedText>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </ScrollView>
                        </View>
                    </TouchableWithoutFeedback>
                </BlurView>
            </TouchableWithoutFeedback>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    card: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: '#000000',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        overflow: 'hidden',
        maxHeight: '80%',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 12,
            },
            android: {
                elevation: 8,
            },
        }),
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 16,
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
    },
    divider: {
        height: 0.5,
        backgroundColor: 'rgba(255,255,255,0.06)',
        marginHorizontal: 16,
    },
    refreshButton: {
        padding: 4,
    },
    closeButton: {
        padding: 4,
    },
    scrollContent: {
        paddingBottom: 40,
    },
    content: {
        padding: 24,
        alignItems: 'center',
    },
    insightText: {
        fontSize: 16,
        lineHeight: 26,
        color: 'rgba(255,255,255,0.85)',
        textAlign: 'center',
        fontStyle: 'italic',
        marginBottom: 24,
    },
    authorSection: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: 'rgba(255,255,255,0.03)',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 20,
        marginBottom: 24,
    },
    authorBadge: {
        width: 24,
        height: 24,
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    authorAvatar: {
        width: '100%',
        height: '100%',
    },
    authorPlaceholder: {
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(168, 85, 247, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    authorText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
        fontWeight: '500',
    },
    loadingContainer: {
        alignItems: 'center',
        gap: 16,
        paddingVertical: 40,
    },
    loadingText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.5)',
    },
    buttonRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    postButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 20,
        backgroundColor: Colors.obsy.silver,
        borderRadius: 25,
        minWidth: 140,
    },
    buttonDisabled: {
        opacity: 0.5,
    },
    buttonIcon: {
        marginRight: 6,
    },
    postText: {
        color: '#000',
        fontWeight: '700',
        fontSize: 15,
    },
    doneButton: {
        paddingVertical: 12,
        paddingHorizontal: 24,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 25,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    doneText: {
        color: 'white',
        fontWeight: '600',
        fontSize: 15,
    },
});

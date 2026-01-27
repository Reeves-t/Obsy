import React, { useState, useEffect, useMemo } from 'react';
import { StyleSheet, View, TouchableOpacity, Modal, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import { ThemedText } from '@/components/ui/ThemedText';
import { Ionicons } from '@expo/vector-icons';
import { useCustomMoodStore, initializeMoodStore } from '@/lib/customMoodStore';
import { CreateCustomMoodModal } from './CreateCustomMoodModal';
import { resolveMoodColor } from '@/lib/moodColorUtils';
import { Mood } from '@/types/mood';
import Colors from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthContext';
import { moodCache } from '@/lib/moodCache';

interface MoodSelectionModalProps {
    visible: boolean;
    selectedMood: string | null;
    onSelect: (moodId: string) => void;
    onClose: () => void;
}

// Define energy level groupings by mood ID
// These IDs match the system moods seeded in the database
const LOW_ENERGY_IDS = new Set([
    'calm', 'relaxed', 'peaceful', 'tired', 'drained', 'bored',
    'reflective', 'melancholy', 'nostalgic', 'lonely', 'depressed', 'numb', 'safe'
]);
const MEDIUM_ENERGY_IDS = new Set([
    'neutral', 'focused', 'grateful', 'hopeful', 'curious',
    'scattered', 'annoyed', 'unbothered', 'awkward', 'tender'
]);
const HIGH_ENERGY_IDS = new Set([
    'productive', 'creative', 'inspired', 'confident', 'joyful', 'social',
    'busy', 'restless', 'stressed', 'overwhelmed', 'anxious', 'angry',
    'pressured', 'enthusiastic', 'hyped', 'manic', 'playful'
]);

interface MoodCategoryProps {
    title: string;
    moods: Mood[];
    selectedMood: string | null;
    onSelect: (moodId: string) => void;
    isLoading?: boolean;
}

function MoodCategory({ title, moods, selectedMood, onSelect, isLoading }: MoodCategoryProps) {
    if (isLoading) {
        return (
            <View style={styles.categoryContainer}>
                <ThemedText style={styles.categoryTitle}>{title}</ThemedText>
                <View style={styles.loadingCategoryContainer}>
                    <ActivityIndicator color={Colors.obsy.silver} size="small" />
                </View>
            </View>
        );
    }

    return (
        <View style={styles.categoryContainer}>
            <ThemedText style={styles.categoryTitle}>{title}</ThemedText>
            <View style={styles.moodGrid}>
                {moods.map((mood) => {
                    const isSelected = selectedMood === mood.id;
                    return (
                        <TouchableOpacity
                            key={mood.id}
                            style={[
                                styles.moodPill,
                                isSelected && styles.moodPillSelected,
                            ]}
                            onPress={() => onSelect(mood.id)}
                            activeOpacity={0.7}
                        >
                            <ThemedText
                                style={[
                                    styles.moodText,
                                    isSelected && styles.moodTextSelected,
                                ]}
                            >
                                {mood.name}
                            </ThemedText>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

export function MoodSelectionModal({
    visible,
    selectedMood,
    onSelect,
    onClose,
}: MoodSelectionModalProps) {
    const [activeTab, setActiveTab] = useState<'moods' | 'custom'>('moods');
    const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);

    const { user, isGuest } = useAuth();
    const { customMoods, systemMoods, addCustomMood, deleteCustomMood, loading, initialized } = useCustomMoodStore();

    // Initialize mood store and cache when modal opens and user is authenticated
    useEffect(() => {
        if (visible && user?.id) {
            if (!initialized) {
                initializeMoodStore(user.id);
            }
            // Also ensure mood cache is populated
            if (!moodCache.isInitialized() || moodCache.isStale()) {
                moodCache.fetchAllMoods(user.id);
            }
        }
    }, [visible, user?.id, initialized]);

    // Group system moods by energy level
    const lowEnergyMoods = useMemo(() =>
        systemMoods.filter(m => LOW_ENERGY_IDS.has(m.id)).sort((a, b) => a.name.localeCompare(b.name)),
        [systemMoods]
    );
    const mediumEnergyMoods = useMemo(() =>
        systemMoods.filter(m => MEDIUM_ENERGY_IDS.has(m.id)).sort((a, b) => a.name.localeCompare(b.name)),
        [systemMoods]
    );
    const highEnergyMoods = useMemo(() =>
        systemMoods.filter(m => HIGH_ENERGY_IDS.has(m.id)).sort((a, b) => a.name.localeCompare(b.name)),
        [systemMoods]
    );

    // Check if system moods are still loading
    const isSystemMoodsLoading = !initialized || (loading && systemMoods.length === 0);

    // Filter out deleted custom moods for selection
    const activeCustomMoods = customMoods.filter(m => !m.deleted_at);

    const handleSelect = (moodId: string) => {
        onSelect(moodId);
        onClose();
    };

    const handleCreateMood = async (name: string) => {
        if (isGuest || !user?.id) {
            Alert.alert(
                "Sign In Required",
                "Sign in to create custom moods that sync across your devices.",
                [{ text: "OK" }]
            );
            return;
        }

        setIsCreating(true);
        setCreateError(null);

        try {
            await addCustomMood(name, user.id);
            setIsCreateModalVisible(false);
        } catch (err) {
            if (err instanceof Error) {
                setCreateError(err.message);
            } else {
                setCreateError('Failed to create mood. Please try again.');
            }
            throw err; // Re-throw so CreateCustomMoodModal can handle it
        } finally {
            setIsCreating(false);
        }
    };

    const handleDeleteCustom = (id: string, name: string) => {
        Alert.alert(
            "Delete Mood",
            `Are you sure you want to delete "${name}"?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        setIsDeleting(id);
                        try {
                            await deleteCustomMood(id);
                        } catch (err) {
                            Alert.alert("Error", "Failed to delete mood. Please try again.");
                        } finally {
                            setIsDeleting(null);
                        }
                    }
                }
            ]
        );
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <BlurView intensity={95} tint="dark" style={styles.modalContainer}>
                <View style={styles.modalContent}>
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.handle} />
                        <View style={styles.headerRow}>
                            <ThemedText style={styles.headerTitle}>Select Mood</ThemedText>
                            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                                <Ionicons name="close" size={24} color="rgba(255,255,255,0.6)" />
                            </TouchableOpacity>
                        </View>

                        {/* Tabs */}
                        <View style={styles.tabContainer}>
                            <TouchableOpacity
                                style={[styles.tab, activeTab === 'moods' && styles.activeTab]}
                                onPress={() => setActiveTab('moods')}
                            >
                                <ThemedText style={[styles.tabText, activeTab === 'moods' && styles.activeTabText]}>
                                    Moods
                                </ThemedText>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.tab, activeTab === 'custom' && styles.activeTab]}
                                onPress={() => setActiveTab('custom')}
                            >
                                <ThemedText style={[styles.tabText, activeTab === 'custom' && styles.activeTabText]} >
                                    Custom
                                </ThemedText>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Content */}
                    <ScrollView
                        style={styles.scrollView}
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                    >
                        {activeTab === 'moods' ? (
                            <>
                                <MoodCategory
                                    title="Low Energy"
                                    moods={lowEnergyMoods}
                                    selectedMood={selectedMood}
                                    onSelect={handleSelect}
                                    isLoading={isSystemMoodsLoading}
                                />
                                <MoodCategory
                                    title="Medium Energy"
                                    moods={mediumEnergyMoods}
                                    selectedMood={selectedMood}
                                    onSelect={handleSelect}
                                    isLoading={isSystemMoodsLoading}
                                />
                                <MoodCategory
                                    title="High Energy"
                                    moods={highEnergyMoods}
                                    selectedMood={selectedMood}
                                    onSelect={handleSelect}
                                    isLoading={isSystemMoodsLoading}
                                />
                            </>
                        ) : (
                            <View style={styles.customContainer}>
                                {loading ? (
                                    <View style={styles.loadingContainer}>
                                        <ActivityIndicator color={Colors.obsy.silver} size="large" />
                                        <ThemedText style={styles.loadingText}>Loading moods...</ThemedText>
                                    </View>
                                ) : (
                                    <>
                                        <View style={styles.moodGrid}>
                                            {activeCustomMoods.map((mood) => {
                                                const isSelected = selectedMood === mood.id;
                                                const moodColor = resolveMoodColor(mood);
                                                const isBeingDeleted = isDeleting === mood.id;
                                                return (
                                                    <TouchableOpacity
                                                        key={mood.id}
                                                        style={[
                                                            styles.moodPill,
                                                            isSelected && styles.moodPillSelected,
                                                            { borderLeftColor: moodColor, borderLeftWidth: 3 },
                                                            isBeingDeleted && styles.moodPillDeleting
                                                        ]}
                                                        onPress={() => handleSelect(mood.id)}
                                                        onLongPress={() => handleDeleteCustom(mood.id, mood.name)}
                                                        activeOpacity={0.7}
                                                        disabled={isBeingDeleted}
                                                    >
                                                        {isBeingDeleted ? (
                                                            <ActivityIndicator color="rgba(255,255,255,0.5)" size="small" />
                                                        ) : (
                                                            <>
                                                                <ThemedText
                                                                    style={[
                                                                        styles.moodText,
                                                                        isSelected && styles.moodTextSelected,
                                                                    ]}
                                                                >
                                                                    {mood.name}
                                                                </ThemedText>
                                                                <TouchableOpacity
                                                                    style={styles.miniDelete}
                                                                    onPress={() => handleDeleteCustom(mood.id, mood.name)}
                                                                >
                                                                    <Ionicons name="close" size={12} color="rgba(255,255,255,0.3)" />
                                                                </TouchableOpacity>
                                                            </>
                                                        )}
                                                    </TouchableOpacity>
                                                );
                                            })}

                                            <TouchableOpacity
                                                style={styles.createPill}
                                                onPress={() => {
                                                    setCreateError(null);
                                                    setIsCreateModalVisible(true);
                                                }}
                                            >
                                                <Ionicons name="add" size={18} color={Colors.obsy.silver} />
                                                <ThemedText style={styles.createText}>Create mood</ThemedText>
                                            </TouchableOpacity>
                                        </View>

                                        {activeCustomMoods.length === 0 && !loading && (
                                            <View style={styles.emptyState}>
                                                <ThemedText style={styles.emptyText}>
                                                    {isGuest
                                                        ? "Sign in to create custom moods that sync across your devices."
                                                        : "No custom moods yet. Create your own vibes to personalize your captures.\n\nLong press a mood to delete it."
                                                    }
                                                </ThemedText>
                                            </View>
                                        )}
                                    </>
                                )}
                            </View>
                        )}
                    </ScrollView>
                </View>

                <CreateCustomMoodModal
                    visible={isCreateModalVisible}
                    onClose={() => {
                        setIsCreateModalVisible(false);
                        setCreateError(null);
                    }}
                    onSave={handleCreateMood}
                    isLoading={isCreating}
                    error={createError}
                />
            </BlurView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalContainer: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#0A0A0A',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '85%',
        minHeight: '60%',
    },
    header: {
        alignItems: 'center',
        paddingTop: 12,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.08)',
    },
    handle: {
        width: 40,
        height: 4,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 2,
        marginBottom: 16,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        paddingHorizontal: 20,
        marginBottom: 16,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: 'white',
    },
    closeButton: {
        position: 'absolute',
        right: 20,
        padding: 4,
    },
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        padding: 4,
        marginHorizontal: 20,
        marginBottom: 12,
    },
    tab: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        borderRadius: 8,
    },
    activeTab: {
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    tabText: {
        fontSize: 14,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.4)',
    },
    activeTabText: {
        color: 'white',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 40,
        gap: 28,
    },
    categoryContainer: {
        gap: 12,
    },
    categoryTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 1,
        textTransform: 'uppercase',
        marginLeft: 4,
    },
    loadingCategoryContainer: {
        paddingVertical: 20,
        alignItems: 'center',
    },
    moodGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    moodPill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 100,
        backgroundColor: 'rgba(255,255,255,0.08)',
        gap: 8,
    },
    moodPillSelected: {
        backgroundColor: '#FFFFFF',
    },
    moodPillDeleting: {
        opacity: 0.5,
    },
    moodText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.7)',
    },
    moodTextSelected: {
        color: '#000000',
        fontWeight: '600',
    },
    colorDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    miniDelete: {
        marginLeft: 4,
        padding: 2,
    },
    customContainer: {
        gap: 20,
    },
    loadingContainer: {
        paddingVertical: 40,
        alignItems: 'center',
        gap: 12,
    },
    loadingText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.5)',
    },
    createPill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 100,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        gap: 8,
    },
    createText: {
        fontSize: 14,
        color: Colors.obsy.silver,
        fontWeight: '500',
    },
    emptyState: {
        paddingTop: 20,
        paddingHorizontal: 20,
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.4)',
        textAlign: 'center',
        lineHeight: 20,
    },
});

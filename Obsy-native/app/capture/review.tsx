import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Image, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Modal, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ThemedText } from '@/components/ui/ThemedText';
import { GlassCard } from '@/components/ui/GlassCard';
import Colors from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { MOODS, MoodId } from '@/constants/Moods';
import { useCaptureStore } from '@/lib/captureStore';
import { useDailyChallenges } from '@/lib/challengeStore';
import { useAuth } from '@/contexts/AuthContext';
import { BlurView } from 'expo-blur';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { TagInput } from '@/components/capture/TagInput';
import { LinedJournalInput } from '@/components/capture/LinedJournalInput';
import { generateCaptureInsightSecure, CaptureData } from '@/services/secureAI';
import { getProfile } from '@/services/profile';
import { supabase } from '@/lib/supabase';
import { DestinationSelector } from '@/components/capture/DestinationSelector';
import { MoodSelectionModal } from '@/components/capture/MoodSelectionModal';
import { useMockAlbums } from '@/contexts/MockAlbumContext';
import { uploadCaptureImage } from '@/services/storage';
import { useCustomMoodStore } from '@/lib/customMoodStore';
import * as FileSystem from 'expo-file-system/legacy';
import { optimizeCapture, formatBytes } from '@/services/imageOptimizer';
import { useSubscription } from '@/hooks/useSubscription';
import { getMoodTheme } from '@/lib/moods';

export default function CaptureReviewScreen() {
    const { imageUri, challengeId, challengeTemplateId, challengeTitle, albumId: initialAlbumId,
    } = useLocalSearchParams<{
        imageUri: string,
        challengeId?: string,
        challengeTemplateId?: string,
        challengeTitle?: string,
        albumId?: string,
    }>();
    const router = useRouter();
    const { createCapture, getAllTags, lastUsedAlbumId, setLastUsedAlbumId, setPendingSaveAnimationUri, setPendingSaveMoodGradient, setPendingSaveComplete } = useCaptureStore();
    const { user } = useAuth();
    const { tier } = useSubscription();
    const { completeChallenge: markChallengeComplete } = useDailyChallenges(user?.id ?? null);
    const { setHasSharedPublicImage } = useMockAlbums();
    const { isDark, colors } = useObsyTheme();

    const journalInputRef = useRef<TextInput>(null);

    const [moodId, setMoodId] = useState<string | null>(null);
    const [note, setNote] = useState('');
    const [tags, setTags] = useState<string[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [journalModalVisible, setJournalModalVisible] = useState(false);
    const [moodModalVisible, setMoodModalVisible] = useState(false);
    const [usePhotoForInsight, setUsePhotoForInsight] = useState(false);

    const { getMoodById, systemMoods, customMoods } = useCustomMoodStore();

    // Get selected mood label for display
    const selectedMoodLabel = moodId
        ? (getMoodById(moodId)?.name || MOODS.find(m => m.id === moodId)?.label)
        : null;

    // Multi-Select Destinations
    // Default to Private + Initial Album (if any) OR Private + Last Used (if any)
    const [postDestinations, setPostDestinations] = useState<string[]>(() => {
        const dests = ['private'];
        if (initialAlbumId) {
            dests.push(initialAlbumId);
        } else if (lastUsedAlbumId) {
            dests.push(lastUsedAlbumId);
        }
        return [...new Set(dests)]; // Unique
    });

    const [albums, setAlbums] = useState<{ id: string, name: string }[]>([]);

    // Public album constant (not stored in database)
    const PUBLIC_ALBUM = { id: 'public', name: 'Public' };

    useEffect(() => {
        if (user) {
            supabase
                .from('albums')
                .select('id, name')
                .order('created_at', { ascending: false })
                .then(({ data }) => {
                    // Add Public album first, then user's albums
                    if (data) {
                        setAlbums([PUBLIC_ALBUM, ...data]);
                    } else {
                        setAlbums([PUBLIC_ALBUM]);
                    }
                });
        } else {
            setAlbums([PUBLIC_ALBUM]);
        }
    }, [user]);


    if (!imageUri) {
        router.back();
        return null;
    }

    const handleToggleDestination = (id: string) => {
        setPostDestinations(prev => {
            if (prev.includes(id)) {
                return prev.filter(d => d !== id);
            } else {
                return [...prev, id];
            }
        });
    };

    const handleSave = async () => {
        if (!moodId) return;

        setIsSaving(true);

        // Capture all values from component scope before navigating away
        const saveMoodId = moodId;
        const saveNote = note;
        const saveTags = tags;
        const saveDestinations = postDestinations;
        const saveUsePhotoForInsight = usePhotoForInsight;
        const saveTier = tier;
        const saveUser = user;
        const saveChallengeId = challengeId;
        const saveChallengeTemplateId = challengeTemplateId;

        // Set animation state and navigate to home IMMEDIATELY
        setPendingSaveAnimationUri(imageUri);
        setPendingSaveMoodGradient(getMoodTheme(saveMoodId).gradient);
        setPendingSaveComplete(false);

        router.dismissAll();
        setTimeout(() => {
            router.replace('/(tabs)');
        }, 100);

        // ── Background save (continues after component unmounts) ────────
        // All store updates use Zustand (global), so they work after unmount.
        try {
            // 0. Optimize image for storage efficiency
            console.log('[Review] Optimizing image for storage...');
            const optimized = await optimizeCapture(imageUri);
            console.log('[Review] Image optimized');

            // Check if user wants Obsy Notes
            const profile = await getProfile();
            let obsyNote: string | null = null;

            if (profile?.ai_per_photo_captions) {
                try {
                    const moodLabel = MOODS.find(m => m.id === saveMoodId)?.label || "neutral";

                    const captureData: CaptureData = {
                        mood: moodLabel,
                        note: saveNote || undefined,
                        capturedAt: new Date().toISOString(),
                        tags: saveTags,
                        timeBucket: undefined,
                    };

                    obsyNote = await generateCaptureInsightSecure(
                        captureData,
                        profile.ai_tone || 'friendly',
                        profile.selected_custom_tone_id
                    );
                } catch (aiError: any) {
                    console.error('[Review] Obsy Note generation failed:', aiError);
                    obsyNote = null;
                }
            }

            // 1. Create the Master Capture
            const moodName = getMoodById(saveMoodId)?.name || MOODS.find(m => m.id === saveMoodId)?.label || saveMoodId;

            const newCaptureId = await createCapture(
                optimized.preview,
                saveMoodId,
                moodName,
                saveNote,
                saveTags,
                saveChallengeId && saveChallengeTemplateId ? { challengeId: saveChallengeId, templateId: saveChallengeTemplateId } : undefined,
                obsyNote,
                saveUsePhotoForInsight,
                saveTier
            );

            if (saveChallengeId && newCaptureId) {
                await markChallengeComplete(saveUser?.id ?? null, saveChallengeId, newCaptureId);
            }

            // 2. Link to Albums
            if (newCaptureId) {
                const albumIds = saveDestinations.filter(id => id !== 'private' && id !== 'public');
                console.log('[Review] Albums to link:', albumIds, 'Entry ID:', newCaptureId);

                if (albumIds.length > 0) {
                    let cloudUploadSucceeded = false;

                    if (saveUser) {
                        console.log('[Review] Album selected, uploading optimized full-res for sharing...');

                        const localFilePath = optimized.fullRes;
                        const fileInfo = await FileSystem.getInfoAsync(localFilePath);

                        if (!fileInfo.exists) {
                            console.error('[Review] Optimized full-res file does not exist, cannot upload');
                        } else {
                            let remotePath = await uploadCaptureImage(localFilePath, saveUser.id);

                            if (!remotePath) {
                                console.warn('[Review] First upload attempt failed, retrying...');
                                await new Promise(resolve => setTimeout(resolve, 1000));
                                remotePath = await uploadCaptureImage(localFilePath, saveUser.id);
                            }

                            if (remotePath) {
                                const { error: updateError } = await supabase
                                    .from('entries')
                                    .update({ photo_path: remotePath })
                                    .eq('id', newCaptureId);

                                if (!updateError) {
                                    cloudUploadSucceeded = true;
                                }

                                try {
                                    await FileSystem.deleteAsync(localFilePath, { idempotent: true });
                                } catch (cleanupError) {
                                    console.warn('[Review] Could not delete local full-res:', cleanupError);
                                }
                            } else {
                                console.error('[Review] Photo upload failed after retry');
                            }
                        }
                    }

                    if (cloudUploadSucceeded) {
                        const { data: membershipData } = await supabase
                            .from('album_members')
                            .select('album_id')
                            .eq('user_id', saveUser?.id)
                            .in('album_id', albumIds);

                        const validAlbumIds = membershipData?.map(m => m.album_id) || [];

                        if (validAlbumIds.length > 0) {
                            const albumEntries = validAlbumIds.map(albumId => ({
                                album_id: albumId,
                                entry_id: newCaptureId
                            }));

                            try {
                                const { error: albumError } = await supabase
                                    .from('album_entries')
                                    .insert(albumEntries)
                                    .select();

                                if (!albumError) {
                                    setLastUsedAlbumId(validAlbumIds[validAlbumIds.length - 1]);
                                } else {
                                    console.error('Error linking to albums:', albumError);
                                }
                            } catch (insertError) {
                                console.error('Unexpected error linking to albums:', insertError);
                            }
                        } else {
                            setLastUsedAlbumId(null);
                        }
                    } else {
                        console.warn('[Review] Cloud upload failed - skipping album linking');
                    }
                } else {
                    setLastUsedAlbumId(null);
                }
            }

            // Track album sharing for onboarding
            const hasSharedToAlbum = saveDestinations.some(id => id !== 'private');
            if (hasSharedToAlbum) {
                setHasSharedPublicImage(true);
            }

            console.log('[Review] Background save complete');
            setPendingSaveComplete(true);
        } catch (error) {
            console.error('[Review] Background save failed:', error);
            // Clear animation on error — orb disappears
            setPendingSaveAnimationUri(null);
        }
    };

    return (
        <ScreenWrapper>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 20} // Increased offset
            >
                <ScrollView
                    contentContainerStyle={[styles.content, { paddingBottom: 100 }]} // Extra padding for scroll
                    keyboardDismissMode="on-drag"
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >

                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                            <Ionicons name="chevron-back" size={28} color="white" />
                        </TouchableOpacity>
                        <ThemedText type="subtitle">Details</ThemedText>
                        <View style={{ width: 28 }} />
                    </View>

                    {/* Image Preview */}
                    <View style={styles.imageContainer}>
                        <Image source={{ uri: imageUri }} style={styles.image} />

                        {challengeTitle && (
                            <BlurView intensity={30} tint="dark" style={styles.challengeBanner}>
                                <View style={styles.challengeBadge}>
                                    <Ionicons name="flash" size={12} color={Colors.obsy.silver} />
                                    <ThemedText style={styles.challengeBadgeText}>CHALLENGE</ThemedText>
                                </View>
                                <ThemedText style={styles.challengeTitle} numberOfLines={1}>
                                    {challengeTitle}
                                </ThemedText>
                            </BlurView>
                        )}
                    </View>

                    {/* Mood Picker Trigger & Photo Insight Checkmark */}
                    <View style={styles.reviewControlsRow}>
                        <TouchableOpacity
                            style={[
                                styles.moodTrigger,
                                selectedMoodLabel && styles.moodTriggerSelected,
                            ]}
                            onPress={() => setMoodModalVisible(true)}
                            activeOpacity={0.7}
                        >
                            {selectedMoodLabel ? (
                                <>
                                    <ThemedText style={styles.moodTriggerText}>
                                        {selectedMoodLabel}
                                    </ThemedText>
                                    <Ionicons name="chevron-down" size={16} color="rgba(0,0,0,0.6)" />
                                </>
                            ) : (
                                <>
                                    <Ionicons name="add" size={18} color="rgba(255,255,255,0.6)" />
                                    <ThemedText style={styles.moodTriggerPlaceholder}>
                                        Select Mood
                                    </ThemedText>
                                </>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.insightOptIn}
                            onPress={() => setUsePhotoForInsight(!usePhotoForInsight)}
                            activeOpacity={0.7}
                        >
                            <View style={[
                                styles.checkmark,
                                usePhotoForInsight && styles.checkmarkChecked
                            ]}>
                                {usePhotoForInsight && (
                                    <Ionicons name="checkmark" size={14} color="black" />
                                )}
                            </View>
                            <ThemedText style={styles.optInLabel}>Use photo for insight</ThemedText>
                        </TouchableOpacity>
                    </View>

                    {/* Destination Selector */}
                    <DestinationSelector
                        albums={albums}
                        selectedIds={postDestinations}
                        onToggle={handleToggleDestination}
                    />

                    {/* Tag Input */}
                    <View style={styles.section}>
                        <ThemedText type="caption" style={styles.label}>TAGS</ThemedText>
                        <TagInput
                            existingTags={getAllTags()}
                            selectedTags={tags}
                            onTagsChange={setTags}
                        />
                    </View>

                    {/* Note Input Trigger */}
                    <View style={styles.section}>
                        <ThemedText type="caption" style={styles.label}>JOURNAL (OPTIONAL)</ThemedText>
                        <TouchableOpacity
                            onPress={() => setJournalModalVisible(true)}
                            activeOpacity={0.8}
                            style={styles.journalInput}
                        >
                            <ThemedText
                                style={[styles.inputPreview, !note && styles.placeholderText]}
                                numberOfLines={3}
                                ellipsizeMode="tail"
                            >
                                {note || "Write anything about this moment..."}
                            </ThemedText>
                        </TouchableOpacity>
                    </View>

                    {/* Save Button */}
                    <TouchableOpacity
                        style={[styles.saveButton, (!moodId || isSaving) && styles.saveButtonDisabled]}
                        onPress={handleSave}
                        disabled={!moodId || isSaving}
                    >
                        <ThemedText style={styles.saveButtonText}>
                            {postDestinations.length > 0 ? 'Save Entry' : 'Select Destination'}
                        </ThemedText>
                    </TouchableOpacity>

                </ScrollView>
            </KeyboardAvoidingView>

            {/* Journal Modal */}
            <Modal
                visible={journalModalVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setJournalModalVisible(false)}
            >
                <BlurView
                    intensity={isDark ? 95 : 80}
                    tint={isDark ? 'dark' : 'light'}
                    style={styles.modalContainer}
                >
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={styles.modalKeyboardAvoid}
                    >
                        <View style={[styles.modalHeader, { borderBottomColor: colors.cardBorder }]}>
                            <TouchableOpacity onPress={() => setJournalModalVisible(false)}>
                                <ThemedText style={styles.modalDoneText}>Done</ThemedText>
                            </TouchableOpacity>
                        </View>

                        <LinedJournalInput
                            ref={journalInputRef}
                            value={note}
                            onChangeText={setNote}
                        />
                    </KeyboardAvoidingView>
                </BlurView>
            </Modal>

            {/* Mood Selection Modal */}
            <MoodSelectionModal
                visible={moodModalVisible}
                selectedMood={moodId}
                onSelect={setMoodId}
                onClose={() => setMoodModalVisible(false)}
            />

        </ScreenWrapper>
    );
}

const styles = StyleSheet.create({
    content: {
        padding: 20,
        paddingBottom: 40,
        gap: 24,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    backButton: {
        padding: 4,
    },
    imageContainer: {
        width: '100%',
        aspectRatio: 3 / 4, // BeReal-style 3:4 aspect ratio
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    section: {
        gap: 12,
    },
    label: {
        marginLeft: 4,
        letterSpacing: 1,
    },
    moodTrigger: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 100,
        backgroundColor: 'rgba(255,255,255,0.1)',
        gap: 8,
    },
    moodTriggerSelected: {
        backgroundColor: '#FFFFFF',
    },
    moodTriggerText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#000000',
    },
    moodTriggerPlaceholder: {
        fontSize: 15,
        color: 'rgba(255,255,255,0.6)',
    },
    reviewControlsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
    },
    insightOptIn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    checkmark: {
        width: 22,
        height: 22,
        borderRadius: 6,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.3)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkmarkChecked: {
        backgroundColor: Colors.obsy.silver,
        borderColor: Colors.obsy.silver,
    },
    optInLabel: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.7)',
        fontWeight: '500',
    },
    journalInput: {
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 16,
        padding: 16,
        minHeight: 120,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        justifyContent: 'center',
    },
    inputPreview: {
        color: 'white',
        fontSize: 16,
    },
    placeholderText: {
        color: 'rgba(255,255,255,0.4)',
    },
    saveButton: {
        backgroundColor: Colors.obsy.silver,
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 10,
        marginBottom: 20,
        shadowColor: Colors.obsy.silver,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 5,
    },
    saveButtonDisabled: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        shadowOpacity: 0,
    },
    saveButtonText: {
        color: 'black',
        fontSize: 16,
        fontWeight: '600',
    },
    modalContainer: {
        flex: 1,
        paddingTop: 60,
    },
    modalKeyboardAvoid: {
        flex: 1,
        paddingBottom: 20,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingBottom: 20,
        borderBottomWidth: 1,
    },
    modalDoneText: {
        color: Colors.obsy.silver,
        fontSize: 18,
        fontWeight: '600',
    },
    challengeBanner: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 16,
        paddingBottom: 20,
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    challengeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 4,
    },
    challengeBadgeText: {
        fontSize: 10,
        fontWeight: '700',
        color: Colors.obsy.silver,
        letterSpacing: 1,
    },
    challengeTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: 'white',
    },
});

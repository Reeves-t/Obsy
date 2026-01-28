import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Image, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Modal } from 'react-native';
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
import { TagInput } from '@/components/capture/TagInput';
import { generateObsyNote } from '@/services/ai';
import { getProfile } from '@/services/profile';
import { supabase } from '@/lib/supabase';
import { DestinationSelector } from '@/components/capture/DestinationSelector';
import { MoodSelectionModal } from '@/components/capture/MoodSelectionModal';
import { useMockAlbums } from '@/contexts/MockAlbumContext';
import { uploadCaptureImage } from '@/services/storage';
import { useCustomMoodStore } from '@/lib/customMoodStore';
import * as FileSystem from 'expo-file-system/legacy';
import { optimizeCapture, formatBytes } from '@/services/imageOptimizer';

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
    const { createCapture, getAllTags, lastUsedAlbumId, setLastUsedAlbumId } = useCaptureStore();
    const { user } = useAuth();
    const { completeChallenge: markChallengeComplete } = useDailyChallenges(user?.id ?? null);
    const { setHasSharedPublicImage } = useMockAlbums();

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
        try {
            // 0. Optimize image for storage efficiency (BeReal-style tiered storage)
            // Creates: thumbnail (~10KB), preview (~80KB), full-res (~200KB)
            // Saves ~90% storage vs raw camera output
            console.log('[Review] Optimizing image for storage...');
            const optimized = await optimizeCapture(imageUri);
            console.log('[Review] Image optimized:');
            console.log('  - Thumbnail:', optimized.thumbnail);
            console.log('  - Preview:', optimized.preview);
            console.log('  - Full-res (for cloud):', optimized.fullRes);

            // Check if user wants Obsy Notes
            const profile = await getProfile();
            let obsyNote: string | null = null;

            if (profile?.ai_per_photo_captions) {
                const moodLabel = MOODS.find(m => m.id === moodId)?.label || "neutral";
                // Use preview for AI analysis (good enough quality, faster)
                obsyNote = await generateObsyNote(optimized.preview, moodLabel);
            }

            // 1. Create the Master Capture (using preview for local display)
            // Get the mood name for the snapshot - required for historical preservation
            const moodName = getMoodById(moodId)?.name || MOODS.find(m => m.id === moodId)?.label || moodId;

            const newCaptureId = await createCapture(
                optimized.preview, // Use optimized preview instead of raw image
                moodId,
                moodName,
                note,
                tags,
                challengeId && challengeTemplateId ? { challengeId, templateId: challengeTemplateId } : undefined,
                obsyNote,
                usePhotoForInsight
            );

            if (challengeId && newCaptureId) {
                await markChallengeComplete(user?.id ?? null, challengeId, newCaptureId);
            }

            // 2. Link to Albums
            if (newCaptureId) {
                // Filter out 'private' and 'public' (mock album, not in database)
                const albumIds = postDestinations.filter(id => id !== 'private' && id !== 'public');
                console.log('[Review] Albums to link:', albumIds, 'Entry ID:', newCaptureId);

                if (albumIds.length > 0) {
                    // CRITICAL: Upload the optimized full-res image to cloud for sharing
                    // This is smaller than raw (~200KB vs 2-5MB) but still high quality
                    let cloudUploadSucceeded = false;

                    if (user) {
                        console.log('[Review] Album selected, uploading optimized full-res for sharing...');
                        console.log('[Review] User ID:', user.id);
                        console.log('[Review] Album IDs to link:', albumIds);
                        console.log('[Review] Using optimized full-res:', optimized.fullRes);

                        // Use the optimized full-res image directly (already exists, no need to fetch from DB)
                        const localFilePath = optimized.fullRes;

                        // Verify optimized full-res exists
                        const fileInfo = await FileSystem.getInfoAsync(localFilePath);
                        console.log('[Review] Optimized full-res check:', {
                            exists: fileInfo.exists,
                            size: fileInfo.exists && 'size' in fileInfo ? formatBytes(fileInfo.size) : 0,
                            path: localFilePath
                        });

                        if (!fileInfo.exists) {
                            console.error('[Review] Optimized full-res file does not exist, cannot upload');
                        } else {
                            console.log('[Review] Uploading optimized full-res to cloud...');

                            // Try upload with one retry
                            let remotePath = await uploadCaptureImage(localFilePath, user.id);

                            if (!remotePath) {
                                console.warn('[Review] First upload attempt failed, retrying in 1 second...');
                                await new Promise(resolve => setTimeout(resolve, 1000));
                                remotePath = await uploadCaptureImage(localFilePath, user.id);
                            }

                            if (remotePath) {
                                console.log('[Review] Upload successful. Remote path:', remotePath);

                                // Update the entry in DB with the remote path
                                const { error: updateError } = await supabase
                                    .from('entries')
                                    .update({ photo_path: remotePath })
                                    .eq('id', newCaptureId);

                                if (updateError) {
                                    console.error('[Review] Error updating photo_path after upload:', updateError);
                                } else {
                                    console.log('[Review] Entry updated with remote photo_path:', remotePath);
                                    cloudUploadSucceeded = true;
                                }

                                // Clean up local full-res after successful upload (keep preview + thumbnail)
                                try {
                                    await FileSystem.deleteAsync(localFilePath, { idempotent: true });
                                    console.log('[Review] Deleted local full-res after cloud upload (saves space)');
                                } catch (cleanupError) {
                                    console.warn('[Review] Could not delete local full-res:', cleanupError);
                                }
                            } else {
                                console.error('[Review] Photo upload failed after retry');
                            }
                        }
                    }

                    // Only proceed with album linking if cloud upload succeeded
                    // This ensures album bubbles will render correctly with cloud photos
                    if (!cloudUploadSucceeded) {
                        console.warn('[Review] Cloud upload failed - skipping album insertion to prevent empty bubbles');
                        alert('Entry saved to your journal, but could not upload photo for album sharing. Please try sharing again later.');
                        // Skip album insertion - entry is saved locally but won't appear in albums
                    } else {
                        // Validate user membership in each album before attempting insert
                    const { data: membershipData, error: membershipError } = await supabase
                        .from('album_members')
                        .select('album_id')
                        .eq('user_id', user?.id)
                        .in('album_id', albumIds);

                    console.log('[Review] Membership check:', { membershipData, membershipError });

                    if (membershipError) {
                        console.error('Error validating album membership:', membershipError);
                    }

                    // Filter to only albums where user is confirmed member
                    const validAlbumIds = membershipData?.map(m => m.album_id) || [];
                    const invalidAlbumIds = albumIds.filter(id => !validAlbumIds.includes(id));

                    console.log('[Review] Valid albums:', validAlbumIds, 'Invalid:', invalidAlbumIds);

                    if (invalidAlbumIds.length > 0) {
                        console.warn('User is not a member of some selected albums:', invalidAlbumIds);
                    }

                    // Only insert into albums where user is a member
                    if (validAlbumIds.length > 0) {
                        const albumEntries = validAlbumIds.map(albumId => ({
                            album_id: albumId,
                            entry_id: newCaptureId
                        }));

                        console.log('[Review] Inserting album_entries:', albumEntries);

                        try {
                            const { data: insertedData, error: albumError } = await supabase
                                .from('album_entries')
                                .insert(albumEntries)
                                .select();

                            console.log('[Review] album_entries insert result:', { insertedData, albumError });

                            // Verify album_entries were actually inserted
                            const { data: verifyAlbumEntries, error: verifyAlbumError } = await supabase
                                .from('album_entries')
                                .select('id, album_id, entry_id')
                                .eq('entry_id', newCaptureId);

                            console.log('[Review] Album entries verification:', {
                                entryId: newCaptureId,
                                expectedAlbums: validAlbumIds,
                                insertedCount: verifyAlbumEntries?.length,
                                insertedData: verifyAlbumEntries,
                                verifyError: verifyAlbumError
                            });

                            if (albumError) {
                                console.error('Error linking to albums:', albumError, {
                                    albumIds: validAlbumIds,
                                    entryId: newCaptureId
                                });

                                // Don't fail the entire save - entry was saved to private journal
                                // Just inform user about album linking issue
                                if (validAlbumIds.length === albumIds.length) {
                                    // All albums failed
                                    alert('Entry saved, but could not link to selected albums. Please try again.');
                                } else {
                                    // Some albums might have succeeded before error
                                    alert('Entry saved, but some albums could not be linked.');
                                }
                            } else {
                                console.log('[Review] Successfully linked to albums:', validAlbumIds);
                                // Success - update last used album
                                setLastUsedAlbumId(validAlbumIds[validAlbumIds.length - 1]);
                            }
                        } catch (insertError) {
                            console.error('Unexpected error linking to albums:', insertError);
                            alert('Entry saved to your journal, but album linking failed.');
                        }
                    } else {
                        // No valid albums to link to
                        console.warn('No valid albums to link entry to - user not a member of any selected albums');
                        setLastUsedAlbumId(null);
                    }
                    } // End of cloudUploadSucceeded else block
                } else {
                    // Only private selected
                    console.log('[Review] Only private journal selected, no album linking needed');
                    setLastUsedAlbumId(null);
                }
            }

            router.dismissAll();
            // Small delay to allow modal to close before switching tabs if needed
            setTimeout(() => {
                const hasSharedToAlbum = postDestinations.some(id => id !== 'private');

                // If we posted to at least one album, go to albums tab
                // and mark that the user has now shared a public image (to dismiss onboarding)
                if (hasSharedToAlbum) {
                    setHasSharedPublicImage(true);
                    router.replace('/albums');  // Use replace to avoid stacking screens
                } else {
                    router.replace('/(tabs)');  // Use replace to avoid stacking screens
                }
            }, 100);
        } catch (error) {
            console.error('Failed to save capture:', error);
            alert('Failed to save capture. Please try again.');
        } finally {
            setIsSaving(false);
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
                        {isSaving ? (
                            <ActivityIndicator color="white" />
                        ) : (
                            <ThemedText style={styles.saveButtonText}>
                                {postDestinations.length > 0 ? 'Save Entry' : 'Select Destination'}
                            </ThemedText>
                        )}
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
                <BlurView intensity={95} tint="dark" style={styles.modalContainer}>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={styles.modalKeyboardAvoid}
                    >
                        <View style={styles.modalHeader}>
                            <TouchableOpacity onPress={() => setJournalModalVisible(false)}>
                                <ThemedText style={styles.modalDoneText}>Done</ThemedText>
                            </TouchableOpacity>
                        </View>

                        <TextInput
                            style={styles.modalInput}
                            placeholder="Write anything about this moment..."
                            placeholderTextColor="rgba(255,255,255,0.4)"
                            multiline
                            textAlignVertical="top"
                            value={note}
                            onChangeText={setNote}
                            autoFocus={true}
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
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    modalDoneText: {
        color: Colors.obsy.silver,
        fontSize: 18,
        fontWeight: '600',
    },
    modalInput: {
        flex: 1,
        padding: 20,
        color: 'white',
        fontSize: 18,
        lineHeight: 28,
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

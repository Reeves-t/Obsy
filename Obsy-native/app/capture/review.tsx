import React, { useState, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View, Image, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Modal, Pressable, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ThemedText } from '@/components/ui/ThemedText';
import { GlassCard } from '@/components/ui/GlassCard';
import Colors from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { MOODS, MoodId } from '@/constants/Moods';
import { useCaptureStore } from '@/lib/captureStore';
import { useDailyChallenges } from '@/lib/challengeStore';
import { useAuth } from '@/contexts/AuthContext';
import { BlurView } from 'expo-blur';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { TagInput } from '@/components/capture/TagInput';
import { LinedJournalInput } from '@/components/capture/LinedJournalInput';
import { MoodSelectionModal } from '@/components/capture/MoodSelectionModal';
import { useCustomMoodStore } from '@/lib/customMoodStore';
import { optimizeCapture } from '@/services/imageOptimizer';
import { useSubscription } from '@/hooks/useSubscription';
import { getMoodTheme } from '@/lib/moods';

const SERIF_FONT = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

const GENTLE_PROMPTS = [
    'One small thing from today…',
    'What is asking for attention?',
    'Describe this feeling in three words.',
    'A moment you want to remember.',
    'What would you say to yourself right now?',
];

export default function CaptureReviewScreen() {
    const { imageUri, challengeId, challengeTemplateId, challengeTitle,
        topicId, topicTitle,
    } = useLocalSearchParams<{
        imageUri: string,
        challengeId?: string,
        challengeTemplateId?: string,
        challengeTitle?: string,
        topicId?: string,
        topicTitle?: string,
    }>();
    const isTopicEntry = !!topicId;
    const router = useRouter();
    const { createCapture, getAllTags, setPendingSaveAnimationUri, setPendingSaveMoodGradient, setPendingSaveComplete } = useCaptureStore();
    const { user } = useAuth();
    const { tier } = useSubscription();
    const { completeChallenge: markChallengeComplete } = useDailyChallenges(user?.id ?? null);
    const { isDark, colors } = useObsyTheme();

    const journalInputRef = useRef<TextInput>(null);

    const [moodId, setMoodId] = useState<string | null>(null);
    const [note, setNote] = useState('');
    const [tags, setTags] = useState<string[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [journalModalVisible, setJournalModalVisible] = useState(false);
    const [journalPromptsVisible, setJournalPromptsVisible] = useState(false);
    const [moodModalVisible, setMoodModalVisible] = useState(false);

    const { getMoodById, systemMoods, customMoods } = useCustomMoodStore();

    // Get selected mood label for display
    const selectedMoodLabel = moodId
        ? (getMoodById(moodId)?.name || MOODS.find(m => m.id === moodId)?.label)
        : null;

    const journalWords = useMemo(() => (note.trim() ? note.trim().split(/\s+/).length : 0), [note]);
    const journalReadTime = Math.max(1, Math.ceil(journalWords / 200));
    const journalDate = useMemo(() => {
        const d = new Date();
        return {
            dayName: d.toLocaleDateString('en-US', { weekday: 'long' }),
            dateLine: `${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`.toUpperCase(),
        };
    }, []);

    const journalOnSurfacePrimary = isDark ? 'rgba(255,255,255,0.96)' : 'rgba(44,24,16,0.96)';
    const journalOnSurfaceSecondary = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(44,24,16,0.55)';
    const journalMuted = isDark ? 'rgba(255,255,255,0.72)' : 'rgba(44,24,16,0.72)';
    const journalSubtle = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(44,24,16,0.4)';
    const journalPromptButtonBg = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.52)';
    const journalSheetBg = isDark ? 'rgba(20,18,16,0.95)' : 'rgba(248,240,228,0.96)';
    const journalSheetBorder = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(44,24,16,0.12)';

    if (!imageUri) {
        router.back();
        return null;
    }

    const applyJournalPrompt = (prompt: string) => {
        setJournalPromptsVisible(false);
        setNote((prev) => (prev.trim() ? `${prev}\n\n${prompt} ` : `${prompt} `));
        setTimeout(() => journalInputRef.current?.focus(), 120);
    };

    const handleSave = async () => {
        if (!moodId) return;

        setIsSaving(true);

        // Capture all values from component scope before navigating away
        const saveMoodId = moodId;
        const saveNote = note;
        const saveTags = isTopicEntry ? [...tags, `topic:${topicId}`] : tags;
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

            // 1. Create the Master Capture
            const moodName = getMoodById(saveMoodId)?.name || MOODS.find(m => m.id === saveMoodId)?.label || saveMoodId;

            const newCaptureId = await createCapture(
                optimized.preview,
                saveMoodId,
                moodName,
                saveNote,
                saveTags,
                saveChallengeId && saveChallengeTemplateId ? { challengeId: saveChallengeId, templateId: saveChallengeTemplateId } : undefined,
                saveTier,
                !isTopicEntry
            );

            if (saveChallengeId && newCaptureId) {
                await markChallengeComplete(saveUser?.id ?? null, saveChallengeId, newCaptureId);
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
                        <View style={styles.headerCenter}>
                            <ThemedText type="subtitle">Details</ThemedText>
                            {isTopicEntry && (
                                <View style={styles.topicBadge}>
                                    <ThemedText style={styles.topicBadgeText} numberOfLines={1}>
                                        {topicTitle}
                                    </ThemedText>
                                </View>
                            )}
                        </View>
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

                    {/* Mood Picker Trigger */}
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
                    </View>

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
                            Save Entry
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
                        <LinearGradient
                            pointerEvents="none"
                            colors={[
                                'rgba(218,180,130,0.04)',
                                'rgba(218,180,130,0.06)',
                                'rgba(180,140,100,0.03)',
                            ]}
                            locations={[0, 0.4, 1]}
                            style={StyleSheet.absoluteFill}
                        />

                        <View style={styles.journalEditorHeader}>
                            <TouchableOpacity
                                onPress={() => setJournalModalVisible(false)}
                                style={styles.journalHeaderIcon}
                            >
                                <Ionicons name="chevron-back" size={26} color={journalOnSurfacePrimary} />
                            </TouchableOpacity>

                            <View style={styles.journalHeaderTitleBlock}>
                                <ThemedText style={[styles.journalHeaderDay, { color: journalOnSurfacePrimary }]}>
                                    {journalDate.dayName}
                                </ThemedText>
                                <ThemedText style={[styles.journalHeaderDate, { color: journalOnSurfaceSecondary }]}>
                                    {journalDate.dateLine}
                                </ThemedText>
                            </View>

                            <TouchableOpacity
                                onPress={() => setJournalModalVisible(false)}
                                style={styles.journalHeaderDoneButton}
                            >
                                <ThemedText style={[styles.journalHeaderDoneText, { color: journalMuted }]}>
                                    Done
                                </ThemedText>
                            </TouchableOpacity>
                        </View>

                        <View style={[styles.journalDivider, { backgroundColor: colors.cardBorder }]} />

                        <LinedJournalInput
                            ref={journalInputRef}
                            value={note}
                            onChangeText={setNote}
                        />

                        <View style={[styles.journalEditorFooter, { borderTopColor: colors.cardBorder }]}>
                            <ThemedText style={[styles.journalMetaText, { color: journalSubtle }]}>
                                {journalWords} {journalWords === 1 ? 'word' : 'words'} · {journalReadTime} min read
                            </ThemedText>

                            <TouchableOpacity
                                onPress={() => setJournalPromptsVisible(true)}
                                style={[styles.journalPromptsButton, { backgroundColor: journalPromptButtonBg }]}
                            >
                                <ThemedText style={[styles.journalPromptsButtonText, { color: journalMuted }]}>
                                    Prompts
                                </ThemedText>
                            </TouchableOpacity>
                        </View>
                    </KeyboardAvoidingView>
                </BlurView>
            </Modal>

            <Modal
                visible={journalPromptsVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setJournalPromptsVisible(false)}
            >
                <Pressable style={styles.menuBackdrop} onPress={() => setJournalPromptsVisible(false)}>
                    <BlurView intensity={30} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
                    <Pressable
                        style={[
                            styles.journalPromptsSheet,
                            { backgroundColor: journalSheetBg, borderColor: journalSheetBorder },
                        ]}
                        onPress={() => {}}
                    >
                        <ThemedText style={[styles.journalPromptsHeading, { color: journalSubtle }]}>
                            Gentle prompts
                        </ThemedText>
                        {GENTLE_PROMPTS.map((prompt) => (
                            <TouchableOpacity
                                key={prompt}
                                style={styles.journalPromptRow}
                                onPress={() => applyJournalPrompt(prompt)}
                            >
                                <ThemedText style={[styles.journalPromptText, { color: journalOnSurfacePrimary }]}>
                                    {prompt}
                                </ThemedText>
                            </TouchableOpacity>
                        ))}
                    </Pressable>
                </Pressable>
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
    headerCenter: {
        alignItems: 'center',
    },
    topicBadge: {
        marginTop: 3,
        paddingHorizontal: 10,
        paddingVertical: 2,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.1)',
        maxWidth: 200,
    },
    topicBadgeText: {
        fontSize: 11,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.55)',
        letterSpacing: 0.2,
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
    journalEditorHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingTop: 8,
        paddingBottom: 10,
    },
    journalHeaderIcon: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    journalHeaderTitleBlock: {
        flex: 1,
        alignItems: 'center',
        paddingTop: 4,
    },
    journalHeaderDay: {
        fontFamily: SERIF_FONT,
        fontSize: 20,
        fontWeight: '500',
        letterSpacing: 0.2,
    },
    journalHeaderDate: {
        fontSize: 11,
        fontWeight: '500',
        letterSpacing: 1.4,
        marginTop: 3,
    },
    journalHeaderDoneButton: {
        minWidth: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 8,
    },
    journalHeaderDoneText: {
        fontSize: 15,
        fontWeight: '600',
    },
    journalDivider: {
        height: StyleSheet.hairlineWidth,
        marginHorizontal: 20,
    },
    journalEditorFooter: {
        borderTopWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 24,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    journalMetaText: {
        fontSize: 11,
        letterSpacing: 0.8,
    },
    journalPromptsButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    journalPromptsButtonText: {
        fontSize: 12,
        fontWeight: '500',
    },
    menuBackdrop: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    journalPromptsSheet: {
        margin: 12,
        marginBottom: 34,
        padding: 14,
        borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth,
    },
    journalPromptsHeading: {
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 1.4,
        marginBottom: 8,
        marginLeft: 6,
    },
    journalPromptRow: {
        paddingHorizontal: 10,
        paddingVertical: 10,
        borderRadius: 8,
    },
    journalPromptText: {
        fontSize: 14,
        fontFamily: SERIF_FONT,
        fontStyle: 'italic',
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

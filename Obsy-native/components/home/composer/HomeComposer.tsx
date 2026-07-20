import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Keyboard,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ui/ThemedText';
import { MoodSelectionModal } from '@/components/capture/MoodSelectionModal';
import { MoodTriggerRow } from '@/components/home/MoodTriggerRow';
import { UnpackButton } from '@/components/unpack/UnpackButton';
import { VanguardPaywall } from '@/components/paywall/VanguardPaywall';
import { AttachmentBar } from './AttachmentBar';
import { AttachmentPreview } from './AttachmentPreview';
import { VoiceRecordingOverlay } from './VoiceRecordingOverlay';
import { LinkInputSheet } from './LinkInputSheet';
import type { ComposerAttachment } from './types';
import { useUnpackStore } from '@/lib/unpackStore';
import type { UnpackContext } from '@/lib/unpack/types';
import { MOODS } from '@/constants/Moods';
import { useAuth } from '@/contexts/AuthContext';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { useCaptureStore } from '@/lib/captureStore';
import { useCustomMoodStore } from '@/lib/customMoodStore';
import { getMoodTheme } from '@/lib/moods';
import { optimizeCapture } from '@/services/imageOptimizer';
import { useSubscription } from '@/hooks/useSubscription';
import { useAiFreeMode } from '@/hooks/useAiFreeMode';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';

const COBALT = '#41caec';

/**
 * The home composer: Control-style input card with inline photo / voice /
 * link attachments and a mood trigger. Everything saves as one entry.
 */
export function HomeComposer() {
    const { user } = useAuth();
    const router = useRouter();
    const { colors, isLight } = useObsyTheme();
    const { tier } = useSubscription();
    const { aiFreeMode } = useAiFreeMode();
    const { getMoodById } = useCustomMoodStore();
    const {
        createJournalEntry,
        createCapture,
        createVoiceEntry,
        createSharedLinkEntry,
        setPendingSaveAnimationUri,
        setPendingSaveMoodGradient,
        setPendingSaveComplete,
    } = useCaptureStore();
    const recorder = useVoiceRecorder();

    const [text, setText] = useState('');
    const [attachment, setAttachment] = useState<ComposerAttachment>({ kind: 'none' });
    const [moodId, setMoodId] = useState<string | null>(null);
    const [moodName, setMoodName] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [moodModalVisible, setMoodModalVisible] = useState(false);
    const [linkSheetVisible, setLinkSheetVisible] = useState(false);
    const [showPaywall, setShowPaywall] = useState(false);
    const pendingSubmitRef = useRef(false);
    const pendingUnpackRef = useRef(false);

    // Mirror the recorder's lifecycle into the attachment state.
    useEffect(() => {
        if (recorder.status === 'idle') {
            setAttachment((prev) => (prev.kind === 'voice' ? { kind: 'none' } : prev));
            return;
        }
        if (recorder.status === 'recording') {
            setAttachment({ kind: 'voice', phase: 'recording' });
        } else if (recorder.status === 'processing') {
            setAttachment({ kind: 'voice', phase: 'processing' });
        } else if (recorder.status === 'error') {
            setAttachment({ kind: 'voice', phase: 'error' });
        } else if (recorder.status === 'ready' && recorder.result) {
            setAttachment({
                kind: 'voice',
                phase: 'ready',
                storagePath: recorder.result.storagePath,
                transcript: recorder.result.transcript,
                durationSec: recorder.result.durationSec,
                transcriptError: recorder.transcriptError,
            });
        }
    }, [recorder.status, recorder.result, recorder.transcriptError]);

    const isRecording = attachment.kind === 'voice' && attachment.phase === 'recording';
    const voiceBlocked = attachment.kind === 'voice' && attachment.phase !== 'ready';
    const hasContent = text.trim().length > 0 || attachment.kind !== 'none';
    const canSubmit = !isSaving && hasContent && !voiceBlocked;
    // Unpack appears once there's content to unpack; it's a Plus-only deeper flow.
    const showUnpack = hasContent && !isRecording;

    // ── Attachments ──────────────────────────────────────────────────────
    const attachFromCamera = async () => {
        const { granted } = await ImagePicker.requestCameraPermissionsAsync();
        if (!granted) {
            Alert.alert('Permission Required', 'Please allow camera access to take a photo.');
            return;
        }
        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.85,
        });
        if (!result.canceled && result.assets[0]) {
            setAttachment({ kind: 'photo', localUri: result.assets[0].uri });
        }
    };

    const attachFromLibrary = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission Required', 'Please allow access to your photo library.');
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.85,
        });
        if (!result.canceled && result.assets[0]) {
            setAttachment({ kind: 'photo', localUri: result.assets[0].uri });
        }
    };

    const handlePickPhoto = () => {
        if (attachment.kind === 'photo') {
            setAttachment({ kind: 'none' });
            return;
        }
        Alert.alert('Add a photo', undefined, [
            { text: 'Take photo', onPress: attachFromCamera },
            { text: 'Choose from library', onPress: attachFromLibrary },
            { text: 'Cancel', style: 'cancel' },
        ]);
    };

    const handleStartVoice = () => {
        if (!user) {
            Alert.alert('Sign in required', 'Sign in to record voice notes.');
            return;
        }
        if (attachment.kind === 'voice') return;
        Keyboard.dismiss();
        recorder.start();
    };

    const handleOpenLink = () => {
        if (attachment.kind === 'link') {
            setAttachment({ kind: 'none' });
            return;
        }
        Keyboard.dismiss();
        setLinkSheetVisible(true);
    };

    const handleRemoveAttachment = () => {
        if (attachment.kind === 'voice') {
            recorder.reset();
        }
        setAttachment({ kind: 'none' });
    };

    // ── Mood ─────────────────────────────────────────────────────────────
    const resolveMoodName = (id: string) =>
        getMoodById(id)?.name || MOODS.find((m) => m.id === id)?.label || id;

    const handleMoodSelect = (id: string) => {
        const name = resolveMoodName(id);
        setMoodId(id);
        setMoodName(name);
        if (pendingUnpackRef.current) {
            pendingUnpackRef.current = false;
            startUnpack(id, name);
            return;
        }
        if (pendingSubmitRef.current) {
            pendingSubmitRef.current = false;
            void performSave(id, name);
        }
    };

    const handleMoodModalClose = () => {
        pendingSubmitRef.current = false;
        pendingUnpackRef.current = false;
        setMoodModalVisible(false);
    };

    // ── Save ─────────────────────────────────────────────────────────────
    const performSave = async (saveMoodId: string, saveMoodName: string) => {
        if (isSaving) return;
        setIsSaving(true);
        const insights = !aiFreeMode;
        const saveText = text.trim();
        const saveAttachment = attachment;

        try {
            if (saveAttachment.kind === 'photo') {
                setPendingSaveAnimationUri(saveAttachment.localUri);
                setPendingSaveMoodGradient(getMoodTheme(saveMoodId).gradient);
                setPendingSaveComplete(false);
                try {
                    const optimized = await optimizeCapture(saveAttachment.localUri);
                    await createCapture(
                        optimized.preview,
                        saveMoodId,
                        saveMoodName,
                        saveText,
                        [],
                        undefined,
                        tier,
                        insights
                    );
                    setPendingSaveComplete(true);
                } catch (error) {
                    setPendingSaveAnimationUri(null);
                    setPendingSaveMoodGradient(null);
                    setPendingSaveComplete(false);
                    throw error;
                }
            } else if (saveAttachment.kind === 'voice') {
                const note = [saveText, saveAttachment.transcript?.trim()]
                    .filter(Boolean)
                    .join('\n\n');
                await createVoiceEntry(
                    user,
                    saveMoodId,
                    saveMoodName,
                    note,
                    saveAttachment.storagePath ?? '',
                    [],
                    insights
                );
            } else if (saveAttachment.kind === 'link') {
                await createSharedLinkEntry(
                    user,
                    saveMoodId,
                    saveMoodName,
                    saveAttachment.meta.url,
                    saveAttachment.meta.platform,
                    saveAttachment.meta.title,
                    null,
                    saveText || null,
                    insights
                );
            } else {
                await createJournalEntry(user, saveMoodId, saveMoodName, saveText, [], insights);
            }

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            setText('');
            setAttachment({ kind: 'none' });
            if (saveAttachment.kind === 'voice') recorder.reset();
            setMoodId(null);
            setMoodName('');
            Keyboard.dismiss();
        } catch (error) {
            console.error('[HomeComposer] Save failed:', error);
            const message =
                error instanceof Error ? error.message : 'Something went wrong. Please try again.';
            Alert.alert('Couldn’t save', message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleSubmit = () => {
        if (!canSubmit) return;
        if (!moodId) {
            pendingSubmitRef.current = true;
            Keyboard.dismiss();
            setMoodModalVisible(true);
            return;
        }
        void performSave(moodId, moodName);
    };

    // ── Unpack (Plus-only guided reflection) ─────────────────────────────
    const buildUnpackContext = (): UnpackContext => {
        const noteText = text.trim();
        if (attachment.kind === 'photo') {
            return { type: 'photo', text: noteText, photoLocalUri: attachment.localUri };
        }
        if (attachment.kind === 'voice') {
            return {
                type: 'voice',
                text: noteText,
                transcript: attachment.transcript ?? null,
                voiceStoragePath: attachment.storagePath ?? null,
                voiceDurationSec: attachment.durationSec ?? null,
            };
        }
        if (attachment.kind === 'link') {
            return {
                type: 'link',
                text: noteText,
                sharedLink: {
                    url: attachment.meta.url,
                    platform: attachment.meta.platform,
                    title: attachment.meta.title,
                    source: attachment.meta.domain,
                },
            };
        }
        return { type: 'text', text: noteText };
    };

    const startUnpack = (unpackMoodId: string, unpackMoodName: string) => {
        const context = buildUnpackContext();
        useUnpackStore.getState().begin(context, unpackMoodId, unpackMoodName);
        // The moment moves into the Unpack flow; clear the composer.
        setText('');
        setAttachment({ kind: 'none' });
        recorder.reset();
        setMoodId(null);
        setMoodName('');
        Keyboard.dismiss();
        router.push('/unpack/loading');
    };

    const handleUnpack = () => {
        if (isSaving || !hasContent || voiceBlocked) return;
        if (tier !== 'plus') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
            Keyboard.dismiss();
            setShowPaywall(true);
            return;
        }
        if (!moodId) {
            pendingUnpackRef.current = true;
            Keyboard.dismiss();
            setMoodModalVisible(true);
            return;
        }
        startUnpack(moodId, moodName);
    };

    // ── Render ───────────────────────────────────────────────────────────
    const cardBorder = isLight ? colors.cardBorder : 'rgba(255,255,255,0.09)';
    const submitBorder = isLight ? colors.cardBorder : 'rgba(255,255,255,0.14)';
    const submitBg = isLight ? 'rgba(20,20,22,0.94)' : 'rgba(255,255,255,0.08)';
    const submitText = isLight ? '#FFFFFF' : colors.text;

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={
                    isLight
                        ? ['rgba(20,20,22,0.88)', 'rgba(20,20,22,0.94)']
                        : ['rgba(7,10,22,0.55)', 'rgba(3,4,8,0.75)']
                }
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={[styles.card, { borderColor: cardBorder }]}
            >
                <TextInput
                    value={text}
                    onChangeText={setText}
                    placeholder="Drop a moment in…"
                    placeholderTextColor={isLight ? 'rgba(255,255,255,0.4)' : colors.textTertiary}
                    multiline
                    style={[styles.input, { color: isLight ? '#FFFFFF' : colors.text }]}
                    selectionColor={COBALT}
                    editable={!isSaving}
                />

                {isRecording ? (
                    <VoiceRecordingOverlay
                        elapsed={recorder.elapsed}
                        onStop={recorder.stop}
                        onCancel={recorder.cancel}
                    />
                ) : (
                    <AttachmentPreview attachment={attachment} onRemove={handleRemoveAttachment} />
                )}

                <View style={styles.footer}>
                    <AttachmentBar
                        activeKind={attachment.kind}
                        disabled={isSaving || isRecording}
                        onPickPhoto={handlePickPhoto}
                        onStartVoice={handleStartVoice}
                        onOpenLink={handleOpenLink}
                    />

                    <View style={styles.actions}>
                        <TouchableOpacity
                            activeOpacity={0.85}
                            onPress={handleSubmit}
                            disabled={!canSubmit}
                            style={[
                                styles.submitButton,
                                { backgroundColor: submitBg, borderColor: submitBorder },
                                !canSubmit && styles.submitDisabled,
                            ]}
                        >
                            {isSaving ? (
                                <ActivityIndicator size="small" color={submitText} />
                            ) : (
                                <>
                                    <ThemedText style={[styles.submitText, { color: submitText }]}>
                                        Log it
                                    </ThemedText>
                                    <Ionicons name="arrow-forward" size={15} color={submitText} />
                                </>
                            )}
                        </TouchableOpacity>

                        {showUnpack && (
                            <UnpackButton onPress={handleUnpack} disabled={isSaving || voiceBlocked} />
                        )}
                    </View>
                </View>
            </LinearGradient>

            <View style={styles.moodRow}>
                <MoodTriggerRow
                    moodId={moodId}
                    moodName={moodName}
                    onPress={() => {
                        Keyboard.dismiss();
                        setMoodModalVisible(true);
                    }}
                    onClear={() => {
                        setMoodId(null);
                        setMoodName('');
                    }}
                />
            </View>

            <MoodSelectionModal
                visible={moodModalVisible}
                selectedMood={moodId}
                onSelect={handleMoodSelect}
                onClose={handleMoodModalClose}
            />

            <LinkInputSheet
                visible={linkSheetVisible}
                onClose={() => setLinkSheetVisible(false)}
                onConfirm={(meta) => {
                    setAttachment({ kind: 'link', meta });
                    setLinkSheetVisible(false);
                }}
            />

            <VanguardPaywall
                visible={showPaywall}
                onClose={() => setShowPaywall(false)}
                featureName="Unpack"
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginTop: 24,
    },
    card: {
        borderRadius: 18,
        borderWidth: 1,
        paddingHorizontal: 16,
        paddingTop: 18,
        paddingBottom: 12,
    },
    input: {
        minHeight: 64,
        maxHeight: 140,
        fontSize: 17,
        lineHeight: 25,
        textAlignVertical: 'top',
        padding: 0,
        marginBottom: 14,
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    actions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    submitButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 10,
        minWidth: 92,
        justifyContent: 'center',
    },
    submitDisabled: {
        opacity: 0.4,
    },
    submitText: {
        fontSize: 14.5,
        fontWeight: '600',
    },
    moodRow: {
        marginTop: 14,
    },
});

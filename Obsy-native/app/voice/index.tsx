import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    StyleSheet,
    View,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
    TextInput,
    ScrollView,
    Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Audio } from 'expo-av';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ThemedText } from '@/components/ui/ThemedText';
import { Ionicons } from '@expo/vector-icons';
import { MoodSelectionModal } from '@/components/capture/MoodSelectionModal';
import { useCaptureStore } from '@/lib/captureStore';
import { useAuth } from '@/contexts/AuthContext';
import { useCustomMoodStore } from '@/lib/customMoodStore';
import { MOODS } from '@/constants/Moods';
import { supabase } from '@/lib/supabase';
import Colors from '@/constants/Colors';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    Easing,
    cancelAnimation,
} from 'react-native-reanimated';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';

type Step = 'mood' | 'recording' | 'review';

const MAX_DURATION_SECONDS = 180; // 3 minutes

function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

export default function VoiceNoteScreen() {
    const router = useRouter();
    const { createVoiceEntry } = useCaptureStore();
    const { user } = useAuth();
    const { getMoodById } = useCustomMoodStore();

    const [step, setStep] = useState<Step>('mood');
    const [moodId, setMoodId] = useState<string | null>(null);
    const [moodName, setMoodName] = useState('');

    // Recording state
    const [isRecording, setIsRecording] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [recordingUri, setRecordingUri] = useState<string | null>(null);
    const [audioDuration, setAudioDuration] = useState(0);
    const recordingRef = useRef<Audio.Recording | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Playback state
    const [sound, setSound] = useState<Audio.Sound | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);

    // Transcription state
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [transcriptError, setTranscriptError] = useState(false);

    const [isSaving, setIsSaving] = useState(false);

    // Pulse animation for record button
    const pulseScale = useSharedValue(1);
    const pulseStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pulseScale.value }],
    }));

    useEffect(() => {
        return () => {
            // Cleanup on unmount
            if (timerRef.current) clearInterval(timerRef.current);
            recordingRef.current?.stopAndUnloadAsync().catch(() => {});
            sound?.unloadAsync().catch(() => {});
        };
    }, [sound]);

    const handleMoodSelect = (id: string) => {
        const mood = getMoodById(id);
        const name = mood?.name || MOODS.find(m => m.id === id)?.label || id;
        setMoodId(id);
        setMoodName(name);
        setStep('recording');
    };

    const startRecording = async () => {
        const { granted } = await Audio.requestPermissionsAsync();
        if (!granted) {
            Alert.alert(
                'Microphone Access Needed',
                'Obsy needs microphone access to record voice notes. Enable it in Settings.',
                [{ text: 'OK' }]
            );
            return;
        }

        await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
        });

        const { recording } = await Audio.Recording.createAsync(
            Audio.RecordingOptionsPresets.HIGH_QUALITY
        );
        recordingRef.current = recording;
        setIsRecording(true);
        setElapsed(0);

        // Start pulse animation
        pulseScale.value = withRepeat(
            withTiming(1.12, { duration: 800, easing: Easing.inOut(Easing.ease) }),
            -1,
            true
        );

        // Start elapsed timer
        timerRef.current = setInterval(() => {
            setElapsed(prev => {
                if (prev + 1 >= MAX_DURATION_SECONDS) {
                    stopRecording();
                    return prev + 1;
                }
                return prev + 1;
            });
        }, 1000);
    };

    const stopRecording = useCallback(async () => {
        if (!recordingRef.current) return;

        cancelAnimation(pulseScale);
        pulseScale.value = 1;

        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }

        setIsRecording(false);

        try {
            await recordingRef.current.stopAndUnloadAsync();
            const uri = recordingRef.current.getURI();
            recordingRef.current = null;

            if (!uri) throw new Error('Recording URI is null');

            setRecordingUri(uri);
            setAudioDuration(elapsed);
            setStep('review');
            transcribeRecording(uri);
        } catch (err) {
            console.error('[VoiceNote] Stop recording error:', err);
        }
    }, [elapsed, pulseScale]);

    const transcribeRecording = async (uri: string) => {
        setIsTranscribing(true);
        setTranscriptError(false);

        try {
            // 1. Upload audio to Supabase Storage
            const fileName = `${Date.now()}.m4a`;
            const storagePath = `${user?.id ?? 'guest'}/${fileName}`;

            const base64 = await FileSystem.readAsStringAsync(uri, {
                encoding: FileSystem.EncodingType.Base64,
            });

            const { error: uploadError } = await supabase.storage
                .from('voice-notes')
                .upload(storagePath, decode(base64), {
                    contentType: 'audio/m4a',
                    upsert: false,
                });

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage
                .from('voice-notes')
                .getPublicUrl(storagePath);

            const audioUrl = urlData.publicUrl;

            // Store the URL so we can save it with the entry
            setRecordingUri(audioUrl);

            // 2. Call edge function for transcription
            const { data, error } = await supabase.functions.invoke('transcribe-voice-note', {
                body: { audioUrl, language: 'en' },
            });

            if (error) throw error;
            setTranscript(data?.transcript ?? '');
        } catch (err) {
            console.error('[VoiceNote] Transcription failed:', err);
            setTranscriptError(true);
            setTranscript('');
        } finally {
            setIsTranscribing(false);
        }
    };

    const handlePlayPause = async () => {
        if (!recordingUri) return;

        if (sound) {
            if (isPlaying) {
                await sound.pauseAsync();
                setIsPlaying(false);
            } else {
                await sound.playAsync();
                setIsPlaying(true);
            }
            return;
        }

        // Load sound for first play
        const { sound: newSound } = await Audio.Sound.createAsync(
            { uri: recordingUri },
            { shouldPlay: true },
            (status) => {
                if (status.isLoaded && status.didJustFinish) {
                    setIsPlaying(false);
                }
            }
        );
        setSound(newSound);
        setIsPlaying(true);
    };

    const handleReRecord = async () => {
        await sound?.unloadAsync();
        setSound(null);
        setIsPlaying(false);
        setRecordingUri(null);
        setTranscript('');
        setTranscriptError(false);
        setElapsed(0);
        setIsRecording(false);
    };

    const handleSave = async () => {
        if (!moodId || isSaving) return;
        setIsSaving(true);
        try {
            await createVoiceEntry(user, moodId, moodName, transcript, recordingUri ?? '');
            router.dismissAll();
            setTimeout(() => router.replace('/(tabs)'), 100);
        } catch (err) {
            console.error('[VoiceNote] Save failed:', err);
            setIsSaving(false);
        }
    };

    const handleBack = () => {
        if (step === 'recording') {
            setStep('mood');
        } else if (step === 'review') {
            handleReRecord().then(() => setStep('recording'));
        } else {
            router.back();
        }
    };

    const remaining = MAX_DURATION_SECONDS - elapsed;

    return (
        <ScreenWrapper>
            <View style={styles.header}>
                <TouchableOpacity onPress={handleBack} style={styles.headerButton}>
                    <Ionicons name="chevron-back" size={28} color="white" />
                </TouchableOpacity>
                <ThemedText style={styles.headerTitle}>
                    {step === 'review' ? moodName : 'Voice Note'}
                </ThemedText>
                {step === 'review' ? (
                    <TouchableOpacity onPress={handleSave} disabled={isSaving} style={styles.headerButton}>
                        <ThemedText style={[styles.doneText, isSaving && styles.doneTextDisabled]}>
                            {isSaving ? 'Saving…' : 'Done'}
                        </ThemedText>
                    </TouchableOpacity>
                ) : (
                    <View style={styles.headerButton} />
                )}
            </View>

            {/* Recording Step */}
            {step === 'recording' && (
                <View style={styles.recorderContainer}>
                    {/* Elapsed / Remaining */}
                    <ThemedText style={styles.timerText}>
                        {isRecording ? formatTime(elapsed) : '00:00'}
                    </ThemedText>
                    {isRecording && remaining <= 30 && (
                        <ThemedText style={styles.remainingText}>
                            {remaining}s remaining
                        </ThemedText>
                    )}

                    {/* Record button */}
                    <Animated.View style={pulseStyle}>
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={isRecording ? stopRecording : startRecording}
                            style={[styles.recordButton, isRecording && styles.recordButtonActive]}
                        >
                            <View style={[
                                styles.recordDot,
                                isRecording ? styles.recordDotStop : styles.recordDotIdle,
                            ]} />
                        </TouchableOpacity>
                    </Animated.View>

                    <ThemedText style={styles.recordHint}>
                        {isRecording ? 'Tap to stop' : 'Tap to record'}
                    </ThemedText>
                    <ThemedText style={styles.recordSubHint}>
                        Max {Math.floor(MAX_DURATION_SECONDS / 60)} minutes
                    </ThemedText>
                </View>
            )}

            {/* Review Step */}
            {step === 'review' && (
                <ScrollView
                    style={styles.reviewScroll}
                    contentContainerStyle={styles.reviewContent}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Playback bar */}
                    <View style={styles.playbackBar}>
                        <TouchableOpacity onPress={handlePlayPause} style={styles.playButton}>
                            <Ionicons
                                name={isPlaying ? 'pause' : 'play'}
                                size={22}
                                color="white"
                            />
                        </TouchableOpacity>
                        <View style={styles.playbackInfo}>
                            <ThemedText style={styles.playbackDuration}>
                                {formatTime(audioDuration)}
                            </ThemedText>
                            <ThemedText style={styles.playbackLabel}>voice note</ThemedText>
                        </View>
                        <TouchableOpacity onPress={handleReRecord} style={styles.reRecordButton}>
                            <Ionicons name="refresh" size={18} color="rgba(255,255,255,0.5)" />
                            <ThemedText style={styles.reRecordText}>Re-record</ThemedText>
                        </TouchableOpacity>
                    </View>

                    {/* Transcript area */}
                    <View style={styles.transcriptContainer}>
                        {isTranscribing ? (
                            <View style={styles.transcribingRow}>
                                <ActivityIndicator color={Colors.obsy.silver} size="small" />
                                <ThemedText style={styles.transcribingText}>Transcribing…</ThemedText>
                            </View>
                        ) : transcriptError ? (
                            <ThemedText style={styles.transcriptErrorText}>
                                Transcription failed. You can type your notes below.
                            </ThemedText>
                        ) : null}

                        <TextInput
                            style={styles.transcriptInput}
                            value={transcript}
                            onChangeText={setTranscript}
                            multiline
                            placeholder={isTranscribing ? '' : 'Transcript will appear here…'}
                            placeholderTextColor="rgba(255,255,255,0.3)"
                            editable={!isTranscribing}
                        />
                    </View>
                </ScrollView>
            )}

            {/* Mood picker */}
            <MoodSelectionModal
                visible={step === 'mood'}
                selectedMood={moodId}
                onSelect={handleMoodSelect}
                onClose={() => router.back()}
            />
        </ScreenWrapper>
    );
}

const RECORD_BTN_SIZE = 80;

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 60,
        paddingBottom: 16,
    },
    headerButton: {
        minWidth: 60,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: 'white',
    },
    doneText: {
        color: Colors.obsy.silver,
        fontSize: 17,
        fontWeight: '600',
        textAlign: 'right',
    },
    doneTextDisabled: {
        opacity: 0.4,
    },
    // ── Recording UI ─────────────────────────────────────────────────
    recorderContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        paddingBottom: 60,
    },
    timerText: {
        fontSize: 48,
        fontWeight: '200',
        color: 'white',
        letterSpacing: 2,
        fontVariant: ['tabular-nums'],
    },
    remainingText: {
        fontSize: 14,
        color: '#8B2252',
        fontWeight: '500',
        marginTop: -16,
    },
    recordButton: {
        width: RECORD_BTN_SIZE,
        height: RECORD_BTN_SIZE,
        borderRadius: RECORD_BTN_SIZE / 2,
        backgroundColor: 'rgba(139,34,82,0.15)',
        borderWidth: 2,
        borderColor: 'rgba(139,34,82,0.4)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    recordButtonActive: {
        backgroundColor: 'rgba(139,34,82,0.25)',
        borderColor: '#8B2252',
    },
    recordDot: {
        width: 36,
        height: 36,
    },
    recordDotIdle: {
        borderRadius: 18,
        backgroundColor: '#8B2252',
    },
    recordDotStop: {
        borderRadius: 6,
        backgroundColor: '#8B2252',
        width: 28,
        height: 28,
    },
    recordHint: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.5)',
        fontWeight: '400',
    },
    recordSubHint: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.25)',
    },
    // ── Review UI ────────────────────────────────────────────────────
    reviewScroll: {
        flex: 1,
    },
    reviewContent: {
        padding: 20,
        gap: 20,
        paddingBottom: 60,
    },
    playbackBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        gap: 12,
    },
    playButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    playbackInfo: {
        flex: 1,
    },
    playbackDuration: {
        fontSize: 16,
        fontWeight: '600',
        color: 'white',
    },
    playbackLabel: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
    },
    reRecordButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    reRecordText: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.5)',
    },
    transcriptContainer: {
        gap: 12,
    },
    transcribingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    transcribingText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.5)',
    },
    transcriptErrorText: {
        fontSize: 13,
        color: 'rgba(255,100,100,0.7)',
    },
    transcriptInput: {
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 16,
        padding: 16,
        minHeight: 160,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        color: 'white',
        fontSize: 16,
        lineHeight: 24,
        textAlignVertical: 'top',
        ...Platform.select({ android: { textAlignVertical: 'top' as const } }),
    },
});

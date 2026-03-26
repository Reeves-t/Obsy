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
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { useObsyTheme } from '@/contexts/ThemeContext';

type Step = 'recording' | 'review';

const MAX_DURATION_SECONDS = 180;
const BAR_MAX_HEIGHT = 56;
const BAR_MIN_HEIGHT = 4;

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
    const { colors } = useObsyTheme();

    // Mood state
    const [moodId, setMoodId] = useState<string | null>(null);
    const [moodName, setMoodName] = useState('');
    const [moodModalVisible, setMoodModalVisible] = useState(false);

    const [step, setStep] = useState<Step>('recording');

    // Recording state
    const [isRecording, setIsRecording] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [audioDuration, setAudioDuration] = useState(0);
    const recordingRef = useRef<Audio.Recording | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const meteringTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const elapsedRef = useRef(0);
    const isPausedRef = useRef(false);

    // Playback
    const [sound, setSound] = useState<Audio.Sound | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);

    // Transcription
    const [audioStorageUrl, setAudioStorageUrl] = useState<string | null>(null);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [transcriptError, setTranscriptError] = useState(false);

    const [isSaving, setIsSaving] = useState(false);

    // Pulse animation for record button
    const pulseScale = useSharedValue(1);
    const pulseStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pulseScale.value }],
    }));

    // Pitch bar animations
    const bar1H = useSharedValue(BAR_MIN_HEIGHT);
    const bar2H = useSharedValue(BAR_MIN_HEIGHT);
    const bar3H = useSharedValue(BAR_MIN_HEIGHT);

    const bar1Style = useAnimatedStyle(() => ({ height: bar1H.value }));
    const bar2Style = useAnimatedStyle(() => ({ height: bar2H.value }));
    const bar3Style = useAnimatedStyle(() => ({ height: bar3H.value }));

    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (meteringTimerRef.current) clearInterval(meteringTimerRef.current);
            recordingRef.current?.stopAndUnloadAsync().catch(() => {});
            sound?.unloadAsync().catch(() => {});
        };
    }, [sound]);

    const handleMoodSelect = (id: string) => {
        const mood = getMoodById(id);
        setMoodId(id);
        setMoodName(mood?.name || MOODS.find(m => m.id === id)?.label || id);
    };

    const updateMeteringBars = (meteringDb: number) => {
        // Normalize dBFS (-60 to 0) → 0 to 1
        const level = Math.max(0, Math.min(1, (meteringDb + 60) / 60));
        const h1 = BAR_MIN_HEIGHT + level * (BAR_MAX_HEIGHT - BAR_MIN_HEIGHT);
        const h2 = BAR_MIN_HEIGHT + level * (BAR_MAX_HEIGHT - BAR_MIN_HEIGHT) * 0.85;
        const h3 = BAR_MIN_HEIGHT + level * (BAR_MAX_HEIGHT - BAR_MIN_HEIGHT) * 0.7;
        bar1H.value = withTiming(h1, { duration: 80 });
        bar2H.value = withTiming(h2, { duration: 100 });
        bar3H.value = withTiming(h3, { duration: 60 });
    };

    const resetBars = () => {
        bar1H.value = withTiming(BAR_MIN_HEIGHT, { duration: 300 });
        bar2H.value = withTiming(BAR_MIN_HEIGHT, { duration: 300 });
        bar3H.value = withTiming(BAR_MIN_HEIGHT, { duration: 300 });
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

        const { recording } = await Audio.Recording.createAsync({
            ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
            isMeteringEnabled: true,
        });
        recordingRef.current = recording;
        elapsedRef.current = 0;
        isPausedRef.current = false;
        setIsRecording(true);
        setIsPaused(false);
        setElapsed(0);

        pulseScale.value = withRepeat(
            withTiming(1.12, { duration: 800, easing: Easing.inOut(Easing.ease) }),
            -1,
            true
        );

        timerRef.current = setInterval(() => {
            if (!isPausedRef.current) {
                elapsedRef.current += 1;
                setElapsed(elapsedRef.current);
                if (elapsedRef.current >= MAX_DURATION_SECONDS) {
                    stopRecording();
                }
            }
        }, 1000);

        meteringTimerRef.current = setInterval(async () => {
            if (recordingRef.current && !isPausedRef.current) {
                try {
                    const status = await recordingRef.current.getStatusAsync();
                    if (status.isRecording && status.metering !== undefined) {
                        updateMeteringBars(status.metering);
                    }
                } catch { /* ignore */ }
            }
        }, 100);
    };

    const pauseRecording = async () => {
        if (!recordingRef.current || isPaused) return;
        try {
            await recordingRef.current.pauseAsync();
            isPausedRef.current = true;
            setIsPaused(true);
            cancelAnimation(pulseScale);
            pulseScale.value = withTiming(1, { duration: 200 });
            resetBars();
        } catch (err) {
            console.error('[VoiceNote] Pause error:', err);
        }
    };

    const resumeRecording = async () => {
        if (!recordingRef.current || !isPaused) return;
        try {
            await recordingRef.current.startAsync();
            isPausedRef.current = false;
            setIsPaused(false);
            pulseScale.value = withRepeat(
                withTiming(1.12, { duration: 800, easing: Easing.inOut(Easing.ease) }),
                -1,
                true
            );
        } catch (err) {
            console.error('[VoiceNote] Resume error:', err);
        }
    };

    const stopRecording = useCallback(async () => {
        if (!recordingRef.current) return;

        cancelAnimation(pulseScale);
        pulseScale.value = withTiming(1, { duration: 200 });
        resetBars();

        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        if (meteringTimerRef.current) {
            clearInterval(meteringTimerRef.current);
            meteringTimerRef.current = null;
        }

        setIsRecording(false);
        setIsPaused(false);
        isPausedRef.current = false;

        try {
            await recordingRef.current.stopAndUnloadAsync();
            const uri = recordingRef.current.getURI();
            recordingRef.current = null;
            if (!uri) throw new Error('Recording URI is null');

            setAudioDuration(elapsedRef.current);
            setStep('review');
            transcribeRecording(uri);
        } catch (err) {
            console.error('[VoiceNote] Stop recording error:', err);
        }
    }, [pulseScale]);

    const transcribeRecording = async (uri: string) => {
        setIsTranscribing(true);
        setTranscriptError(false);

        try {
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
            setAudioStorageUrl(audioUrl);

            const { data, error } = await supabase.functions.invoke('transcribe-voice-note', {
                body: { audioUrl, language: 'en' },
            });

            if (error) throw error;
            setTranscript(data?.transcript ?? '');
        } catch (err) {
            console.error('[VoiceNote] Transcription failed:', err);
            setTranscriptError(true);
        } finally {
            setIsTranscribing(false);
        }
    };

    const handlePlayPause = async () => {
        if (!audioStorageUrl) return;

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

        const { sound: newSound } = await Audio.Sound.createAsync(
            { uri: audioStorageUrl },
            { shouldPlay: true },
            (status) => {
                if (status.isLoaded && status.didJustFinish) setIsPlaying(false);
            }
        );
        setSound(newSound);
        setIsPlaying(true);
    };

    const handleReRecord = async () => {
        await sound?.unloadAsync();
        setSound(null);
        setIsPlaying(false);
        setAudioStorageUrl(null);
        setTranscript('');
        setTranscriptError(false);
        setElapsed(0);
        elapsedRef.current = 0;
        setStep('recording');
    };

    const handleSave = async () => {
        if (!moodId || isSaving || !audioStorageUrl) return;
        setIsSaving(true);
        try {
            await createVoiceEntry(user, moodId, moodName, transcript, audioStorageUrl);
            router.dismissAll();
            setTimeout(() => router.replace('/(tabs)'), 100);
        } catch (err) {
            console.error('[VoiceNote] Save failed:', err);
            setIsSaving(false);
        }
    };

    const canSave = !!moodId && !!audioStorageUrl && !isTranscribing && !isSaving;
    const remaining = MAX_DURATION_SECONDS - elapsed;

    const MoodTrigger = () => (
        <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setMoodModalVisible(true)}
            style={[styles.moodTrigger, moodId && styles.moodTriggerSelected]}
        >
            {moodId ? (
                <>
                    <ThemedText style={styles.moodTriggerText}>{moodName}</ThemedText>
                    <Ionicons name="chevron-down" size={14} color="rgba(0,0,0,0.6)" />
                </>
            ) : (
                <>
                    <Ionicons name="add" size={16} color="rgba(255,255,255,0.6)" />
                    <ThemedText style={styles.moodTriggerPlaceholder}>How are you feeling?</ThemedText>
                </>
            )}
        </TouchableOpacity>
    );

    return (
        <ScreenWrapper>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={step === 'review' ? handleReRecord : () => router.back()}
                    style={styles.headerButton}
                >
                    <Ionicons name="chevron-back" size={28} color="white" />
                </TouchableOpacity>
                <ThemedText style={styles.headerTitle}>Voice Note</ThemedText>
                {step === 'review' ? (
                    <TouchableOpacity onPress={handleSave} disabled={!canSave} style={styles.headerButton}>
                        <ThemedText style={[styles.doneText, !canSave && styles.doneTextDisabled]}>
                            {isSaving ? 'Saving…' : 'Done'}
                        </ThemedText>
                    </TouchableOpacity>
                ) : (
                    <View style={styles.headerButton} />
                )}
            </View>

            {/* Recording step */}
            {step === 'recording' && (
                <View style={styles.recorderContainer}>
                    {/* Timer */}
                    <ThemedText style={styles.timerText}>
                        {isRecording ? formatTime(elapsed) : '00:00'}
                    </ThemedText>
                    {isRecording && remaining <= 30 && (
                        <ThemedText style={styles.remainingText}>{remaining}s remaining</ThemedText>
                    )}

                    {/* Pitch bars — visible only while recording */}
                    {isRecording && (
                        <View style={styles.pitchBarsContainer}>
                            <Animated.View style={[styles.pitchBar, styles.pitchBarWhite, bar1Style]} />
                            <Animated.View style={[styles.pitchBar, styles.pitchBarBlue, bar2Style]} />
                            <Animated.View style={[styles.pitchBar, styles.pitchBarBurgundy, bar3Style]} />
                        </View>
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

                    {/* Pause button — shown only while recording */}
                    {isRecording && (
                        <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={isPaused ? resumeRecording : pauseRecording}
                            style={styles.pauseButton}
                        >
                            <Ionicons
                                name={isPaused ? 'play' : 'pause'}
                                size={20}
                                color="rgba(255,255,255,0.7)"
                            />
                            <ThemedText style={styles.pauseButtonText}>
                                {isPaused ? 'Resume' : 'Pause'}
                            </ThemedText>
                        </TouchableOpacity>
                    )}

                    <ThemedText style={styles.recordHint}>
                        {isPaused ? 'Paused' : isRecording ? 'Tap to stop' : 'Tap to record'}
                    </ThemedText>

                    {/* Mood picker at bottom */}
                    <View style={[styles.moodBarRecording, { borderTopColor: colors.cardBorder }]}>
                        <MoodTrigger />
                    </View>
                </View>
            )}

            {/* Review step */}
            {step === 'review' && (
                <ScrollView
                    style={styles.flex}
                    contentContainerStyle={styles.reviewContent}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Playback bar */}
                    <View style={styles.playbackBar}>
                        <TouchableOpacity onPress={handlePlayPause} style={styles.playButton}>
                            <Ionicons name={isPlaying ? 'pause' : 'play'} size={22} color="white" />
                        </TouchableOpacity>
                        <View style={styles.playbackInfo}>
                            <ThemedText style={styles.playbackDuration}>{formatTime(audioDuration)}</ThemedText>
                            <ThemedText style={styles.playbackLabel}>voice note</ThemedText>
                        </View>
                        <TouchableOpacity onPress={handleReRecord} style={styles.reRecordButton}>
                            <Ionicons name="refresh" size={16} color="rgba(255,255,255,0.5)" />
                            <ThemedText style={styles.reRecordText}>Re-record</ThemedText>
                        </TouchableOpacity>
                    </View>

                    {/* Transcript */}
                    <View style={styles.transcriptContainer}>
                        {isTranscribing ? (
                            <View style={styles.transcribingRow}>
                                <ActivityIndicator color={Colors.obsy.silver} size="small" />
                                <ThemedText style={styles.transcribingText}>Transcribing…</ThemedText>
                            </View>
                        ) : transcriptError ? (
                            <ThemedText style={styles.transcriptErrorText}>
                                Transcription failed — you can type your notes below.
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

                    {/* Mood selector */}
                    <View style={[styles.moodBarReview, { borderTopColor: colors.cardBorder }]}>
                        <MoodTrigger />
                    </View>
                </ScrollView>
            )}

            <MoodSelectionModal
                visible={moodModalVisible}
                selectedMood={moodId}
                onSelect={handleMoodSelect}
                onClose={() => setMoodModalVisible(false)}
            />
        </ScreenWrapper>
    );
}

const RECORD_BTN_SIZE = 80;

const styles = StyleSheet.create({
    flex: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 60,
        paddingBottom: 16,
    },
    headerButton: { minWidth: 60 },
    headerTitle: { fontSize: 17, fontWeight: '600', color: 'white' },
    doneText: {
        color: Colors.obsy.silver,
        fontSize: 17,
        fontWeight: '600',
        textAlign: 'right',
    },
    doneTextDisabled: { opacity: 0.3 },

    // ── Recording ────────────────────────────────────────────────────
    recorderContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
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

    // Pitch bars
    pitchBarsContainer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 8,
        height: BAR_MAX_HEIGHT + 4,
        marginVertical: -8,
    },
    pitchBar: {
        width: 4,
        borderRadius: 2,
    },
    pitchBarWhite: { backgroundColor: '#FFFFFF' },
    pitchBarBlue: { backgroundColor: '#4A90E2' },
    pitchBarBurgundy: { backgroundColor: '#8B2252' },

    // Record button — silver
    recordButton: {
        width: RECORD_BTN_SIZE,
        height: RECORD_BTN_SIZE,
        borderRadius: RECORD_BTN_SIZE / 2,
        backgroundColor: 'rgba(200,200,200,0.12)',
        borderWidth: 2,
        borderColor: 'rgba(200,200,200,0.35)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    recordButtonActive: {
        backgroundColor: 'rgba(200,200,200,0.22)',
        borderColor: '#C8C8C8',
    },
    recordDot: { width: 36, height: 36 },
    recordDotIdle: { borderRadius: 18, backgroundColor: '#C8C8C8' },
    recordDotStop: { borderRadius: 6, backgroundColor: '#C8C8C8', width: 28, height: 28 },
    recordHint: { fontSize: 16, color: 'rgba(255,255,255,0.5)' },

    // Pause button
    pauseButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 100,
        backgroundColor: 'rgba(255,255,255,0.08)',
        marginTop: -8,
    },
    pauseButtonText: {
        fontSize: 15,
        color: 'rgba(255,255,255,0.7)',
        fontWeight: '500',
    },

    moodBarRecording: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderTopWidth: 1,
    },

    // ── Review ───────────────────────────────────────────────────────
    reviewContent: {
        padding: 20,
        gap: 16,
        paddingBottom: 40,
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
    playbackInfo: { flex: 1 },
    playbackDuration: { fontSize: 16, fontWeight: '600', color: 'white' },
    playbackLabel: { fontSize: 12, color: 'rgba(255,255,255,0.4)' },
    reRecordButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    reRecordText: { fontSize: 13, color: 'rgba(255,255,255,0.5)' },
    transcriptContainer: { gap: 8 },
    transcribingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    transcribingText: { fontSize: 14, color: 'rgba(255,255,255,0.5)' },
    transcriptErrorText: { fontSize: 13, color: 'rgba(255,100,100,0.7)' },
    transcriptInput: {
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 16,
        padding: 16,
        minHeight: 140,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        color: 'white',
        fontSize: 16,
        lineHeight: 24,
        ...Platform.select({ android: { textAlignVertical: 'top' as const } }),
    },
    moodBarReview: {
        paddingVertical: 8,
        borderTopWidth: 1,
    },

    // ── Mood trigger ─────────────────────────────────────────────────
    moodTrigger: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 100,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    moodTriggerSelected: { backgroundColor: '#FFFFFF' },
    moodTriggerText: { fontSize: 14, fontWeight: '600', color: '#000000' },
    moodTriggerPlaceholder: { fontSize: 14, color: 'rgba(255,255,255,0.55)' },
});

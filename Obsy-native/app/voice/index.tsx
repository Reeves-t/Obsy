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
    useWindowDimensions,
    Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Audio } from 'expo-av';
import Svg, { Path } from 'react-native-svg';
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
import { useObsyTheme } from '@/contexts/ThemeContext';
import { getProfile, type Profile } from '@/services/profile';

type Step = 'recording' | 'review';

const MAX_DURATION_SECONDS = 180;
const SVG_HEIGHT = 80;
const WAVE_AMP = 32; // max displacement in px
const CENTER_Y = 40; // all 3 strings share the same vertical centre
// Different oscillation frequencies per string — looks independent
const LINE_FREQS = [3.1, 4.7, 6.3];
// Different amplitude multipliers — each string has different strength
const LINE_AMPS = [1.0, 0.72, 0.50];

function buildStringPath(width: number, centerY: number, amplitude: number): string {
    if (amplitude < 0.5) return `M 0 ${centerY} L ${width} ${centerY}`;
    const steps = 100;
    let d = `M 0 ${centerY}`;
    for (let i = 1; i <= steps; i++) {
        const x = (i / steps) * width;
        // Standing wave: peaks at centre of the string, zero at edges
        const y = centerY - amplitude * Math.sin((i / steps) * Math.PI);
        d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    return d;
}

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
    const { width: screenWidth } = useWindowDimensions();
    const svgWidth = screenWidth - 48;

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
    const phaseRef = useRef(0);
    // Tracks whether strings were animating last frame so we only call
    // resetWaves() once when transitioning from sound → silence
    const wasAnimatingRef = useRef(false);

    // Wave visualization state — all strings share CENTER_Y
    const flatPath = `M 0 ${CENTER_Y} L ${svgWidth} ${CENTER_Y}`;
    const [wavePaths, setWavePaths] = useState<[string, string, string]>([
        flatPath, flatPath, flatPath,
    ]);

    // Playback
    const [sound, setSound] = useState<Audio.Sound | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);

    // Transcription
    const [audioStorageUrl, setAudioStorageUrl] = useState<string | null>(null);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [transcriptError, setTranscriptError] = useState(false);

    const [isSaving, setIsSaving] = useState(false);
    const [includeInInsights, setIncludeInInsights] = useState(true);
    const [profile, setProfile] = useState<Profile | null>(null);

    const pulseScale = useSharedValue(1);
    const pulseStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pulseScale.value }],
    }));

    useEffect(() => {
        getProfile().then(setProfile).catch(() => setProfile(null));
    }, []);

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

    const resetWaves = () => {
        const flat = `M 0 ${CENTER_Y} L ${svgWidth} ${CENTER_Y}`;
        setWavePaths([flat, flat, flat]);
    };

    const updateWaves = (meteringDb: number) => {
        // Normalize dBFS: map -60..0 → 0..1
        const raw = Math.max(0, Math.min(1, (meteringDb + 60) / 60));

        // Dead zone: below 0.25 raw (~-45 dBFS) treat as silence.
        // Background noise typically sits at -50 to -55 dBFS (raw ≈ 0.08–0.17),
        // well below this threshold, so strings stay flat in silence.
        if (raw < 0.25) {
            if (wasAnimatingRef.current) {
                wasAnimatingRef.current = false;
                resetWaves();
            }
            return;
        }

        // Square-root gamma: boosts mid-level speech response
        wasAnimatingRef.current = true;
        const level = Math.sqrt(raw);
        phaseRef.current += 0.22;
        const t = phaseRef.current;
        const p1 = buildStringPath(svgWidth, CENTER_Y, level * WAVE_AMP * LINE_AMPS[0] * Math.cos(t * LINE_FREQS[0]));
        const p2 = buildStringPath(svgWidth, CENTER_Y, level * WAVE_AMP * LINE_AMPS[1] * Math.cos(t * LINE_FREQS[1]));
        const p3 = buildStringPath(svgWidth, CENTER_Y, level * WAVE_AMP * LINE_AMPS[2] * Math.cos(t * LINE_FREQS[2]));
        setWavePaths([p1, p2, p3]);
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
        phaseRef.current = 0;
        isPausedRef.current = false;
        setIsRecording(true);
        setIsPaused(false);
        setElapsed(0);

        pulseScale.value = withRepeat(
            withTiming(1.08, { duration: 900, easing: Easing.inOut(Easing.ease) }),
            -1,
            true
        );

        timerRef.current = setInterval(() => {
            if (!isPausedRef.current) {
                elapsedRef.current += 1;
                setElapsed(elapsedRef.current);
                if (elapsedRef.current >= MAX_DURATION_SECONDS) stopRecording();
            }
        }, 1000);

        meteringTimerRef.current = setInterval(async () => {
            if (recordingRef.current && !isPausedRef.current) {
                try {
                    const status = await recordingRef.current.getStatusAsync();
                    if (status.isRecording && status.metering !== undefined) {
                        updateWaves(status.metering);
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
            resetWaves();
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
                withTiming(1.08, { duration: 900, easing: Easing.inOut(Easing.ease) }),
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

        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        if (meteringTimerRef.current) { clearInterval(meteringTimerRef.current); meteringTimerRef.current = null; }

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
            if (isPlaying) { await sound.pauseAsync(); setIsPlaying(false); }
            else { await sound.playAsync(); setIsPlaying(true); }
            return;
        }
        const { sound: newSound } = await Audio.Sound.createAsync(
            { uri: audioStorageUrl },
            { shouldPlay: true },
            (status) => { if (status.isLoaded && status.didJustFinish) setIsPlaying(false); }
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
        resetWaves();
        setStep('recording');
    };

    const handleSave = async () => {
        if (!moodId || isSaving) return;
        setIsSaving(true);
        try {
            await createVoiceEntry(user, moodId, moodName, transcript, audioStorageUrl ?? '', [], includeInInsights && !profile?.ai_free_mode);
            router.dismissAll();
            setTimeout(() => router.replace('/(tabs)'), 100);
        } catch (err) {
            console.error('[VoiceNote] Save failed:', err);
            setIsSaving(false);
        }
    };

    // audioStorageUrl is NOT required — if storage upload fails (e.g. RLS),
    // the user can still save with the manually-typed transcript
    const canSave = !!moodId && !isTranscribing && !isSaving;
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

            {/* ── Recording step ── */}
            {step === 'recording' && (
                <View style={styles.recorderContainer}>
                    {/* Timer */}
                    <ThemedText style={styles.timerText}>
                        {formatTime(elapsed)}
                    </ThemedText>
                    {isRecording && remaining <= 30 && (
                        <ThemedText style={styles.remainingText}>{remaining}s remaining</ThemedText>
                    )}

                    {/* Guitar-string wave visualization */}
                    <View style={styles.waveContainer}>
                        <Svg width={svgWidth} height={SVG_HEIGHT}>
                            <Path d={wavePaths[0]} stroke="rgba(255,255,255,0.9)" strokeWidth={1.5} fill="none" strokeLinecap="round" />
                            <Path d={wavePaths[1]} stroke="#4A90E2" strokeWidth={1.5} fill="none" strokeLinecap="round" />
                            <Path d={wavePaths[2]} stroke="#7B1535" strokeWidth={1.5} fill="none" strokeLinecap="round" />
                        </Svg>
                    </View>

                    {/* Controls row */}
                    <View style={styles.controlsRow}>
                        {isRecording ? (
                            <>
                                {/* Pause / Resume */}
                                <TouchableOpacity
                                    activeOpacity={0.7}
                                    onPress={isPaused ? resumeRecording : pauseRecording}
                                    style={styles.controlButton}
                                >
                                    <Ionicons
                                        name={isPaused ? 'play' : 'pause'}
                                        size={20}
                                        color="rgba(255,255,255,0.7)"
                                    />
                                    <ThemedText style={styles.controlButtonText}>
                                        {isPaused ? 'Resume' : 'Pause'}
                                    </ThemedText>
                                </TouchableOpacity>

                                {/* Done — stops recording and goes to review */}
                                <TouchableOpacity
                                    activeOpacity={0.7}
                                    onPress={stopRecording}
                                    style={[styles.controlButton, styles.controlButtonDone]}
                                >
                                    <Ionicons name="checkmark" size={20} color="white" />
                                    <ThemedText style={[styles.controlButtonText, { color: 'white' }]}>
                                        Done
                                    </ThemedText>
                                </TouchableOpacity>
                            </>
                        ) : (
                            /* Record button — shown when idle */
                            <Animated.View style={pulseStyle}>
                                <TouchableOpacity
                                    activeOpacity={0.8}
                                    onPress={startRecording}
                                    style={styles.recordButton}
                                >
                                    <View style={styles.recordDot} />
                                </TouchableOpacity>
                            </Animated.View>
                        )}
                    </View>

                    <ThemedText style={styles.recordHint}>
                        {isPaused ? 'Paused' : isRecording ? '' : 'Tap to record'}
                    </ThemedText>

                    {/* Mood picker */}
                    <View style={[styles.moodBarRecording, { borderTopColor: colors.cardBorder }]}>
                        <MoodTrigger />
                        <View style={[styles.includeRow, profile?.ai_free_mode && styles.includeRowDisabled]}>
                            <ThemedText style={styles.includeLabel}>Include in insights</ThemedText>
                            <Switch
                                value={includeInInsights && !profile?.ai_free_mode}
                                disabled={!!profile?.ai_free_mode}
                                onValueChange={setIncludeInInsights}
                                trackColor={{ false: 'rgba(255,255,255,0.2)', true: Colors.obsy.silver }}
                                thumbColor="#fff"
                            />
                        </View>
                    </View>
                </View>
            )}

            {/* ── Review step ── */}
            {step === 'review' && (
                <ScrollView
                    style={styles.flex}
                    contentContainerStyle={styles.reviewContent}
                    keyboardShouldPersistTaps="handled"
                >
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

                    <View style={[styles.moodBarReview, { borderTopColor: colors.cardBorder }]}>
                        <MoodTrigger />
                        <View style={[styles.includeRow, profile?.ai_free_mode && styles.includeRowDisabled]}>
                            <ThemedText style={styles.includeLabel}>Include in insights</ThemedText>
                            <Switch
                                value={includeInInsights && !profile?.ai_free_mode}
                                disabled={!!profile?.ai_free_mode}
                                onValueChange={setIncludeInInsights}
                                trackColor={{ false: 'rgba(255,255,255,0.2)', true: Colors.obsy.silver }}
                                thumbColor="#fff"
                            />
                        </View>
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

const RECORD_BTN_SIZE = 72;

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
    doneText: { color: Colors.obsy.silver, fontSize: 17, fontWeight: '600', textAlign: 'right' },
    doneTextDisabled: { opacity: 0.3 },

    // ── Recording ────────────────────────────────────────────────────
    recorderContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 28,
    },
    timerText: {
        fontSize: 40,
        fontWeight: '300',
        color: 'white',
        letterSpacing: 3,
        lineHeight: 52,
        includeFontPadding: false,
    },
    remainingText: {
        fontSize: 14,
        color: '#8B2252',
        fontWeight: '500',
        marginTop: -16,
    },
    waveContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
    },

    // Controls
    controlsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    controlButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 22,
        paddingVertical: 12,
        borderRadius: 100,
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    controlButtonDone: {
        backgroundColor: 'rgba(255,255,255,0.15)',
    },
    controlButtonText: {
        fontSize: 15,
        color: 'rgba(255,255,255,0.7)',
        fontWeight: '500',
    },
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
    recordDot: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: '#C8C8C8',
    },
    recordHint: { fontSize: 15, color: 'rgba(255,255,255,0.45)' },

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
    reviewContent: { padding: 20, gap: 16, paddingBottom: 40 },
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
    moodBarReview: { paddingVertical: 8, borderTopWidth: 1 },
    includeRow: {
        marginTop: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    includeRowDisabled: {
        opacity: 0.45,
    },
    includeLabel: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.6)',
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

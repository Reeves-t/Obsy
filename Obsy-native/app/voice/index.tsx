import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
    Easing,
    cancelAnimation,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from 'react-native-reanimated';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ThemedText } from '@/components/ui/ThemedText';
import { MoodSelectionModal } from '@/components/capture/MoodSelectionModal';
import Colors from '@/constants/Colors';
import { MOODS } from '@/constants/Moods';
import { useAuth } from '@/contexts/AuthContext';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { useCaptureStore } from '@/lib/captureStore';
import { supabase } from '@/lib/supabase';
import { useCustomMoodStore } from '@/lib/customMoodStore';
import { useAiFreeMode } from '@/hooks/useAiFreeMode';

type Step = 'recording' | 'review';

const MAX_DURATION_SECONDS = 180;
const PLAYBACK_BAR_COUNT = 56;
const MONO_FONT = Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' });

function formatTime(seconds: number) {
    const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${secs}`;
}

function normalizeMetering(db: number) {
    return Math.max(0, Math.min(1, (db + 60) / 60));
}

function buildFallbackBars(count: number) {
    return Array.from({ length: count }, (_, index) => {
        const raw = ((index * 37) % 100) / 140;
        return Math.max(0.2, 0.25 + raw);
    });
}

function buildWaveformBars(samples: number[], count: number) {
    if (!samples.length) {
        return buildFallbackBars(count);
    }

    const bars: number[] = [];
    const bucketSize = Math.max(1, Math.floor(samples.length / count));

    for (let i = 0; i < count; i += 1) {
        const start = i * bucketSize;
        const end = i === count - 1 ? samples.length : Math.min(samples.length, start + bucketSize);
        const slice = samples.slice(start, end);
        if (!slice.length) {
            bars.push(0.18);
            continue;
        }
        const avg = slice.reduce((sum, sample) => sum + sample, 0) / slice.length;
        bars.push(Math.max(0.14, Math.min(1, 0.16 + avg * 0.92)));
    }

    return bars;
}

function CounterDigit({
    value,
    color,
}: {
    value: string;
    color: string;
}) {
    return (
        <ThemedText style={[styles.counterDigits, { color }]}>
            {value}
        </ThemedText>
    );
}

function TapeStrip({
    width,
    moving,
    baseColor,
    tickColor,
    animatedStyle,
}: {
    width: number;
    moving: boolean;
    baseColor: string;
    tickColor: string;
    animatedStyle: any;
}) {
    const tickCount = Math.ceil((width + 32) / 16);

    return (
        <View style={[styles.tapeBase, { width, backgroundColor: baseColor }]}>
            <Animated.View
                style={[
                    styles.tapeTicksLayer,
                    { width: width + 32 },
                    moving ? animatedStyle : null,
                ]}
            >
                {Array.from({ length: tickCount }).map((_, index) => (
                    <View
                        key={index}
                        style={[
                            styles.tapeTick,
                            {
                                left: index * 16,
                                backgroundColor: tickColor,
                            },
                        ]}
                    />
                ))}
            </Animated.View>
        </View>
    );
}

function TransportButton({
    label,
    onPress,
    disabled = false,
    active = false,
    accent = false,
    textColor,
    idleBorder,
    idleSurface,
    children,
}: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    active?: boolean;
    accent?: boolean;
    textColor: string;
    idleBorder: string;
    idleSurface: string;
    children: React.ReactNode;
}) {
    const captionColor = accent && active
        ? 'rgba(220,140,160,0.9)'
        : textColor;

    return (
        <TouchableOpacity
            style={[styles.transportCell, disabled && styles.transportCellDisabled]}
            activeOpacity={0.82}
            onPress={onPress}
            disabled={disabled}
        >
            {accent && active ? (
                <LinearGradient
                    colors={['#B03058', '#7B1535', '#4A0D22']}
                    start={{ x: 0.15, y: 0.08 }}
                    end={{ x: 0.82, y: 1 }}
                    style={[
                        styles.transportIconCircle,
                        styles.transportIconCircleAccent,
                    ]}
                >
                    {children}
                </LinearGradient>
            ) : (
                <View
                    style={[
                        styles.transportIconCircle,
                        {
                            backgroundColor: active ? 'rgba(255,255,255,0.18)' : idleSurface,
                            borderColor: accent ? 'rgba(176,48,88,0.24)' : idleBorder,
                        },
                    ]}
                >
                    {children}
                </View>
            )}

            <ThemedText style={[styles.transportCaption, { color: captionColor }]}>
                {label}
            </ThemedText>
        </TouchableOpacity>
    );
}

function PlaybackStrip({
    bars,
    progress,
    duration,
    isPlaying,
    onPlayPause,
    cardBg,
    borderColor,
    durationColor,
    playedColor,
    unplayedColor,
    playButtonBg,
}: {
    bars: number[];
    progress: number;
    duration: string;
    isPlaying: boolean;
    onPlayPause: () => void;
    cardBg: string;
    borderColor: string;
    durationColor: string;
    playedColor: string;
    unplayedColor: string;
    playButtonBg: string;
}) {
    return (
        <View style={[styles.playbackStrip, { backgroundColor: cardBg, borderColor }]}>
            <TouchableOpacity onPress={onPlayPause} style={[styles.playButton, { backgroundColor: playButtonBg }]}>
                <Ionicons name={isPlaying ? 'pause' : 'play'} size={18} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={styles.waveformWrap}>
                <View style={styles.waveformBars}>
                    {bars.map((bar, index) => {
                        const isPlayed = index / bars.length < progress;
                        return (
                            <View
                                key={`${index}-${bar.toFixed(3)}`}
                                style={[
                                    styles.waveformBar,
                                    {
                                        height: `${Math.max(14, bar * 100)}%`,
                                        backgroundColor: isPlayed ? playedColor : unplayedColor,
                                        marginRight: index === bars.length - 1 ? 0 : 2,
                                    },
                                ]}
                            />
                        );
                    })}
                </View>

                <View style={[styles.waveformPlayhead, { left: `${progress * 100}%` }]} />
            </View>

            <ThemedText style={[styles.playbackDuration, { color: durationColor }]}>
                {duration}
            </ThemedText>
        </View>
    );
}

export default function VoiceNoteScreen() {
    const router = useRouter();
    const { createVoiceEntry } = useCaptureStore();
    const { user } = useAuth();
    const { getMoodById } = useCustomMoodStore();
    const { colors, isLight } = useObsyTheme();
    const { width: screenWidth } = useWindowDimensions();
    const { aiFreeMode } = useAiFreeMode();

    const [step, setStep] = useState<Step>('recording');
    const [moodId, setMoodId] = useState<string | null>(null);
    const [moodName, setMoodName] = useState('');
    const [moodModalVisible, setMoodModalVisible] = useState(false);

    const [isRecording, setIsRecording] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [audioDuration, setAudioDuration] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackProgress, setPlaybackProgress] = useState(0);

    const [audioStorageUrl, setAudioStorageUrl] = useState<string | null>(null);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [transcriptError, setTranscriptError] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [includeInInsights, setIncludeInInsights] = useState(true);
    const [waveformBars, setWaveformBars] = useState<number[]>(() => buildFallbackBars(PLAYBACK_BAR_COUNT));

    const recordingRef = useRef<Audio.Recording | null>(null);
    const soundRef = useRef<Audio.Sound | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const meteringTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const elapsedRef = useRef(0);
    const isPausedRef = useRef(false);
    const meteringSamplesRef = useRef<number[]>([]);

    const ledOpacity = useSharedValue(0.35);
    const tapeTranslate = useSharedValue(0);

    const tapeAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: tapeTranslate.value }],
    }));

    const ledAnimatedStyle = useAnimatedStyle(() => ({
        opacity: ledOpacity.value,
    }));

    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (meteringTimerRef.current) clearInterval(meteringTimerRef.current);
            recordingRef.current?.stopAndUnloadAsync().catch(() => {});
            soundRef.current?.unloadAsync().catch(() => {});
        };
    }, []);

    useEffect(() => {
        const activelyRecording = step === 'recording' && isRecording && !isPaused;

        cancelAnimation(ledOpacity);
        cancelAnimation(tapeTranslate);

        if (activelyRecording) {
            ledOpacity.value = 1;
            ledOpacity.value = withRepeat(
                withTiming(0.3, { duration: 550, easing: Easing.inOut(Easing.ease) }),
                -1,
                true
            );
            tapeTranslate.value = 0;
            tapeTranslate.value = withRepeat(
                withTiming(-16, { duration: 1600, easing: Easing.linear }),
                -1,
                false
            );
            return;
        }

        ledOpacity.value = withTiming(isPaused ? 0.35 : 0.2, { duration: 180 });
        tapeTranslate.value = withTiming(0, { duration: 180 });
    }, [isPaused, isRecording, ledOpacity, step, tapeTranslate]);

    const onBackgroundPrimary = colors.text;
    const onBackgroundSecondary = colors.textSecondary;
    const recordingCardBg = isLight ? colors.cardBackground : 'rgba(255,255,255,0.04)';
    const recordingCardBgAlt = isLight ? colors.cardBackground : 'rgba(255,255,255,0.05)';
    const idleSurface = isLight ? 'rgba(20,20,22,0.94)' : 'rgba(255,255,255,0.06)';
    const idleBorder = isLight ? colors.cardBorder : 'rgba(255,255,255,0.12)';
    const surfaceBorder = isLight ? colors.cardBorder : 'rgba(255,255,255,0.08)';
    const cardText = isLight ? colors.cardText : '#FFFFFF';
    const cardTextSecondary = isLight ? colors.cardTextSecondary : 'rgba(255,255,255,0.55)';
    const tapeBase = isLight ? 'rgba(20,20,22,0.14)' : 'rgba(255,255,255,0.1)';
    const tapeTick = isLight ? 'rgba(20,20,22,0.3)' : 'rgba(255,255,255,0.35)';
    const publishDockEnd = isLight ? 'rgba(210,194,166,0.96)' : 'rgba(5,6,8,0.92)';
    const transcriptPlaceholder = isLight ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.3)';
    const transcriptBg = isLight ? colors.cardBackground : 'rgba(255,255,255,0.04)';
    const transcriptBorder = isLight ? colors.cardBorder : 'rgba(255,255,255,0.08)';
    const moodPlaceholderColor = isLight ? colors.cardTextSecondary : 'rgba(255,255,255,0.55)';
    const moodIdleBg = isLight ? 'rgba(20,20,22,0.94)' : 'rgba(255,255,255,0.08)';
    const remaining = MAX_DURATION_SECONDS - elapsed;
    const currentDurationLabel = formatTime(audioDuration || elapsed);
    const playbackBars = waveformBars.length ? waveformBars : buildFallbackBars(PLAYBACK_BAR_COUNT);
    const tapeWidth = Math.max(0, screenWidth - 56);

    const handleMoodSelect = (id: string) => {
        const mood = getMoodById(id);
        setMoodId(id);
        setMoodName(mood?.name || MOODS.find((item) => item.id === id)?.label || id);
    };

    const beginMeteringCapture = () => {
        meteringSamplesRef.current = [];
        meteringTimerRef.current = setInterval(async () => {
            if (!recordingRef.current || isPausedRef.current) return;
            try {
                const status = await recordingRef.current.getStatusAsync();
                if (status.isRecording && status.metering !== undefined) {
                    meteringSamplesRef.current.push(normalizeMetering(status.metering));
                    if (meteringSamplesRef.current.length > 360) {
                        meteringSamplesRef.current.shift();
                    }
                }
            } catch {
                // Ignore sampling errors while recording.
            }
        }, 120);
    };

    const clearRecordingTimers = () => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        if (meteringTimerRef.current) {
            clearInterval(meteringTimerRef.current);
            meteringTimerRef.current = null;
        }
    };

    const startRecording = async () => {
        if (isRecording) return;

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

        setElapsed(0);
        setAudioDuration(0);
        setIsRecording(true);
        setIsPaused(false);

        timerRef.current = setInterval(() => {
            if (isPausedRef.current) return;
            elapsedRef.current += 1;
            setElapsed(elapsedRef.current);
            if (elapsedRef.current >= MAX_DURATION_SECONDS) {
                stopRecording();
            }
        }, 1000);

        beginMeteringCapture();
    };

    const pauseRecording = async () => {
        if (!recordingRef.current || isPaused) return;

        try {
            await recordingRef.current.pauseAsync();
            isPausedRef.current = true;
            setIsPaused(true);
        } catch (error) {
            console.error('[VoiceNote] Pause error:', error);
        }
    };

    const resumeRecording = async () => {
        if (!recordingRef.current || !isPaused) return;

        try {
            await recordingRef.current.startAsync();
            isPausedRef.current = false;
            setIsPaused(false);
        } catch (error) {
            console.error('[VoiceNote] Resume error:', error);
        }
    };

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
        } catch (error) {
            console.error('[VoiceNote] Transcription failed:', error);
            setTranscriptError(true);
        } finally {
            setIsTranscribing(false);
        }
    };

    const stopRecording = useCallback(async () => {
        if (!recordingRef.current) return;

        clearRecordingTimers();
        setIsRecording(false);
        setIsPaused(false);
        isPausedRef.current = false;

        try {
            await recordingRef.current.stopAndUnloadAsync();
            const uri = recordingRef.current.getURI();
            recordingRef.current = null;
            if (!uri) throw new Error('Recording URI is null');

            const capturedDuration = elapsedRef.current;
            setAudioDuration(capturedDuration);
            setWaveformBars(buildWaveformBars(meteringSamplesRef.current, PLAYBACK_BAR_COUNT));
            setStep('review');
            setPlaybackProgress(0);
            transcribeRecording(uri);
        } catch (error) {
            console.error('[VoiceNote] Stop recording error:', error);
        }
    }, []);

    const handlePlaybackStatus = useCallback((status: any) => {
        if (!status?.isLoaded) return;

        const durationMillis = status.durationMillis ?? 0;
        const positionMillis = status.positionMillis ?? 0;
        const progress = durationMillis > 0 ? positionMillis / durationMillis : 0;
        setPlaybackProgress(Math.max(0, Math.min(1, progress)));

        if (status.didJustFinish) {
            setIsPlaying(false);
            setPlaybackProgress(1);
        }
    }, []);

    const handlePlayPause = async () => {
        if (!audioStorageUrl) return;

        if (soundRef.current) {
            if (isPlaying) {
                await soundRef.current.pauseAsync();
                setIsPlaying(false);
                return;
            }

            if (playbackProgress >= 0.999) {
                await soundRef.current.setPositionAsync(0);
                setPlaybackProgress(0);
            }

            await soundRef.current.playAsync();
            setIsPlaying(true);
            return;
        }

        const { sound } = await Audio.Sound.createAsync(
            { uri: audioStorageUrl },
            { shouldPlay: true, progressUpdateIntervalMillis: 250 },
            handlePlaybackStatus
        );

        soundRef.current = sound;
        setIsPlaying(true);
    };

    const handleReRecord = async () => {
        await soundRef.current?.unloadAsync().catch(() => {});
        soundRef.current = null;

        setIsPlaying(false);
        setPlaybackProgress(0);
        setAudioStorageUrl(null);
        setTranscript('');
        setTranscriptError(false);
        setElapsed(0);
        setAudioDuration(0);
        elapsedRef.current = 0;
        meteringSamplesRef.current = [];
        setWaveformBars(buildFallbackBars(PLAYBACK_BAR_COUNT));
        setStep('recording');
    };

    const handleSave = async () => {
        if (!moodId || isSaving) return;

        setIsSaving(true);
        try {
            await createVoiceEntry(
                user,
                moodId,
                moodName,
                transcript,
                audioStorageUrl ?? '',
                [],
                includeInInsights && !aiFreeMode
            );
            router.dismissAll();
            setTimeout(() => router.replace('/(tabs)'), 100);
        } catch (error) {
            console.error('[VoiceNote] Save failed:', error);
            setIsSaving(false);
        }
    };

    const canSave = !!moodId && !isTranscribing && !isSaving;
    const recordingStatusLabel = isPaused ? 'PAUSED' : isRecording ? 'RECORDING' : 'READY';

    const MoodTrigger = () => (
        <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => setMoodModalVisible(true)}
            style={[
                styles.moodTrigger,
                {
                    backgroundColor: moodId ? '#FFFFFF' : moodIdleBg,
                    borderColor: moodId ? 'transparent' : surfaceBorder,
                },
                moodId && styles.moodTriggerSelected,
            ]}
        >
            {moodId ? (
                <>
                    <ThemedText style={styles.moodTriggerText}>{moodName}</ThemedText>
                    <Ionicons name="chevron-down" size={14} color="rgba(0,0,0,0.6)" />
                </>
            ) : (
                <>
                    <Ionicons name="add" size={14} color={moodPlaceholderColor} />
                    <ThemedText style={[styles.moodTriggerPlaceholder, { color: moodPlaceholderColor }]}>
                        How are you feeling?
                    </ThemedText>
                </>
            )}
        </TouchableOpacity>
    );

    return (
        <ScreenWrapper>
            <View style={styles.flex}>
                <View style={styles.header}>
                    <TouchableOpacity
                        onPress={step === 'review' ? handleReRecord : () => router.back()}
                        style={styles.headerSide}
                    >
                        <Ionicons name="chevron-back" size={26} color={onBackgroundPrimary} />
                    </TouchableOpacity>

                    <ThemedText style={[styles.headerTitle, { color: onBackgroundPrimary }]}>
                        Voice Note
                    </ThemedText>

                    {step === 'review' ? (
                        <TouchableOpacity onPress={handleReRecord} style={styles.headerSideRight}>
                            <Ionicons name="refresh" size={12} color={onBackgroundSecondary} />
                            <ThemedText style={[styles.reRecordHeaderText, { color: onBackgroundSecondary }]}>
                                Re-record
                            </ThemedText>
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.headerSide} />
                    )}
                </View>

                {step === 'recording' ? (
                    <View style={styles.recordingStep}>
                        <View style={styles.recordingInner}>
                            <View style={styles.recordingIndicatorRow}>
                                <Animated.View
                                    style={[
                                        styles.recordingDot,
                                        { backgroundColor: '#B03058' },
                                        ledAnimatedStyle,
                                    ]}
                                />
                                <ThemedText style={[styles.recordingIndicatorText, { color: onBackgroundSecondary }]}>
                                    {recordingStatusLabel}
                                </ThemedText>
                            </View>

                            <View style={styles.counterBlock}>
                                <View style={styles.counterRow}>
                                    <CounterDigit value={formatTime(elapsed).slice(0, 2)} color={onBackgroundPrimary} />
                                    <ThemedText style={[styles.counterColon, { color: onBackgroundPrimary }]}>
                                        :
                                    </ThemedText>
                                    <CounterDigit value={formatTime(elapsed).slice(3, 5)} color={onBackgroundPrimary} />
                                </View>
                                <ThemedText style={[styles.counterCaption, { color: onBackgroundSecondary }]}>
                                    TAPE COUNTER
                                </ThemedText>
                            </View>

                            <View style={styles.tapeBlock}>
                                <TapeStrip
                                    width={tapeWidth}
                                    moving={isRecording && !isPaused}
                                    baseColor={tapeBase}
                                    tickColor={tapeTick}
                                    animatedStyle={tapeAnimatedStyle}
                                />
                                <ThemedText style={[styles.remainingCaption, { color: onBackgroundSecondary }]}>
                                    {formatTime(Math.max(0, remaining))} REMAINING
                                </ThemedText>
                            </View>

                            <View style={[styles.transportRow, { backgroundColor: recordingCardBg, borderColor: surfaceBorder }]}>
                                <TransportButton
                                    label="Rec"
                                    onPress={startRecording}
                                    disabled={isRecording}
                                    active={isRecording && !isPaused}
                                    accent
                                    textColor={cardTextSecondary}
                                    idleBorder={idleBorder}
                                    idleSurface={idleSurface}
                                >
                                    <View style={styles.recInnerDot} />
                                </TransportButton>

                                <TransportButton
                                    label={isPaused ? 'Resume' : 'Pause'}
                                    onPress={isPaused ? resumeRecording : pauseRecording}
                                    disabled={!isRecording && !isPaused}
                                    active={isPaused}
                                    textColor={cardTextSecondary}
                                    idleBorder={idleBorder}
                                    idleSurface={idleSurface}
                                >
                                    {isPaused ? (
                                        <Ionicons name="play" size={16} color={cardText} />
                                    ) : (
                                        <View style={styles.pauseGlyph}>
                                            <View style={[styles.pauseBar, { backgroundColor: cardText }]} />
                                            <View style={[styles.pauseBar, { backgroundColor: cardText }]} />
                                        </View>
                                    )}
                                </TransportButton>

                                <TransportButton
                                    label="Stop"
                                    onPress={stopRecording}
                                    disabled={!isRecording && !isPaused}
                                    textColor={cardTextSecondary}
                                    idleBorder={idleBorder}
                                    idleSurface={idleSurface}
                                >
                                    <View style={[styles.stopGlyph, { backgroundColor: cardText }]} />
                                </TransportButton>
                            </View>
                        </View>

                        <View style={[styles.recordingBottomDock, { borderTopColor: surfaceBorder }]}>
                            <MoodTrigger />
                            <View style={[styles.includeRow, aiFreeMode && styles.includeRowDisabled]}>
                                <ThemedText style={[styles.includeLabel, { color: onBackgroundSecondary }]}>
                                    Include in insights
                                </ThemedText>
                                <Switch
                                    value={includeInInsights && !aiFreeMode}
                                    disabled={aiFreeMode}
                                    onValueChange={setIncludeInInsights}
                                    trackColor={{
                                        false: isLight ? 'rgba(20,20,22,0.18)' : 'rgba(255,255,255,0.2)',
                                        true: Colors.obsy.silver,
                                    }}
                                    thumbColor="#fff"
                                />
                            </View>
                        </View>
                    </View>
                ) : (
                    <View style={styles.reviewStep}>
                        <ScrollView
                            style={styles.flex}
                            contentContainerStyle={styles.reviewContent}
                            keyboardShouldPersistTaps="handled"
                            showsVerticalScrollIndicator={false}
                        >
                            <PlaybackStrip
                                bars={playbackBars}
                                progress={playbackProgress}
                                duration={currentDurationLabel}
                                isPlaying={isPlaying}
                                onPlayPause={handlePlayPause}
                                cardBg={recordingCardBgAlt}
                                borderColor={isLight ? colors.cardBorder : 'rgba(255,255,255,0.1)'}
                                durationColor={cardTextSecondary}
                                playedColor={Colors.obsy.silver}
                                unplayedColor={isLight ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.25)'}
                                playButtonBg={isLight ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.12)'}
                            />

                            <ThemedText style={[styles.sectionCaption, { color: onBackgroundSecondary }]}>
                                TRANSCRIPT
                            </ThemedText>

                            <View style={[styles.transcriptCard, { backgroundColor: transcriptBg, borderColor: transcriptBorder }]}>
                                {isTranscribing ? (
                                    <View style={styles.transcribingRow}>
                                        <ActivityIndicator color={Colors.obsy.silver} size="small" />
                                        <ThemedText style={[styles.transcribingText, { color: cardTextSecondary }]}>
                                            Transcribing…
                                        </ThemedText>
                                    </View>
                                ) : transcriptError ? (
                                    <ThemedText style={styles.transcriptErrorText}>
                                        Transcription failed — you can type your notes below.
                                    </ThemedText>
                                ) : null}

                                <TextInput
                                    style={[
                                        styles.transcriptInput,
                                        {
                                            color: cardText,
                                        },
                                    ]}
                                    value={transcript}
                                    onChangeText={setTranscript}
                                    multiline
                                    placeholder={isTranscribing ? '' : 'Transcript will appear here…'}
                                    placeholderTextColor={transcriptPlaceholder}
                                    editable={!isTranscribing}
                                />
                            </View>

                            <MoodTrigger />

                            <View style={[styles.includeRow, aiFreeMode && styles.includeRowDisabled]}>
                                <ThemedText style={[styles.includeLabel, { color: onBackgroundSecondary }]}>
                                    Include in insights
                                </ThemedText>
                                <Switch
                                    value={includeInInsights && !aiFreeMode}
                                    disabled={aiFreeMode}
                                    onValueChange={setIncludeInInsights}
                                    trackColor={{
                                        false: isLight ? 'rgba(20,20,22,0.18)' : 'rgba(255,255,255,0.2)',
                                        true: Colors.obsy.silver,
                                    }}
                                    thumbColor="#fff"
                                />
                            </View>
                        </ScrollView>

                        <View pointerEvents="box-none" style={styles.publishDockWrap}>
                            <LinearGradient
                                pointerEvents="none"
                                colors={['transparent', publishDockEnd]}
                                locations={[0, 0.4]}
                                style={styles.publishDockFade}
                            />
                            <View style={styles.publishDock}>
                                <TouchableOpacity
                                    activeOpacity={0.88}
                                    onPress={handleSave}
                                    disabled={!canSave}
                                    style={[styles.publishButton, !canSave && styles.publishButtonDisabled]}
                                >
                                    <Ionicons name="arrow-up" size={14} color="#0A0A0A" />
                                    <ThemedText style={styles.publishButtonText}>
                                        {isSaving ? 'Publishing…' : 'Publish recording'}
                                    </ThemedText>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                )}

                <MoodSelectionModal
                    visible={moodModalVisible}
                    selectedMood={moodId}
                    onSelect={handleMoodSelect}
                    onClose={() => setMoodModalVisible(false)}
                />
            </View>
        </ScreenWrapper>
    );
}

const styles = StyleSheet.create({
    flex: {
        flex: 1,
    },
    header: {
        height: 44,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerSide: {
        minWidth: 60,
        justifyContent: 'center',
        alignItems: 'flex-start',
    },
    headerSideRight: {
        minWidth: 60,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 4,
    },
    headerTitle: {
        position: 'absolute',
        left: 0,
        right: 0,
        textAlign: 'center',
        fontSize: 17,
        fontWeight: '600',
    },
    reRecordHeaderText: {
        fontSize: 14,
    },
    recordingStep: {
        flex: 1,
    },
    recordingInner: {
        paddingTop: 40,
        paddingHorizontal: 28,
        alignItems: 'center',
    },
    recordingIndicatorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    recordingDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        shadowColor: '#B03058',
        shadowOpacity: 0.75,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 0 },
        elevation: 4,
    },
    recordingIndicatorText: {
        fontSize: 10,
        letterSpacing: 3,
        textTransform: 'uppercase',
        fontFamily: MONO_FONT,
    },
    counterBlock: {
        paddingTop: 36,
        paddingBottom: 20,
        alignItems: 'center',
    },
    counterRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'center',
    },
    counterDigits: {
        fontSize: 84,
        fontWeight: '200',
        letterSpacing: 4,
        lineHeight: 84,
        fontFamily: MONO_FONT,
        fontVariant: ['tabular-nums'],
    },
    counterColon: {
        fontSize: 84,
        fontWeight: '200',
        lineHeight: 84,
        opacity: 0.4,
        marginHorizontal: 4,
        fontFamily: MONO_FONT,
    },
    counterCaption: {
        marginTop: 12,
        fontSize: 10,
        letterSpacing: 4,
        textTransform: 'uppercase',
        fontFamily: MONO_FONT,
    },
    tapeBlock: {
        width: '100%',
        alignItems: 'center',
        gap: 8,
    },
    tapeBase: {
        height: StyleSheet.hairlineWidth,
        position: 'relative',
        overflow: 'hidden',
    },
    tapeTicksLayer: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
    },
    tapeTick: {
        position: 'absolute',
        top: 0,
        width: 1,
        bottom: 0,
    },
    remainingCaption: {
        fontSize: 11,
        letterSpacing: 3,
        textTransform: 'uppercase',
        fontFamily: MONO_FONT,
    },
    transportRow: {
        width: '100%',
        marginTop: 20,
        paddingHorizontal: 10,
        paddingVertical: 14,
        borderRadius: 14,
        borderWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    transportCell: {
        flex: 1,
        alignItems: 'center',
        gap: 6,
    },
    transportCellDisabled: {
        opacity: 0.45,
    },
    transportIconCircle: {
        width: 54,
        height: 54,
        borderRadius: 27,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    transportIconCircleAccent: {
        borderColor: 'rgba(176,48,88,0.55)',
        shadowColor: 'rgba(176,48,88,0.45)',
        shadowOpacity: 1,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 0 },
        elevation: 8,
    },
    transportCaption: {
        fontSize: 10,
        letterSpacing: 1.6,
        textTransform: 'uppercase',
        fontFamily: MONO_FONT,
    },
    recInnerDot: {
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: '#FFFFFF',
    },
    pauseGlyph: {
        flexDirection: 'row',
        gap: 2,
    },
    pauseBar: {
        width: 4,
        height: 14,
        borderRadius: 1,
    },
    stopGlyph: {
        width: 14,
        height: 14,
        borderRadius: 1.5,
    },
    recordingBottomDock: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingTop: 14,
        paddingHorizontal: 24,
        paddingBottom: 28,
        borderTopWidth: 1,
        gap: 12,
    },
    reviewStep: {
        flex: 1,
    },
    reviewContent: {
        paddingHorizontal: 20,
        paddingTop: 8,
        paddingBottom: 180,
        gap: 14,
    },
    playbackStrip: {
        borderRadius: 14,
        borderWidth: 1,
        paddingVertical: 14,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
    },
    playButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    waveformWrap: {
        flex: 1,
        height: 36,
        justifyContent: 'center',
        position: 'relative',
    },
    waveformBars: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'flex-end',
    },
    waveformBar: {
        flex: 1,
        minWidth: 1.5,
        borderRadius: 0.5,
    },
    waveformPlayhead: {
        position: 'absolute',
        top: -4,
        bottom: -4,
        width: 2,
        backgroundColor: '#FFFFFF',
        shadowColor: 'rgba(255,255,255,0.6)',
        shadowOpacity: 1,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 0 },
        elevation: 4,
    },
    playbackDuration: {
        fontSize: 12,
        fontFamily: MONO_FONT,
        fontVariant: ['tabular-nums'],
    },
    sectionCaption: {
        fontSize: 11,
        letterSpacing: 2,
        textTransform: 'uppercase',
        fontFamily: MONO_FONT,
    },
    transcriptCard: {
        minHeight: 160,
        borderRadius: 14,
        borderWidth: 1,
        padding: 18,
    },
    transcribingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 12,
    },
    transcribingText: {
        fontSize: 14,
    },
    transcriptErrorText: {
        fontSize: 13,
        color: 'rgba(255,100,100,0.7)',
        marginBottom: 12,
    },
    transcriptInput: {
        minHeight: 120,
        fontSize: 16,
        lineHeight: 24,
        padding: 0,
        ...Platform.select({
            android: {
                textAlignVertical: 'top' as const,
            },
        }),
    },
    includeRow: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    includeRowDisabled: {
        opacity: 0.45,
    },
    includeLabel: {
        fontSize: 13,
    },
    moodTrigger: {
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 100,
        borderWidth: 1,
    },
    moodTriggerSelected: {
        backgroundColor: '#FFFFFF',
    },
    moodTriggerText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#000000',
    },
    moodTriggerPlaceholder: {
        fontSize: 14,
    },
    publishDockWrap: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
    },
    publishDockFade: {
        ...StyleSheet.absoluteFillObject,
    },
    publishDock: {
        paddingTop: 14,
        paddingHorizontal: 20,
        paddingBottom: 26,
    },
    publishButton: {
        width: '100%',
        borderRadius: 14,
        backgroundColor: '#FFFFFF',
        paddingVertical: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        shadowColor: 'rgba(255,255,255,0.12)',
        shadowOpacity: 1,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6,
    },
    publishButtonDisabled: {
        opacity: 0.3,
        shadowOpacity: 0,
        elevation: 0,
    },
    publishButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#0A0A0A',
    },
});

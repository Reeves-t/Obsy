import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { StyleSheet, View, Image, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Dimensions, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/ui/ThemedText';
import Colors from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useCaptureStore } from '@/lib/captureStore';
import { useTopicStore } from '@/lib/topicStore';
import { format } from 'date-fns';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, runOnJS, useDerivedValue } from 'react-native-reanimated';
import { useMoodResolver } from '@/hooks/useMoodResolver';
import { classifyEntry } from '@/components/entries/EntryGridTile';
import { StaticLinkPreview } from '@/components/entries/StaticLinkPreview';
import { PlatformEmbed, isEmbeddablePlatform } from '@/components/entries/PlatformEmbed';
import { detectPlatform, platformToColor } from '@/services/sharedLinkService';
import type { SharedLinkPlatform } from '@/services/sharedLinkService';
import type { Capture } from '@/types/capture';

const { width } = Dimensions.get('window');

export default function CaptureDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const { captures, deleteCapture } = useCaptureStore();
    const { getMoodDisplay } = useMoodResolver();
    const topics = useTopicStore(s => s.topics);
    const [isDeleting, setIsDeleting] = useState(false);

    const capture = captures.find(c => c.id === id);

    // Resolve linked topic via tag convention `topic:${id}` — must run before any early return
    const linkedTopic = useMemo(() => {
        const topicTag = capture?.tags?.find(t => t.startsWith('topic:'));
        if (!topicTag) return null;
        const topicId = topicTag.slice('topic:'.length);
        return topics.find(t => t.id === topicId) ?? null;
    }, [capture?.tags, topics]);

    if (!capture) {
        return (
            <View style={styles.container}>
                <View style={styles.center}>
                    <ThemedText>Capture not found</ThemedText>
                    <TouchableOpacity onPress={() => router.back()} style={styles.goBackButton}>
                        <ThemedText style={{ color: Colors.obsy.silver }}>Go Back</ThemedText>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    const kind = classifyEntry(capture);
    const moodDisplay = getMoodDisplay(capture.mood_id, capture.mood_name_snapshot);

    const handleDelete = () => {
        Alert.alert(
            "Delete entry",
            "Are you sure you want to delete this entry? This cannot be undone.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        setIsDeleting(true);
                        try {
                            await deleteCapture(capture.id);
                            router.back();
                        } catch (error) {
                            console.error("Failed to delete:", error);
                            setIsDeleting(false);
                            Alert.alert("Error", "Failed to delete entry.");
                        }
                    }
                }
            ]
        );
    };

    return (
        <GestureHandlerRootView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {/* ── Hero section: varies by entry kind ──────────────────── */}
                {kind === 'photo' && (
                    <PhotoHero
                        capture={capture}
                        moodDisplay={moodDisplay}
                        onBack={() => router.back()}
                        onDelete={handleDelete}
                        isDeleting={isDeleting}
                    />
                )}
                {kind === 'journal' && (
                    <JournalHero
                        capture={capture}
                        moodDisplay={moodDisplay}
                        onBack={() => router.back()}
                        onDelete={handleDelete}
                        isDeleting={isDeleting}
                    />
                )}
                {kind === 'voice' && (
                    <VoiceHero
                        capture={capture}
                        moodDisplay={moodDisplay}
                        onBack={() => router.back()}
                        onDelete={handleDelete}
                        isDeleting={isDeleting}
                    />
                )}
                {kind === 'link' && (
                    <LinkHero
                        capture={capture}
                        moodDisplay={moodDisplay}
                        onBack={() => router.back()}
                        onDelete={handleDelete}
                        isDeleting={isDeleting}
                    />
                )}
                {kind === 'mood' && (
                    <MoodHero
                        capture={capture}
                        moodDisplay={moodDisplay}
                        onBack={() => router.back()}
                        onDelete={handleDelete}
                        isDeleting={isDeleting}
                    />
                )}

                {/* ── Details section: shared across types ────────────────── */}
                <View style={styles.detailsSection}>
                    {/* Topic chip if linked */}
                    {linkedTopic && (
                        <View style={styles.topicChipRow}>
                            <View style={[styles.topicChip, { borderColor: `hsla(${linkedTopic.hue}, 60%, 60%, 0.5)` }]}>
                                <Ionicons name="flower-outline" size={13} color={`hsl(${linkedTopic.hue}, 70%, 70%)`} />
                                <ThemedText style={[styles.topicChipText, { color: `hsl(${linkedTopic.hue}, 70%, 80%)` }]}>
                                    {linkedTopic.title}
                                </ThemedText>
                            </View>
                        </View>
                    )}

                    {/* Obsy note (AI caption) — shown for all kinds when present */}
                    {capture.obsy_note && (
                        <View style={styles.captionSection}>
                            <ThemedText style={styles.sectionLabel}>OBSY NOTE</ThemedText>
                            <ThemedText style={styles.captionText}>"{capture.obsy_note}"</ThemedText>
                        </View>
                    )}

                    {/* Journal / transcription section:
                        - photo: always shown ("No journal entry for this moment..." fallback)
                        - voice: shown as TRANSCRIPTION when note exists
                        - link: shown when note exists
                        - journal: hidden (journal text is the hero itself)
                        - mood: hidden (no journal attached to pure mood) */}
                    {kind === 'photo' && (
                        <View style={styles.journalSection}>
                            <ThemedText style={styles.sectionLabel}>JOURNAL</ThemedText>
                            <View style={styles.journalBox}>
                                <ThemedText style={styles.journalText}>
                                    {capture.note || 'No journal entry for this moment...'}
                                </ThemedText>
                            </View>
                        </View>
                    )}
                    {kind === 'voice' && capture.note && capture.note.trim().length > 0 && (
                        <View style={styles.journalSection}>
                            <ThemedText style={styles.sectionLabel}>TRANSCRIPTION</ThemedText>
                            <View style={styles.journalBox}>
                                <ThemedText style={styles.journalText}>{capture.note}</ThemedText>
                            </View>
                        </View>
                    )}
                    {kind === 'link' && capture.note && capture.note.trim().length > 0 && (
                        <View style={styles.journalSection}>
                            <ThemedText style={styles.sectionLabel}>JOURNAL</ThemedText>
                            <View style={styles.journalBox}>
                                <ThemedText style={styles.journalText}>{capture.note}</ThemedText>
                            </View>
                        </View>
                    )}

                    {/* Footer date */}
                    <View style={styles.footer}>
                        <ThemedText style={styles.footerText}>
                            {kind === 'mood' ? 'Logged' : 'Captured'} on {format(new Date(capture.created_at), 'MMMM d, yyyy')}
                        </ThemedText>
                    </View>
                </View>
            </ScrollView>
        </GestureHandlerRootView>
    );
}

// ─── Header buttons (back / delete) ──────────────────────────────────────────

function HeaderButtons({ onBack, onDelete, isDeleting, tint = 'dark' }: {
    onBack: () => void;
    onDelete: () => void;
    isDeleting: boolean;
    tint?: 'dark' | 'light';
}) {
    return (
        <View style={styles.header}>
            <TouchableOpacity onPress={onBack} style={styles.iconButton}>
                <BlurView intensity={40} tint={tint} style={styles.blurButton}>
                    <Ionicons name="chevron-back" size={24} color="white" />
                </BlurView>
            </TouchableOpacity>
            <TouchableOpacity onPress={onDelete} style={styles.iconButton} disabled={isDeleting}>
                <BlurView intensity={40} tint={tint} style={styles.blurButton}>
                    {isDeleting ? (
                        <ActivityIndicator size="small" color="#ff4444" />
                    ) : (
                        <Ionicons name="trash-outline" size={20} color="#ff4444" />
                    )}
                </BlurView>
            </TouchableOpacity>
        </View>
    );
}

// ─── Bottom overlay (time + mood pill) ───────────────────────────────────────

function HeroOverlayInfo({ capture, moodDisplay }: { capture: Capture; moodDisplay: ReturnType<ReturnType<typeof useMoodResolver>['getMoodDisplay']> }) {
    return (
        <View style={styles.imageOverlayInfo}>
            <BlurView intensity={40} tint="dark" style={styles.timePill}>
                <Ionicons name="time-outline" size={14} color="rgba(255,255,255,0.9)" />
                <ThemedText style={styles.timeText}>
                    {format(new Date(capture.created_at), 'h:mm a')}
                </ThemedText>
            </BlurView>

            {moodDisplay && (
                <View style={[styles.moodPill, { backgroundColor: `${moodDisplay.color}33`, borderColor: `${moodDisplay.color}66` }]}>
                    <Ionicons name="pricetag-outline" size={14} color={moodDisplay.color} />
                    <ThemedText style={[styles.moodText, { color: moodDisplay.color }]}>{moodDisplay.name}</ThemedText>
                </View>
            )}
        </View>
    );
}

// ─── Photo hero (BeReal-style image) ─────────────────────────────────────────

function PhotoHero({ capture, moodDisplay, onBack, onDelete, isDeleting }: {
    capture: Capture;
    moodDisplay: ReturnType<ReturnType<typeof useMoodResolver>['getMoodDisplay']>;
    onBack: () => void;
    onDelete: () => void;
    isDeleting: boolean;
}) {
    return (
        <View style={styles.heroSection}>
            <Image source={{ uri: capture.image_url }} style={styles.heroImage} />
            <LinearGradient
                colors={['rgba(0,0,0,0.3)', 'transparent', 'rgba(0,0,0,0.6)']}
                style={styles.heroGradient}
                pointerEvents="none"
            />
            <HeaderButtons onBack={onBack} onDelete={onDelete} isDeleting={isDeleting} />
            <HeroOverlayInfo capture={capture} moodDisplay={moodDisplay} />
        </View>
    );
}

// ─── Journal hero (full-bleed quote display) ─────────────────────────────────

function JournalHero({ capture, moodDisplay, onBack, onDelete, isDeleting }: {
    capture: Capture;
    moodDisplay: ReturnType<ReturnType<typeof useMoodResolver>['getMoodDisplay']>;
    onBack: () => void;
    onDelete: () => void;
    isDeleting: boolean;
}) {
    const tint = moodDisplay?.color ?? '#444';
    const note = (capture.note ?? '').trim();

    return (
        <View style={[styles.heroSection, { backgroundColor: '#0A0A0A' }]}>
            <LinearGradient
                colors={[`${tint}55`, '#0A0A0A']}
                start={{ x: 1, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFill}
            />
            <View style={styles.journalHeroContent}>
                <ThemedText style={[styles.journalHeroQuote, { color: `${tint}` }]}>"</ThemedText>
                <ThemedText style={styles.journalHeroText}>{note}</ThemedText>
            </View>
            <HeaderButtons onBack={onBack} onDelete={onDelete} isDeleting={isDeleting} />
            <HeroOverlayInfo capture={capture} moodDisplay={moodDisplay} />
        </View>
    );
}

// ─── Voice hero (music-player UI with smooth seek bar) ───────────────────────

function VoiceHero({ capture, moodDisplay, onBack, onDelete, isDeleting }: {
    capture: Capture;
    moodDisplay: ReturnType<ReturnType<typeof useMoodResolver>['getMoodDisplay']>;
    onBack: () => void;
    onDelete: () => void;
    isDeleting: boolean;
}) {
    const tint = moodDisplay?.color ?? '#7AA8FF';
    const soundRef = useRef<Audio.Sound | null>(null);
    const isPlayingRef = useRef(false);
    const lastKnownRef = useRef({ ms: 0, at: Date.now() });
    const durationRef = useRef(0);
    const rafRef = useRef<number | null>(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const [displaySeconds, setDisplaySeconds] = useState(0);
    const [durationMs, setDurationMs] = useState(0);

    // Shared values drive the seek bar at 60fps
    const positionShared = useSharedValue(0);

    // Sync ref with state for RAF loop
    useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

    // RAF loop interpolates between status updates so the bar/timer feel music-player smooth
    const tick = useCallback(() => {
        if (!isPlayingRef.current) return;
        const elapsed = Date.now() - lastKnownRef.current.at;
        const pos = durationRef.current > 0
            ? Math.min(durationRef.current, lastKnownRef.current.ms + elapsed)
            : lastKnownRef.current.ms + elapsed;
        positionShared.value = pos;
        const sec = Math.floor(pos / 1000);
        setDisplaySeconds(prev => (prev !== sec ? sec : prev));
        rafRef.current = requestAnimationFrame(tick);
    }, [positionShared]);

    useEffect(() => {
        if (isPlaying) {
            rafRef.current = requestAnimationFrame(tick);
        } else if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        return () => {
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        };
    }, [isPlaying, tick]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            soundRef.current?.unloadAsync().catch(() => {});
            soundRef.current = null;
        };
    }, []);

    const onStatus = useCallback((status: AVPlaybackStatus) => {
        if (!status.isLoaded) return;
        if (status.durationMillis) {
            durationRef.current = status.durationMillis;
            setDurationMs(prev => (prev !== status.durationMillis ? status.durationMillis! : prev));
        }
        lastKnownRef.current = { ms: status.positionMillis, at: Date.now() };
        positionShared.value = status.positionMillis;
        const sec = Math.floor(status.positionMillis / 1000);
        setDisplaySeconds(prev => (prev !== sec ? sec : prev));
        if (status.didJustFinish) {
            setIsPlaying(false);
            lastKnownRef.current = { ms: 0, at: Date.now() };
            positionShared.value = 0;
            setDisplaySeconds(0);
            soundRef.current?.setPositionAsync(0).catch(() => {});
        }
    }, [positionShared]);

    const ensureLoaded = useCallback(async () => {
        if (soundRef.current || !capture.audio_url) return soundRef.current;
        // Allow playback in silent mode (iOS) before loading the sound
        try {
            await Audio.setAudioModeAsync({
                playsInSilentModeIOS: true,
                allowsRecordingIOS: false,
                staysActiveInBackground: false,
                shouldDuckAndroid: true,
            });
        } catch (e) {
            console.warn('[VoiceHero] setAudioModeAsync failed', e);
        }
        try {
            const { sound } = await Audio.Sound.createAsync(
                { uri: capture.audio_url },
                { shouldPlay: false, progressUpdateIntervalMillis: 100 },
                onStatus,
            );
            soundRef.current = sound;
            return sound;
        } catch (e) {
            console.warn('[VoiceHero] createAsync failed for', capture.audio_url, e);
            return null;
        }
    }, [capture.audio_url, onStatus]);

    const togglePlay = useCallback(async () => {
        if (!capture.audio_url) {
            console.warn('[VoiceHero] no audio_url on capture', capture.id);
            return;
        }
        try {
            const sound = await ensureLoaded();
            if (!sound) return;
            if (isPlaying) {
                await sound.pauseAsync();
                setIsPlaying(false);
                // Resync last-known on pause so RAF doesn't drift past the paused point on resume
                const status = await sound.getStatusAsync();
                if (status.isLoaded) {
                    lastKnownRef.current = { ms: status.positionMillis, at: Date.now() };
                    positionShared.value = status.positionMillis;
                }
            } else {
                lastKnownRef.current = { ms: lastKnownRef.current.ms, at: Date.now() };
                await sound.playAsync();
                setIsPlaying(true);
            }
        } catch (err) {
            console.warn('[VoiceHero] play failed', err);
        }
    }, [capture.audio_url, capture.id, ensureLoaded, isPlaying, positionShared]);

    const seekToMs = useCallback(async (ms: number) => {
        try {
            const sound = await ensureLoaded();
            if (!sound) return;
            const target = Math.max(0, Math.min(ms, durationRef.current));
            await sound.setPositionAsync(target);
            lastKnownRef.current = { ms: target, at: Date.now() };
            positionShared.value = target;
            setDisplaySeconds(Math.floor(target / 1000));
        } catch (err) {
            console.warn('[VoiceHero] seek failed', err);
        }
    }, [ensureLoaded, positionShared]);

    return (
        <View style={[styles.heroSection, { backgroundColor: '#0A0A0A' }]}>
            <LinearGradient
                colors={[`${tint}44`, '#0A0A0A']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={StyleSheet.absoluteFill}
            />

            <View style={styles.voiceHeroContent}>
                <TouchableOpacity
                    onPress={togglePlay}
                    style={[styles.voicePlayBtn, { backgroundColor: tint }]}
                    activeOpacity={0.85}
                >
                    <Ionicons name={isPlaying ? 'pause' : 'play'} size={36} color="#FFFFFF" style={isPlaying ? undefined : { marginLeft: 4 }} />
                </TouchableOpacity>

                <SeekBar
                    positionShared={positionShared}
                    durationMs={durationMs}
                    tint={tint}
                    onSeek={seekToMs}
                />

                <View style={styles.voiceTimeRow}>
                    <ThemedText style={styles.voiceTimeText}>{formatSeconds(displaySeconds)}</ThemedText>
                    <ThemedText style={styles.voiceTimeText}>{durationMs > 0 ? formatMs(durationMs) : '--:--'}</ThemedText>
                </View>
            </View>

            <HeaderButtons onBack={onBack} onDelete={onDelete} isDeleting={isDeleting} />
            <HeroOverlayInfo capture={capture} moodDisplay={moodDisplay} />
        </View>
    );
}

// ─── Seek bar (gesture-handler scrubber) ─────────────────────────────────────

const SEEK_TRACK_HEIGHT = 4;
const SEEK_THUMB_SIZE = 18;

function SeekBar({ positionShared, durationMs, tint, onSeek }: {
    positionShared: Animated.SharedValue<number>;
    durationMs: number;
    tint: string;
    onSeek: (ms: number) => void;
}) {
    const [trackWidth, setTrackWidth] = useState(0);
    const isDragging = useSharedValue(0); // 0 = not dragging, 1 = dragging
    const dragX = useSharedValue(0);      // current x while dragging (px)

    // Computed filled px from playback position (updated at 60fps via shared value)
    const filledFromShared = useDerivedValue(() => {
        if (durationMs <= 0 || trackWidth <= 0) return 0;
        const ratio = Math.max(0, Math.min(1, positionShared.value / durationMs));
        return trackWidth * ratio;
    }, [durationMs, trackWidth]);

    const filledStyle = useAnimatedStyle(() => {
        const filled = isDragging.value === 1 ? dragX.value : filledFromShared.value;
        return { width: Math.max(0, Math.min(trackWidth, filled)) };
    });
    const thumbStyle = useAnimatedStyle(() => {
        const x = isDragging.value === 1 ? dragX.value : filledFromShared.value;
        return { transform: [{ translateX: Math.max(0, Math.min(trackWidth, x)) - SEEK_THUMB_SIZE / 2 }] };
    });

    const commitSeek = useCallback((px: number) => {
        if (trackWidth <= 0 || durationMs <= 0) return;
        const ratio = Math.max(0, Math.min(1, px / trackWidth));
        onSeek(ratio * durationMs);
    }, [trackWidth, durationMs, onSeek]);

    const pan = Gesture.Pan()
        .minDistance(0)
        .onBegin((e) => {
            isDragging.value = 1;
            dragX.value = e.x;
        })
        .onUpdate((e) => {
            dragX.value = Math.max(0, Math.min(trackWidth, e.x));
        })
        .onEnd((e) => {
            const x = Math.max(0, Math.min(trackWidth, e.x));
            isDragging.value = 0;
            runOnJS(commitSeek)(x);
        });

    const tap = Gesture.Tap().onEnd((e) => {
        runOnJS(commitSeek)(e.x);
    });

    const composed = Gesture.Race(pan, tap);

    return (
        <GestureDetector gesture={composed}>
            <View
                style={styles.seekContainer}
                onLayout={e => setTrackWidth(e.nativeEvent.layout.width)}
            >
                <View style={[styles.seekTrack, { backgroundColor: 'rgba(255,255,255,0.15)' }]} />
                <Animated.View style={[styles.seekFill, { backgroundColor: tint }, filledStyle]} />
                <Animated.View style={[styles.seekThumb, { backgroundColor: tint, top: -((SEEK_THUMB_SIZE - SEEK_TRACK_HEIGHT) / 2) }, thumbStyle]} />
            </View>
        </GestureDetector>
    );
}

function formatMs(ms: number): string {
    return formatSeconds(Math.floor(ms / 1000));
}

function formatSeconds(total: number): string {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Link hero (expanded shared link card with embed) ────────────────────────

function LinkHero({ capture, moodDisplay, onBack, onDelete, isDeleting }: {
    capture: Capture;
    moodDisplay: ReturnType<ReturnType<typeof useMoodResolver>['getMoodDisplay']>;
    onBack: () => void;
    onDelete: () => void;
    isDeleting: boolean;
}) {
    const url = capture.shared_link_url ?? '';
    const savedPlatform = (capture.shared_link_platform ?? 'Web') as SharedLinkPlatform;
    const platform = savedPlatform === 'Web' && url ? detectPlatform(url) : savedPlatform;
    const title = capture.shared_link_title ?? null;
    const thumb = capture.shared_link_thumbnail_url ?? null;
    const platformColor = platformToColor(platform);
    const embeddable = !!url && isEmbeddablePlatform(platform, url);

    const handleOpen = useCallback(() => {
        if (url) Linking.openURL(url).catch(() => {});
    }, [url]);

    return (
        <View style={[styles.heroSection, styles.linkHeroSection]}>
            <LinearGradient
                colors={[`${platformColor}33`, '#0A0A0A']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={StyleSheet.absoluteFill}
            />

            {/* Top buttons + an extra "open link" pill */}
            <View style={styles.linkTopRow}>
                <TouchableOpacity onPress={onBack} style={styles.iconButton}>
                    <BlurView intensity={40} tint="dark" style={styles.blurButton}>
                        <Ionicons name="chevron-back" size={24} color="white" />
                    </BlurView>
                </TouchableOpacity>
                <View style={styles.linkTopRight}>
                    <TouchableOpacity onPress={handleOpen} style={styles.iconButton}>
                        <BlurView intensity={40} tint="dark" style={styles.blurButton}>
                            <Ionicons name="open-outline" size={20} color="white" />
                        </BlurView>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onDelete} style={styles.iconButton} disabled={isDeleting}>
                        <BlurView intensity={40} tint="dark" style={styles.blurButton}>
                            {isDeleting ? (
                                <ActivityIndicator size="small" color="#ff4444" />
                            ) : (
                                <Ionicons name="trash-outline" size={20} color="#ff4444" />
                            )}
                        </BlurView>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Link card content (static preview + embed expanded) */}
            <View style={styles.linkHeroBody}>
                <TouchableOpacity activeOpacity={0.85} onPress={handleOpen}>
                    <StaticLinkPreview
                        url={url}
                        platform={platform}
                        title={title}
                        thumbnailUrl={thumb}
                        isLight={false}
                    />
                </TouchableOpacity>

                {embeddable && (
                    <View style={styles.linkEmbedHolder}>
                        <PlatformEmbed
                            url={url}
                            platform={platform}
                            isLight={false}
                            horizontalPaddingTotal={32}
                        />
                    </View>
                )}

                {/* Bottom info: time + mood + URL */}
                <View style={styles.linkBottomRow}>
                    <BlurView intensity={40} tint="dark" style={styles.timePill}>
                        <Ionicons name="time-outline" size={14} color="rgba(255,255,255,0.9)" />
                        <ThemedText style={styles.timeText}>
                            {format(new Date(capture.created_at), 'h:mm a')}
                        </ThemedText>
                    </BlurView>
                    {moodDisplay && (
                        <View style={[styles.moodPill, { backgroundColor: `${moodDisplay.color}33`, borderColor: `${moodDisplay.color}66` }]}>
                            <Ionicons name="pricetag-outline" size={14} color={moodDisplay.color} />
                            <ThemedText style={[styles.moodText, { color: moodDisplay.color }]}>{moodDisplay.name}</ThemedText>
                        </View>
                    )}
                </View>
            </View>
        </View>
    );
}

// ─── Mood-only hero (large gradient pill display) ────────────────────────────

function MoodHero({ capture, moodDisplay, onBack, onDelete, isDeleting }: {
    capture: Capture;
    moodDisplay: ReturnType<ReturnType<typeof useMoodResolver>['getMoodDisplay']>;
    onBack: () => void;
    onDelete: () => void;
    isDeleting: boolean;
}) {
    const primary = moodDisplay?.gradient.primary ?? '#888';
    const mid = moodDisplay?.gradient.mid ?? '#666';
    const secondary = moodDisplay?.gradient.secondary ?? '#333';
    const name = moodDisplay?.name ?? capture.mood_name_snapshot;
    const textColor = moodDisplay?.textOn === 'dark' ? '#0A0A0A' : '#FFFFFF';

    return (
        <View style={[styles.heroSection, { backgroundColor: '#0A0A0A' }]}>
            <View style={styles.moodHeroBody}>
                <LinearGradient
                    colors={[primary, mid, secondary]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.moodHeroPill}
                >
                    <ThemedText style={[styles.moodHeroLabel, { color: textColor }]}>{name}</ThemedText>
                </LinearGradient>
                <ThemedText style={styles.moodHeroSubtle}>
                    {format(new Date(capture.created_at), 'h:mm a · MMMM d, yyyy')}
                </ThemedText>
            </View>
            <HeaderButtons onBack={onBack} onDelete={onDelete} isDeleting={isDeleting} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 20,
    },
    goBackButton: {
        padding: 10,
    },
    scrollContent: {
        flexGrow: 1,
    },

    // ── Shared hero shell ──
    heroSection: {
        width: '100%',
        aspectRatio: 3 / 4,
        backgroundColor: '#18181b',
        position: 'relative',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    heroImage: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    heroGradient: {
        ...StyleSheet.absoluteFillObject,
    },

    // ── Header + overlay ──
    header: {
        position: 'absolute',
        top: 50,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
    },
    iconButton: {
        borderRadius: 20,
        overflow: 'hidden',
    },
    blurButton: {
        padding: 10,
        borderRadius: 20,
        overflow: 'hidden',
    },
    imageOverlayInfo: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        padding: 16,
    },
    timePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 100,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    timeText: {
        fontSize: 12,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.9)',
    },
    moodPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 100,
        borderWidth: 1,
    },
    moodText: {
        fontSize: 12,
        fontWeight: '500',
    },

    // ── Journal hero ──
    journalHeroContent: {
        flex: 1,
        paddingHorizontal: 32,
        paddingTop: 110,
        paddingBottom: 90,
        justifyContent: 'center',
    },
    journalHeroQuote: {
        fontSize: 80,
        lineHeight: 80,
        fontFamily: 'Inter_700Bold',
        opacity: 0.65,
        marginBottom: -8,
    },
    journalHeroText: {
        fontSize: 22,
        lineHeight: 32,
        color: 'rgba(255,255,255,0.92)',
        fontStyle: 'italic',
        fontFamily: 'Inter_400Regular',
    },

    // ── Voice hero ──
    voiceHeroContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
        paddingTop: 60,
        paddingBottom: 80,
        gap: 28,
    },
    voicePlayBtn: {
        width: 88,
        height: 88,
        borderRadius: 44,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.35,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
    },
    voiceTimeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
    },
    voiceTimeText: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.7)',
        fontVariant: ['tabular-nums'],
    },

    // ── Seek bar ──
    seekContainer: {
        width: '100%',
        height: SEEK_THUMB_SIZE,
        justifyContent: 'center',
    },
    seekTrack: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: SEEK_TRACK_HEIGHT,
        borderRadius: SEEK_TRACK_HEIGHT / 2,
    },
    seekFill: {
        position: 'absolute',
        left: 0,
        height: SEEK_TRACK_HEIGHT,
        borderRadius: SEEK_TRACK_HEIGHT / 2,
    },
    seekThumb: {
        position: 'absolute',
        width: SEEK_THUMB_SIZE,
        height: SEEK_THUMB_SIZE,
        borderRadius: SEEK_THUMB_SIZE / 2,
        left: 0,
        borderWidth: 2,
        borderColor: '#FFFFFF',
    },

    // ── Link hero ──
    linkHeroSection: {
        aspectRatio: undefined,
        minHeight: 480,
    },
    linkTopRow: {
        position: 'absolute',
        top: 50,
        left: 0,
        right: 0,
        zIndex: 10,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
    },
    linkTopRight: {
        flexDirection: 'row',
        gap: 8,
    },
    linkHeroBody: {
        flex: 1,
        paddingHorizontal: 16,
        paddingTop: 110,
        paddingBottom: 16,
        gap: 12,
    },
    linkEmbedHolder: {
        // PlatformEmbed manages its own border/height
    },
    linkBottomRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginTop: 'auto',
    },

    // ── Mood-only hero ──
    moodHeroBody: {
        flex: 1,
        paddingHorizontal: 32,
        paddingTop: 110,
        paddingBottom: 60,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 22,
    },
    moodHeroPill: {
        width: width - 64,
        height: width - 64,
        maxHeight: 320,
        maxWidth: 320,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
        paddingVertical: 32,
    },
    moodHeroLabel: {
        fontSize: 30,
        lineHeight: 40,
        fontWeight: '800',
        letterSpacing: 0.5,
        textAlign: 'center',
        textAlignVertical: 'center',
        includeFontPadding: false,
        textShadowColor: 'rgba(0,0,0,0.35)',
        textShadowRadius: 6,
        textShadowOffset: { width: 0, height: 1 },
    },
    moodHeroSubtle: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.55)',
    },

    // ── Details section ──
    detailsSection: {
        padding: 24,
        gap: 24,
    },
    topicChipRow: {
        flexDirection: 'row',
    },
    topicChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 100,
        borderWidth: 1,
        backgroundColor: 'rgba(255,255,255,0.04)',
    },
    topicChipText: {
        fontSize: 12,
        fontWeight: '600',
    },
    captionSection: {
        gap: 8,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    sectionLabel: {
        fontSize: 10,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 1.5,
    },
    captionText: {
        fontSize: 14,
        lineHeight: 22,
        color: 'rgba(255,255,255,0.7)',
        fontStyle: 'italic',
    },
    journalSection: {
        gap: 12,
    },
    journalBox: {
        backgroundColor: 'rgba(39, 39, 42, 0.5)',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        padding: 16,
    },
    journalText: {
        fontSize: 15,
        lineHeight: 24,
        color: 'rgba(255,255,255,0.8)',
    },
    footer: {
        alignItems: 'center',
        paddingTop: 16,
        paddingBottom: 40,
    },
    footerText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.3)',
    },
});

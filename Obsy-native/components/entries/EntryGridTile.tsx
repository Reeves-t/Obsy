import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { format } from 'date-fns';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
    useSharedValue,
    useAnimatedProps,
    withTiming,
} from 'react-native-reanimated';
import { ThemedText } from '@/components/ui/ThemedText';
import type { Capture } from '@/types/capture';
import { useMoodResolver } from '@/hooks/useMoodResolver';
import { platformToColor } from '@/services/sharedLinkService';
import type { SharedLinkPlatform } from '@/services/sharedLinkService';

/**
 * EntryGridTile — a square tile representing one Capture entry in the grid view.
 *
 * Renders different visual content based on entry type:
 *  - photo / capture   → image fills the tile
 *  - shared_link       → thumbnail image fills the tile (platform color fallback)
 *  - journal w/ note   → stylized quote card with mood-tinted background
 *  - mood-only (no note)→ glossy gradient orb using the mood's gradient
 *  - voice             → play/pause button + animated progress ring, inline playback
 */

type EntryTileKind = 'photo' | 'link' | 'mood' | 'journal' | 'voice';

export function classifyEntry(c: Capture): EntryTileKind {
    if (c.source_type === 'shared_link') return 'link';
    if (c.source_type === 'voice') return 'voice';
    if (c.source_type === 'journal') {
        if (c.note && c.note.trim().length > 0) return 'journal';
        return 'mood';
    }
    return 'photo';
}

interface EntryGridTileProps {
    capture: Capture;
    size: number;
    onPress: (id: string) => void;
    isLight: boolean;
}

export const EntryGridTile = memo(function EntryGridTile({
    capture,
    size,
    onPress,
    isLight,
}: EntryGridTileProps) {
    const kind = classifyEntry(capture);
    const handlePress = useCallback(() => onPress(capture.id), [capture.id, onPress]);

    const baseTileStyle = [
        styles.tile,
        {
            width: size,
            height: size,
            borderColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)',
        },
    ];

    // Mood-only renders as a standalone gradient pill — no surrounding tile bg
    const moodOnlyStyle = [{ width: size, height: size }];

    let tile: React.ReactNode;
    if (kind === 'voice') {
        tile = (
            <VoiceTile
                capture={capture}
                size={size}
                onOpen={handlePress}
                tileStyle={baseTileStyle}
                isLight={isLight}
            />
        );
    } else if (kind === 'mood') {
        tile = (
            <TouchableOpacity activeOpacity={0.85} onPress={handlePress} style={moodOnlyStyle}>
                <MoodPillTile capture={capture} isLight={isLight} />
            </TouchableOpacity>
        );
    } else {
        tile = (
            <TouchableOpacity activeOpacity={0.85} onPress={handlePress} style={baseTileStyle}>
                {kind === 'photo' && <PhotoTile capture={capture} />}
                {kind === 'link' && <LinkTile capture={capture} isLight={isLight} />}
                {kind === 'journal' && <JournalTile capture={capture} size={size} isLight={isLight} />}
            </TouchableOpacity>
        );
    }

    return (
        <View style={{ width: size }}>
            {tile}
            <TileMeta capture={capture} isLight={isLight} />
        </View>
    );
});

// ─── Per-tile metadata row (mood pill + time) ────────────────────────────────

const TileMeta = memo(function TileMeta({ capture, isLight }: { capture: Capture; isLight: boolean }) {
    const { getMoodDisplay } = useMoodResolver();
    const moodDisplay = getMoodDisplay(capture.mood_id, capture.mood_name_snapshot);
    const pillBg = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.07)';
    const textColor = isLight ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.75)';
    const timeColor = isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.5)';

    return (
        <View style={styles.metaRow}>
            {moodDisplay ? (
                <View style={[
                    styles.metaPill,
                    { backgroundColor: pillBg, borderLeftColor: moodDisplay.color, borderLeftWidth: 2 },
                ]}>
                    <ThemedText numberOfLines={1} style={[styles.metaPillText, { color: textColor }]}>
                        {moodDisplay.name}
                    </ThemedText>
                </View>
            ) : (
                <View />
            )}
            <ThemedText style={[styles.metaTime, { color: timeColor }]}>
                {format(new Date(capture.created_at), 'h:mm a')}
            </ThemedText>
        </View>
    );
});

// ─── Photo ───────────────────────────────────────────────────────────────────

const PhotoTile = memo(function PhotoTile({ capture }: { capture: Capture }) {
    return (
        <Image
            source={{ uri: capture.image_url }}
            style={styles.fill}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={capture.id}
        />
    );
});

// ─── Shared link ─────────────────────────────────────────────────────────────

/**
 * Renders the brand icon for a platform. Uses FontAwesome5 brand logos for the
 * platforms it ships proper logos for (YouTube, Spotify, TikTok, Instagram,
 * Twitter, Reddit) and Ionicons globe for generic Web links.
 */
function PlatformBrandIcon({ platform, size, color }: { platform: SharedLinkPlatform; size: number; color: string }) {
    switch (platform) {
        case 'YouTube': return <FontAwesome5 name="youtube" size={size} color={color} solid />;
        case 'Spotify': return <FontAwesome5 name="spotify" size={size} color={color} solid />;
        case 'TikTok': return <FontAwesome5 name="tiktok" size={size} color={color} solid />;
        case 'Instagram': return <FontAwesome5 name="instagram" size={size} color={color} solid />;
        case 'Twitter': return <FontAwesome5 name="twitter" size={size} color={color} solid />;
        case 'Reddit': return <FontAwesome5 name="reddit-alien" size={size} color={color} solid />;
        default: return <Ionicons name="globe-outline" size={size} color={color} />;
    }
}

const LinkTile = memo(function LinkTile({ capture, isLight }: { capture: Capture; isLight: boolean }) {
    const thumbnail = capture.shared_link_thumbnail_url;
    const platform = (capture.shared_link_platform ?? 'Web') as SharedLinkPlatform;
    const platformColor = platformToColor(platform);

    if (thumbnail) {
        return (
            <View style={styles.fill}>
                <Image
                    source={{ uri: thumbnail }}
                    style={styles.fill}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={`link-${capture.id}`}
                />
                <View style={[styles.linkBadge, { backgroundColor: platformColor }]}>
                    <PlatformBrandIcon platform={platform} size={11} color="#FFFFFF" />
                </View>
            </View>
        );
    }

    // No thumbnail — render a platform-colored card with title + platform brand icon
    const title = capture.shared_link_title ?? '';
    const fg = isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.9)';

    return (
        <View style={[styles.linkFallback, { backgroundColor: platformColor + '22' }]}>
            <View style={[styles.linkIconCircle, { backgroundColor: platformColor }]}>
                <PlatformBrandIcon platform={platform} size={20} color="#FFFFFF" />
            </View>
            {!!title && (
                <ThemedText
                    numberOfLines={2}
                    style={[styles.linkFallbackText, { color: fg }]}
                >
                    {title}
                </ThemedText>
            )}
        </View>
    );
});

// ─── Mood-only (standalone gradient pill, fills the slot) ────────────────────

const MoodPillTile = memo(function MoodPillTile({ capture, isLight }: { capture: Capture; isLight: boolean }) {
    const { getMoodDisplay } = useMoodResolver();
    const moodDisplay = getMoodDisplay(capture.mood_id, capture.mood_name_snapshot);

    const primary = moodDisplay?.gradient.primary ?? '#888';
    const mid = moodDisplay?.gradient.mid ?? '#666';
    const secondary = moodDisplay?.gradient.secondary ?? '#333';
    const name = moodDisplay?.name ?? capture.mood_name_snapshot;
    const textColor = moodDisplay?.textOn === 'dark' ? '#0A0A0A' : '#FFFFFF';

    return (
        <View style={styles.moodPillWrap}>
            <LinearGradient
                colors={[primary, mid, secondary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.moodPillFill}
            >
                <ThemedText
                    numberOfLines={2}
                    style={[
                        styles.moodPillLabel,
                        { color: textColor },
                    ]}
                >
                    {name}
                </ThemedText>
            </LinearGradient>
        </View>
    );
});

// ─── Journal (stylized quote card) ───────────────────────────────────────────

const JournalTile = memo(function JournalTile({
    capture,
    size,
    isLight,
}: {
    capture: Capture;
    size: number;
    isLight: boolean;
}) {
    const { getMoodDisplay } = useMoodResolver();
    const moodDisplay = getMoodDisplay(capture.mood_id, capture.mood_name_snapshot);
    const tint = moodDisplay?.color ?? (isLight ? '#888' : '#444');

    // Build gradient tint background — darker at top-right corner using mood color
    const baseBg = isLight ? '#FAFAFA' : '#101010';
    const textColor = isLight ? '#1A1A1A' : '#EAEAEA';
    const quoteColor = tint + (isLight ? '55' : '88');

    // Crop note for display — first ~120 chars
    const text = (capture.note ?? '').trim().slice(0, 140);

    // Font size scales with tile size — small text reads as a thumbnail
    const fontSize = Math.max(9, Math.round(size * 0.085));
    const lineHeight = Math.round(fontSize * 1.35);

    return (
        <View style={[styles.fill, { backgroundColor: baseBg }]}>
            <LinearGradient
                colors={[tint + '22', 'transparent']}
                start={{ x: 1, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.fill}
            />
            <View style={styles.journalContent}>
                <ThemedText style={[styles.journalQuoteMark, { color: quoteColor, fontSize: fontSize * 2.4 }]}>
                    “
                </ThemedText>
                <ThemedText
                    numberOfLines={5}
                    style={[styles.journalText, { color: textColor, fontSize, lineHeight }]}
                >
                    {text}
                </ThemedText>
            </View>
        </View>
    );
});

// ─── Voice (play/pause with progress ring + inline playback) ────────────────

// Module-level singleton: only one tile plays audio at a time.
let activeVoiceTileId: string | null = null;
const activeVoiceListeners = new Set<(activeId: string | null) => void>();
function setActiveVoice(id: string | null) {
    activeVoiceTileId = id;
    activeVoiceListeners.forEach(fn => fn(id));
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const VoiceTile = memo(function VoiceTile({
    capture,
    size,
    onOpen,
    tileStyle,
    isLight,
}: {
    capture: Capture;
    size: number;
    onOpen: () => void;
    tileStyle: any;
    isLight: boolean;
}) {
    const { getMoodDisplay } = useMoodResolver();
    const moodDisplay = getMoodDisplay(capture.mood_id, capture.mood_name_snapshot);
    const tint = moodDisplay?.color ?? '#7AA8FF';

    const soundRef = useRef<Audio.Sound | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const progress = useSharedValue(0);

    // Ring geometry
    const ringRadius = size * 0.32;
    const ringStroke = Math.max(3, size * 0.025);
    const ringCx = size / 2;
    const ringCy = size / 2;
    const circumference = 2 * Math.PI * ringRadius;

    const playIconSize = Math.round(size * 0.26);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            soundRef.current?.unloadAsync().catch(() => {});
            soundRef.current = null;
            if (activeVoiceTileId === capture.id) setActiveVoice(null);
        };
    }, [capture.id]);

    // Listen for another tile starting playback — stop ours if so
    useEffect(() => {
        const listener = (activeId: string | null) => {
            if (activeId !== capture.id && isPlaying) {
                stopPlayback();
            }
        };
        activeVoiceListeners.add(listener);
        return () => {
            activeVoiceListeners.delete(listener);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPlaying, capture.id]);

    const onStatus = useCallback((status: AVPlaybackStatus) => {
        if (!status.isLoaded) return;
        if (status.durationMillis && status.durationMillis > 0) {
            const pct = Math.min(1, status.positionMillis / status.durationMillis);
            progress.value = pct;
        }
        if (status.didJustFinish) {
            progress.value = withTiming(0, { duration: 250 });
            setIsPlaying(false);
            if (activeVoiceTileId === capture.id) setActiveVoice(null);
        }
    }, [capture.id, progress]);

    const stopPlayback = useCallback(async () => {
        try {
            await soundRef.current?.pauseAsync();
        } catch {}
        setIsPlaying(false);
    }, []);

    const handleTogglePlay = useCallback(async (e: any) => {
        e?.stopPropagation?.();
        if (!capture.audio_url) return;

        if (isPlaying) {
            await stopPlayback();
            if (activeVoiceTileId === capture.id) setActiveVoice(null);
            return;
        }

        // Notify other tiles to stop
        setActiveVoice(capture.id);

        try {
            if (!soundRef.current) {
                const { sound } = await Audio.Sound.createAsync(
                    { uri: capture.audio_url },
                    { shouldPlay: true },
                    onStatus,
                );
                soundRef.current = sound;
            } else {
                await soundRef.current.playAsync();
            }
            setIsPlaying(true);
        } catch (err) {
            console.warn('[VoiceTile] play failed', err);
            setIsPlaying(false);
            if (activeVoiceTileId === capture.id) setActiveVoice(null);
        }
    }, [capture.audio_url, capture.id, isPlaying, onStatus, stopPlayback]);

    const animatedRingProps = useAnimatedProps(() => ({
        strokeDashoffset: circumference * (1 - progress.value),
    }));

    const bg = isLight ? '#F4F4F6' : '#121214';
    const ringTrack = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)';

    return (
        <Pressable onPress={onOpen} style={tileStyle}>
            <View style={[styles.fill, styles.voiceTile, { backgroundColor: bg }]}>
                <LinearGradient
                    colors={[tint + '26', 'transparent']}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={styles.fill}
                />
                <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
                    {/* Track */}
                    <Circle
                        cx={ringCx}
                        cy={ringCy}
                        r={ringRadius}
                        stroke={ringTrack}
                        strokeWidth={ringStroke}
                        fill="none"
                    />
                    {/* Progress */}
                    <AnimatedCircle
                        cx={ringCx}
                        cy={ringCy}
                        r={ringRadius}
                        stroke={tint}
                        strokeWidth={ringStroke}
                        fill="none"
                        strokeLinecap="round"
                        strokeDasharray={`${circumference} ${circumference}`}
                        animatedProps={animatedRingProps}
                        transform={`rotate(-90 ${ringCx} ${ringCy})`}
                    />
                </Svg>
                <Pressable
                    onPress={handleTogglePlay}
                    hitSlop={8}
                    style={({ pressed }) => [
                        styles.voicePlayBtn,
                        { opacity: pressed ? 0.7 : 1, transform: [{ translateX: -playIconSize / 2 }, { translateY: -playIconSize / 2 }] },
                    ]}
                >
                    <Ionicons
                        name={isPlaying ? 'pause' : 'play'}
                        size={playIconSize}
                        color={tint}
                    />
                </Pressable>
            </View>
        </Pressable>
    );
});

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    tile: {
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: '#000',
        borderWidth: 1,
    },
    fill: {
        ...StyleSheet.absoluteFillObject,
    },

    // Link fallback (no thumbnail)
    linkFallback: {
        flex: 1,
        padding: 10,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    linkIconCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    linkFallbackText: {
        fontSize: 10,
        textAlign: 'center',
        lineHeight: 13,
    },
    linkBadge: {
        position: 'absolute',
        top: 6,
        right: 6,
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: 'rgba(0,0,0,0.55)',
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Mood-only standalone pill (fills slot, no surrounding tile)
    moodPillWrap: {
        flex: 1,
        borderRadius: 14,
        overflow: 'hidden',
    },
    moodPillFill: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 8,
    },
    moodPillLabel: {
        fontSize: 14,
        fontWeight: '700',
        letterSpacing: 0.3,
        textAlign: 'center',
        textShadowColor: 'rgba(0,0,0,0.35)',
        textShadowRadius: 4,
        textShadowOffset: { width: 0, height: 1 },
    },

    // Per-tile metadata row (under the tile)
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 2,
        paddingTop: 6,
        gap: 4,
    },
    metaPill: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 8,
        flexShrink: 1,
        maxWidth: '70%',
    },
    metaPillText: {
        fontSize: 9,
        fontWeight: '500',
    },
    metaTime: {
        fontSize: 9,
        fontWeight: '500',
    },

    // Journal quote tile
    journalContent: {
        flex: 1,
        padding: 10,
        justifyContent: 'center',
    },
    journalQuoteMark: {
        position: 'absolute',
        top: -4,
        left: 6,
        fontFamily: 'Inter_700Bold',
        opacity: 0.6,
    },
    journalText: {
        fontStyle: 'italic',
        fontFamily: 'Inter_400Regular',
    },

    // Voice tile
    voiceTile: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    voicePlayBtn: {
        position: 'absolute',
        left: '50%',
        top: '50%',
    },
});

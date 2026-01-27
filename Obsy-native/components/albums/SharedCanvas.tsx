import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, StyleSheet, Dimensions, TouchableOpacity, Modal } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    Easing,
    withSequence,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import Colors from '@/constants/Colors';
import { ThemedText } from '@/components/ui/ThemedText';
import { supabase } from '@/lib/supabase';
import { formatDistanceToNow } from 'date-fns';
import { useAlbumInsightPosts } from '@/hooks/useAlbumInsightPosts';
import { AlbumInsightPostWithAuthor } from '@/types/albums';
import { Ionicons } from '@expo/vector-icons';
import { CloudArtifact } from './CloudArtifact';
import { InsightModal } from './InsightModal';
import { useMockAlbums } from '@/contexts/MockAlbumContext';
import { useAlbumHiddenMembers } from '@/lib/useAlbumHiddenMembers';
import { useMoodResolver } from '@/hooks/useMoodResolver';

const { width, height } = Dimensions.get('window');

interface BubbleData {
    id: string;
    albumId?: string;
    uri: string;
    user: string;
    mood_id: string; // Updated from mood: string
    mood_name_snapshot: string; // New snapshot field
    time: string;
    created_at: string;
    isSeen?: boolean;
    isMock?: boolean;
    isIntro?: boolean;
}

interface FloatingBubbleProps {
    item: BubbleData;
    index: number;
    onPress: (item: BubbleData) => void;
    isGenerating?: boolean;
}

const FloatingBubble = ({ item, index, onPress, isGenerating }: FloatingBubbleProps) => {
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const rotate = useSharedValue(0);
    const scale = useSharedValue(1);

    const randomPath = useMemo(() => {
        const waypoints = Array.from({ length: 4 }, () => ({
            x: (Math.random() - 0.5) * width * 0.8,
            y: (Math.random() - 0.5) * height * 0.6,
        }));
        const duration = 40000 + Math.random() * 20000;
        const rotationDegrees = Math.random() > 0.5 ? 360 : -360;
        return { waypoints, duration, rotationDegrees };
    }, []);

    useEffect(() => {
        if (isGenerating) {
            translateY.value = withTiming(height / 2 + 100, { duration: 1000, easing: Easing.in(Easing.ease) });
            scale.value = withTiming(0, { duration: 1000 });
        } else {
            scale.value = withTiming(1, { duration: 500 });
            const { waypoints, duration, rotationDegrees } = randomPath;
            const stepDuration = duration / waypoints.length;
            const startX = (Math.random() - 0.5) * width * 0.6;
            const startY = (Math.random() - 0.5) * height * 0.5;
            translateX.value = startX;
            translateY.value = startY;
            translateX.value = withRepeat(
                withSequence(
                    withTiming(waypoints[0].x, { duration: stepDuration, easing: Easing.inOut(Easing.ease) }),
                    withTiming(waypoints[1].x, { duration: stepDuration, easing: Easing.inOut(Easing.ease) }),
                    withTiming(waypoints[2].x, { duration: stepDuration, easing: Easing.inOut(Easing.ease) }),
                    withTiming(waypoints[3].x, { duration: stepDuration, easing: Easing.inOut(Easing.ease) })
                ),
                -1,
                true
            );
            translateY.value = withRepeat(
                withSequence(
                    withTiming(waypoints[0].y, { duration: stepDuration, easing: Easing.inOut(Easing.ease) }),
                    withTiming(waypoints[1].y, { duration: stepDuration, easing: Easing.inOut(Easing.ease) }),
                    withTiming(waypoints[2].y, { duration: stepDuration, easing: Easing.inOut(Easing.ease) }),
                    withTiming(waypoints[3].y, { duration: stepDuration, easing: Easing.inOut(Easing.ease) })
                ),
                -1,
                true
            );
            rotate.value = withRepeat(
                withTiming(rotationDegrees, { duration, easing: Easing.linear }),
                -1,
                false
            );
        }
    }, [randomPath, isGenerating]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: translateX.value },
            { translateY: translateY.value },
            { rotate: `${rotate.value}deg` },
            { scale: scale.value }
        ]
    }));

    const isUnseen = item.isSeen === false;

    return (
        <Animated.View style={[styles.bubbleContainer, animatedStyle]}>
            <TouchableOpacity onPress={() => onPress(item)} activeOpacity={0.8}>
                <View style={[
                    styles.bubble,
                    isUnseen && styles.bubbleUnseen
                ]}>
                    <Image source={{ uri: item.uri }} style={styles.image} contentFit="cover" />
                    {item.isIntro && (
                        <View style={styles.introOverlay}>
                            <ThemedText style={styles.introText}>Click me</ThemedText>
                        </View>
                    )}
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
};

interface SharedCanvasProps {
    isGenerating?: boolean;
    albumId?: string;
    refreshKey?: number;
}

export function SharedCanvas({ isGenerating = false, albumId, refreshKey }: SharedCanvasProps) {
    const [selectedBubble, setSelectedBubble] = useState<BubbleData | null>(null);
    const [bubbles, setBubbles] = useState<BubbleData[]>([]);
    const [selectedThoughtCloud, setSelectedThoughtCloud] = useState<AlbumInsightPostWithAuthor | null>(null);
    const { getMoodDisplay } = useMoodResolver();

    const { mockPhotos, markPhotoAsSeen, unseenPhotos } = useMockAlbums();
    const { hiddenMembers } = useAlbumHiddenMembers();

    const { posts: thoughtClouds, refetch: refetchThoughtClouds } = useAlbumInsightPosts(
        albumId === 'public' ? undefined : albumId
    );

    useEffect(() => {
        if (refreshKey !== undefined && refreshKey > 0 && albumId !== 'public') {
            refetchThoughtClouds();
        }
    }, [refreshKey, refetchThoughtClouds, albumId]);

    const fetchEntries = useCallback(async () => {
        if (!albumId) return;

        if (albumId === 'public') {
            const publicUnseenSet = unseenPhotos.get('public');
            const mockBubbles: BubbleData[] = mockPhotos.map(photo => ({
                id: photo.id,
                albumId: photo.albumId,
                uri: photo.uri,
                user: photo.user,
                mood_id: photo.mood,
                mood_name_snapshot: photo.mood,
                time: photo.time,
                created_at: photo.created_at,
                isSeen: publicUnseenSet ? !publicUnseenSet.has(photo.id) : true,
                isMock: photo.isMock,
                isIntro: photo.isIntro
            }));
            setBubbles(mockBubbles);
            return;
        }

        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);

        try {
            const { data, error } = await supabase
                .from('album_entries')
                .select(`
                    id,
                    created_at,
                    entry_id,
                    entries!inner (
                        id,
                        photo_path,
                        mood,
                        note,
                        created_at,
                        user_id
                    )
                `)
                .eq('album_id', albumId)
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (data && data.length > 0) {
                const todayEntries = data.filter((item: any) => {
                    const entryDate = new Date(item.entries.created_at);
                    entryDate.setUTCHours(0, 0, 0, 0);
                    return entryDate.getTime() >= today.getTime();
                });

                const hiddenUserIds = albumId ? (hiddenMembers[albumId] || []) : [];
                const nonHiddenEntries = todayEntries.filter((item: any) => !hiddenUserIds.includes(item.entries.user_id));
                const entriesToShow = nonHiddenEntries.length > 0 ? nonHiddenEntries :
                    data.filter((item: any) => !hiddenUserIds.includes(item.entries.user_id)).slice(0, 10);

                const userIds = [...new Set(entriesToShow.map((item: any) => item.entries.user_id))];
                const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', userIds);
                const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

                console.log('[SharedCanvas] Entries before photo filter:', {
                    totalEntries: entriesToShow.length,
                    samplePaths: entriesToShow.slice(0, 3).map((item: any) => ({
                        entryId: item.entries.id,
                        photoPath: item.entries.photo_path,
                        hasSlash: item.entries.photo_path?.includes('/')
                    }))
                });

                // Only show entries with cloud-stored photos (shareable across devices)
                // Photos stored in cloud have format: "user_id/filename.jpg" (contains '/')
                // Local-only photos have just the filename without '/'
                const entriesWithValidPhotos = entriesToShow.filter((item: any) => {
                    const photoPath = item.entries.photo_path;
                    const isValid = photoPath && typeof photoPath === 'string' && photoPath.includes('/');
                    if (!isValid && photoPath) {
                        console.warn('[SharedCanvas] Entry excluded - invalid photo_path (missing "/"):', {
                            entryId: item.entries.id,
                            photoPath: photoPath,
                            userId: item.entries.user_id
                        });
                    }
                    return isValid;
                });

                console.log('[SharedCanvas] Photo path filtering results:', {
                    beforeFilter: entriesToShow.length,
                    afterFilter: entriesWithValidPhotos.length,
                    filteredOut: entriesToShow.length - entriesWithValidPhotos.length,
                    invalidPaths: entriesToShow
                        .filter((item: any) => !item.entries.photo_path?.includes('/'))
                        .map((item: any) => ({
                            entryId: item.entries.id,
                            photoPath: item.entries.photo_path
                        }))
                });

                const mappedBubbles: BubbleData[] = entriesWithValidPhotos.map((item: any) => {
                    const entry = item.entries;
                    const publicUrl = supabase.storage.from('entries').getPublicUrl(entry.photo_path).data.publicUrl;
                    return {
                        id: item.id,
                        albumId: albumId,
                        uri: publicUrl,
                        user: profileMap.get(entry.user_id) || 'Unknown',
                        mood_id: entry.mood || 'neutral',
                        mood_name_snapshot: entry.mood || 'Neutral', // For now use mood as snapshot if not present
                        time: formatDistanceToNow(new Date(entry.created_at), { addSuffix: true }),
                        created_at: entry.created_at,
                        isSeen: true
                    };
                });
                setBubbles(mappedBubbles);
            } else {
                setBubbles([]);
            }
        } catch (error) {
            console.error('Error fetching album entries:', error);
        }
    }, [albumId, mockPhotos, unseenPhotos, hiddenMembers]);

    useEffect(() => {
        fetchEntries();
        if (albumId !== 'public') {
            const interval = setInterval(fetchEntries, 10000);
            return () => clearInterval(interval);
        }
    }, [fetchEntries, albumId]);

    const handleBubblePress = (item: BubbleData) => {
        if (item.albumId && item.isSeen === false) {
            markPhotoAsSeen(item.albumId, item.id);
            setBubbles(prev => prev.map(b => b.id === item.id ? { ...b, isSeen: true } : b));
            setSelectedBubble({ ...item, isSeen: true });
        } else {
            setSelectedBubble(item);
        }
    };

    const moodDisplay = selectedBubble ? getMoodDisplay(selectedBubble.mood_id, selectedBubble.mood_name_snapshot) : null;

    return (
        <View style={styles.container}>
            {bubbles.map((bubble, index) => (
                <FloatingBubble key={bubble.id} item={bubble} index={index} onPress={handleBubblePress} isGenerating={isGenerating} />
            ))}
            {thoughtClouds
                .filter(post => {
                    const hiddenUserIds = albumId ? (hiddenMembers[albumId] || []) : [];
                    return !hiddenUserIds.includes(post.author_id);
                })
                .map((post, index) => (
                    <CloudArtifact key={post.id} avatarUrl={post.author.avatar_url} index={index} onPress={() => setSelectedThoughtCloud(post)} isGenerating={isGenerating} />
                ))}

            <Modal animationType="fade" transparent={true} visible={!!selectedBubble} onRequestClose={() => setSelectedBubble(null)}>
                <BlurView intensity={40} tint="dark" style={styles.modalContainer}>
                    <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSelectedBubble(null)}>
                        {selectedBubble && (
                            <View style={styles.modalContent}>
                                <View style={styles.modalImageContainer}>
                                    <Image source={{ uri: selectedBubble.uri }} style={styles.modalImage} contentFit="cover" />
                                </View>
                                {selectedBubble.isIntro ? (
                                    <View style={styles.introCopyContainer}>
                                        <ThemedText type="subtitle" style={styles.introTitle}>Welcome to Albums</ThemedText>
                                        <ThemedText style={styles.introCopy}>
                                            Albums are a shared space for photos and moods between you and your added friends.{"\n\n"}
                                            Journal entries stay private and never appear in albums.{"\n\n"}
                                            The Public album shows moments your added friends choose to share.{"\n\n"}
                                            You can also create private albums, invite specific people, and build shared insights around the moments you collect together.{"\n\n"}
                                            Your day, shared only where you want it.
                                        </ThemedText>
                                    </View>
                                ) : (
                                    <View style={styles.modalDetails}>
                                        <ThemedText type="subtitle" style={styles.userName}>{selectedBubble.user}</ThemedText>
                                        {moodDisplay && (
                                            <View style={[styles.moodPill, { borderLeftColor: moodDisplay.color, borderLeftWidth: 3 }]}>
                                                <ThemedText style={styles.moodText}>{moodDisplay.name}</ThemedText>
                                            </View>
                                        )}
                                        <ThemedText style={styles.timeText}>{selectedBubble.time}</ThemedText>
                                    </View>
                                )}
                            </View>
                        )}
                    </TouchableOpacity>
                </BlurView>
            </Modal>

            <InsightModal
                visible={!!selectedThoughtCloud}
                onClose={() => setSelectedThoughtCloud(null)}
                insightText={selectedThoughtCloud?.insight_text}
                authorName={selectedThoughtCloud?.author.full_name || 'Someone'}
                authorAvatarUrl={selectedThoughtCloud?.author.avatar_url}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        width: '100%',
        height: '100%',
    },
    bubbleContainer: {
        position: 'absolute',
        left: width / 2 - 40,
        top: height / 2 - 40,
        zIndex: 10,
    },
    bubble: {
        width: 80,
        height: 80,
        borderRadius: 40,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.2)',
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 4,
        },
        shadowOpacity: 0.30,
        shadowRadius: 4.65,
        elevation: 8,
    },
    bubbleUnseen: {
        borderColor: 'rgba(100, 255, 100, 0.8)',
        borderWidth: 3,
        shadowColor: '#00ff00',
        shadowOffset: {
            width: 0,
            height: 0,
        },
        shadowOpacity: 0.6,
        shadowRadius: 15,
        elevation: 12,
    },
    image: {
        width: '100%',
        height: '100%',
    },
    modalContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalOverlay: {
        flex: 1,
        width: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        alignItems: 'center',
        gap: 20,
    },
    modalImageContainer: {
        width: width * 0.8,
        height: width * 0.8,
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 10,
        },
        shadowOpacity: 0.5,
        shadowRadius: 10,
        elevation: 20,
    },
    modalImage: {
        width: '100%',
        height: '100%',
    },
    modalDetails: {
        alignItems: 'center',
        gap: 8,
    },
    userName: {
        fontSize: 24,
        fontWeight: '600',
        color: 'white',
        textShadowColor: 'rgba(0, 0, 0, 0.5)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 4,
    },
    moodPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.1)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        gap: 6,
    },
    moodText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.9)',
    },
    timeText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.5)',
    },
    introOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    introText: {
        color: 'white',
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    introCopyContainer: {
        width: width * 0.85,
        backgroundColor: '#000000',
        borderRadius: 20,
        padding: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        gap: 16,
    },
    introTitle: {
        fontSize: 22,
        textAlign: 'center',
        color: 'white',
    },
    introCopy: {
        fontSize: 15,
        lineHeight: 22,
        color: 'rgba(255,255,255,0.8)',
        textAlign: 'center',
    },
});

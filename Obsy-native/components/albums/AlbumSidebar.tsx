import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Dimensions, Share, ScrollView } from 'react-native';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    interpolate,
    Extrapolate
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { ThemedText } from '@/components/ui/ThemedText';
import { useMockAlbums } from '@/contexts/MockAlbumContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { CreateAlbumModal } from './CreateAlbumModal';
import { Album as AlbumType, AlbumType as AlbumTypeEnum } from '@/types/albums';
import { useAlbumRename } from '@/lib/useAlbumRename';

const { width, height } = Dimensions.get('window');
const SIDEBAR_WIDTH = 220;
const COLLAPSED_WIDTH = 60;

// Re-export Album type for backward compatibility
export interface Album {
    id: string;
    name: string;
    icon?: string;
    type?: AlbumTypeEnum;
}

// Public album constant
const PUBLIC_ALBUM: Album = {
    id: 'public',
    name: 'Public',
    type: 'public',
    icon: 'globe-outline'
};

interface AlbumSidebarProps {
    onSelectAlbum?: (album: Album) => void;
    /** The currently selected album ID. Defaults to 'public' if not provided. */
    selectedAlbumId?: string;
}

export function AlbumSidebar({ onSelectAlbum, selectedAlbumId: selectedAlbumIdProp }: AlbumSidebarProps) {
    const router = useRouter();
    const isOpen = useSharedValue(0); // 0 = collapsed, 1 = expanded
    const { hasUnseenPhotos, getUnseenPhotoCount } = useMockAlbums();
    const { user } = useAuth();
    // User ID is used for invite links instead of friend codes
    const [createModalVisible, setCreateModalVisible] = useState(false);
    const [albums, setAlbums] = useState<Album[]>([]);
    // Use prop if provided, otherwise default to 'public'
    const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(selectedAlbumIdProp ?? 'public');

    const { getDisplayName } = useAlbumRename();

    // Sync internal state with prop when it changes
    useEffect(() => {
        if (selectedAlbumIdProp !== undefined) {
            setSelectedAlbumId(selectedAlbumIdProp);
        }
    }, [selectedAlbumIdProp]);

    const fetchAlbums = useCallback(async () => {
        if (!user) return;
        try {
            const { data, error } = await supabase
                .from('albums')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Map fetched albums to include type: 'shared'
            const sharedAlbums: Album[] = (data || []).map((album: any) => ({
                ...album,
                type: 'shared' as AlbumTypeEnum
            }));

            setAlbums(sharedAlbums);
        } catch (error) {
            console.error('Error fetching albums:', error);
        }
    }, [user]);

    useEffect(() => {
        if (user) {
            fetchAlbums();
        }
    }, [user, fetchAlbums]);

    // Check if any album (including Public) has unseen photos
    const hasUnseen = getUnseenPhotoCount() > 0;

    const toggleSidebar = () => {
        isOpen.value = withSpring(isOpen.value === 0 ? 1 : 0, {
            damping: 15,
            stiffness: 120,
        });
    };

    const containerStyle = useAnimatedStyle(() => {
        const currentWidth = interpolate(
            isOpen.value,
            [0, 1],
            [COLLAPSED_WIDTH, SIDEBAR_WIDTH],
            Extrapolate.CLAMP
        );

        return {
            width: currentWidth,
        };
    });

    const contentStyle = useAnimatedStyle(() => {
        return {
            opacity: interpolate(isOpen.value, [0, 0.5, 1], [0, 0, 1]),
            transform: [
                {
                    translateX: interpolate(isOpen.value, [0, 1], [-20, 0]),
                },
            ],
        };
    });

    const iconStyle = useAnimatedStyle(() => {
        return {
            opacity: interpolate(isOpen.value, [0, 0.5], [1, 0]),
            transform: [
                {
                    scale: interpolate(isOpen.value, [0, 1], [1, 0.8]),
                },
            ],
        };
    });

    const handleAlbumCreated = async (albumId?: string) => {
        await fetchAlbums();
        if (albumId) {
            // If we have a callback, we could try to find and select it, 
            // but for now we just refresh the list.
            // If we wanted to navigate, we'd need the full album object.
            // Let's just let the user click it for now to keep it simple.
        }
    };

    // Helper to handle album selection
    const handleAlbumSelect = (album: Album) => {
        setSelectedAlbumId(album.id);
        if (onSelectAlbum) {
            onSelectAlbum(album);
        } else {
            router.push(`/albums/${album.id}`);
        }
    };

    return (
        <>
            <Animated.View style={[
                styles.container,
                containerStyle
            ]}>
                <BlurView intensity={30} tint="dark" style={styles.blurContainer}>
                    <TouchableOpacity
                        style={styles.touchableArea}
                        onPress={() => {
                            if (isOpen.value === 1) toggleSidebar();
                            else toggleSidebar();
                        }}
                        activeOpacity={1}
                    >
                        {/* Collapsed State Icon */}
                        <Animated.View style={[styles.collapsedIcon, iconStyle]}>
                            <Ionicons name="albums-outline" size={24} color={Colors.obsy.silver} />
                            {hasUnseen && <View style={styles.indicator} />}
                        </Animated.View>

                        {/* Expanded Content */}
                        <Animated.View style={[styles.expandedContent, contentStyle]}>
                            <View style={styles.header}>
                                <ThemedText type="subtitle" style={styles.headerText}>Albums</ThemedText>
                                <TouchableOpacity onPress={toggleSidebar}>
                                    <Ionicons name="chevron-back" size={24} color={Colors.obsy.silver} />
                                </TouchableOpacity>
                            </View>

                            <ScrollView style={styles.albumList} showsVerticalScrollIndicator={false}>
                                {/* ALBUMS SECTION */}
                                <View style={styles.sectionHeaderRow}>
                                    <ThemedText style={styles.sectionHeader}>ALBUMS</ThemedText>
                                    <TouchableOpacity onPress={() => router.push('/albums/manage')}>
                                        <ThemedText style={styles.manageLink}>Manage</ThemedText>
                                    </TouchableOpacity>
                                </View>

                                {/* Public Album - Always first, pinned */}
                                <TouchableOpacity
                                    key={PUBLIC_ALBUM.id}
                                    style={[
                                        styles.albumItem,
                                        styles.publicAlbumItem,
                                        hasUnseenPhotos(PUBLIC_ALBUM.id) && selectedAlbumId === PUBLIC_ALBUM.id && styles.albumItemUnseen
                                    ]}
                                    activeOpacity={0.7}
                                    onPress={(e) => {
                                        e.stopPropagation();
                                        handleAlbumSelect(PUBLIC_ALBUM);
                                    }}
                                >
                                    <View style={[styles.albumIcon, styles.publicAlbumIcon]}>
                                        <Ionicons name="globe-outline" size={20} color="white" />
                                    </View>
                                    <ThemedText style={styles.albumName} numberOfLines={1}>
                                        {getDisplayName(PUBLIC_ALBUM.id, PUBLIC_ALBUM.name)}
                                    </ThemedText>
                                    {hasUnseenPhotos(PUBLIC_ALBUM.id) && <View style={styles.unseenDot} />}
                                </TouchableOpacity>

                                {/* User Albums */}
                                {albums.map((album) => (
                                    <TouchableOpacity
                                        key={album.id}
                                        style={[
                                            styles.albumItem,
                                            hasUnseenPhotos(album.id) && selectedAlbumId === album.id && styles.albumItemUnseen
                                        ]}
                                        activeOpacity={0.7}
                                        onPress={(e) => {
                                            e.stopPropagation();
                                            handleAlbumSelect(album);
                                        }}
                                    >
                                        <View style={styles.albumIcon}>
                                            <Ionicons name="images-outline" size={20} color="white" />
                                        </View>
                                        <ThemedText style={styles.albumName} numberOfLines={1}>
                                            {getDisplayName(album.id, album.name)}
                                        </ThemedText>
                                        {hasUnseenPhotos(album.id) && <View style={styles.unseenDot} />}
                                    </TouchableOpacity>
                                ))}
                                <TouchableOpacity
                                    style={styles.createButton}
                                    onPress={(e) => {
                                        e.stopPropagation();
                                        setCreateModalVisible(true);
                                    }}
                                >
                                    <Ionicons name="add" size={20} color={Colors.obsy.silver} />
                                    <ThemedText style={styles.createButtonText}>Create Album</ThemedText>
                                </TouchableOpacity>

                                <View style={styles.divider} />

                                {/* FRIENDS SECTION */}
                                <ThemedText style={styles.sectionHeader}>FRIENDS</ThemedText>



                                {/* Manage Friends Item */}
                                <TouchableOpacity
                                    style={styles.albumItem}
                                    onPress={(e) => {
                                        e.stopPropagation();
                                        router.push('/albums/friends');
                                    }}
                                >
                                    <View style={[styles.albumIcon, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
                                        <Ionicons name="settings-outline" size={20} color="white" />
                                    </View>
                                    <ThemedText style={styles.albumName}>Manage Friends</ThemedText>
                                </TouchableOpacity>

                                {/* Invite Item */}
                                <TouchableOpacity
                                    style={styles.albumItem}
                                    onPress={async (e) => {
                                        e.stopPropagation();
                                        if (!user) return;
                                        const link = Linking.createURL('invite', { queryParams: { userId: user.id } });
                                        const message = `Join me on Obsy! Click here to connect: ${link}`;
                                        await Share.share({ message });
                                    }}
                                >
                                    <View style={[styles.albumIcon, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
                                        <Ionicons name="share-outline" size={20} color="white" />
                                    </View>
                                    <ThemedText style={styles.albumName}>Invite via Message</ThemedText>
                                </TouchableOpacity>
                            </ScrollView>

                            <View style={styles.footer}>
                                <TouchableOpacity
                                    style={styles.settingsButton}
                                    onPress={(e) => {
                                        e.stopPropagation();
                                        router.push('/(tabs)/profile');
                                    }}
                                >
                                    <Ionicons name="settings-outline" size={20} color={Colors.obsy.silver} />
                                    <ThemedText style={styles.settingsText}>Settings</ThemedText>
                                </TouchableOpacity>
                            </View>
                        </Animated.View>
                    </TouchableOpacity>
                </BlurView>
            </Animated.View>

            <CreateAlbumModal
                visible={createModalVisible}
                onClose={() => setCreateModalVisible(false)}
                onCreated={handleAlbumCreated}
            />
        </>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        left: 0,
        top: 100,
        bottom: 100,
        borderTopRightRadius: 20,
        borderBottomRightRadius: 20,
        overflow: 'hidden',
        zIndex: 100,
        borderWidth: 1,
        borderLeftWidth: 0,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    blurContainer: {
        flex: 1,
    },
    touchableArea: {
        flex: 1,
        padding: 20,
    },
    collapsedIcon: {
        position: 'absolute',
        top: 20,
        left: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    indicator: {
        position: 'absolute',
        top: -2,
        right: -2,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#4ade80', // Green-400
    },
    expandedContent: {
        flex: 1,
        width: '100%',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 30,
    },
    headerText: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 20,
        fontWeight: '600',
        color: 'white',
    },
    albumList: {
        flex: 1,
    },
    albumItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        paddingHorizontal: 10,
        marginBottom: 4,
        borderRadius: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.02)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.04)',
    },
    albumItemUnseen: {
        borderColor: 'rgba(100, 255, 100, 0.5)',
        borderWidth: 1,
        shadowColor: '#00ff00',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 5,
    },
    publicAlbumItem: {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    albumIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    publicAlbumIcon: {
        backgroundColor: 'rgba(100, 200, 255, 0.2)',
    },
    albumName: {
        fontFamily: 'Inter_400Regular',
        fontSize: 16,
        color: 'rgba(255,255,255,0.9)',
        flex: 1,
    },
    footer: {
        marginTop: 10,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.1)',
        paddingTop: 20,
    },
    settingsButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    settingsText: {
        color: Colors.obsy.silver,
        fontSize: 14,
    },
    unseenDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#4ade80', // Green-400
        marginLeft: 'auto',
    },
    sectionHeader: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 10,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.35)',
        marginTop: 10,
        marginBottom: 5,
        letterSpacing: 1.2,
    },
    createButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 8,
        opacity: 0.8,
        marginBottom: 10,
    },
    createButtonText: {
        fontSize: 14,
        color: Colors.obsy.silver,
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
        marginVertical: 10,
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 10,
        marginBottom: 5,
        paddingRight: 4,
    },
    manageLink: {
        fontSize: 12,
        color: Colors.obsy.silver,
        fontWeight: '600',
    },
});

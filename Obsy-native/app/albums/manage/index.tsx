import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, FlatList, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ThemedText } from '@/components/ui/ThemedText';
import { GlassCard } from '@/components/ui/GlassCard';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { deleteAlbum } from '@/services/albums';
import { useAuth } from '@/contexts/AuthContext';
import { useAlbumRename } from '@/lib/useAlbumRename';
import { removeAlbumMember } from '@/services/albumMembers';

interface Album {
    id: string;
    name: string;
    created_by: string;
}

export default function ManageAlbumsScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const [albums, setAlbums] = useState<Album[]>([]);
    const [loading, setLoading] = useState(true);

    const { getDisplayName } = useAlbumRename();

    useEffect(() => {
        loadAlbums();
    }, [user]);

    const loadAlbums = async () => {
        if (!user) return;
        setLoading(true);
        try {
            // Fetch albums where user is a member
            const { data: memberData, error: memberError } = await supabase
                .from('album_members')
                .select('album_id')
                .eq('user_id', user.id);

            if (memberError) throw memberError;

            const albumIds = memberData.map(m => m.album_id);

            if (albumIds.length > 0) {
                const { data, error } = await supabase
                    .from('albums')
                    .select('id, name, created_by')
                    .in('id', albumIds)
                    .order('created_at', { ascending: false });

                if (error) throw error;
                setAlbums(data || []);
            } else {
                setAlbums([]);
            }
        } catch (error) {
            console.error('Error loading albums:', error);
            setAlbums([]);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteAlbum = (albumId: string, name: string, creatorId: string) => {
        const isCreator = user?.id === creatorId;
        const actionLabel = isCreator ? 'Delete' : 'Leave';
        const message = isCreator
            ? `Are you sure you want to delete "${name}"? This action cannot be undone and will remove all insights associated with it.`
            : `Are you sure you want to leave "${name}"? You'll lose access to shared photos.`;

        Alert.alert(
            `${actionLabel} Album`,
            message,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: actionLabel,
                    style: "destructive",
                    onPress: async () => {
                        try {
                            if (isCreator) {
                                const result = await deleteAlbum(albumId);
                                if (!result.success) throw new Error(result.message);
                            } else {
                                if (!user) return;
                                const result = await removeAlbumMember(albumId, user.id);
                                if (!result.success) throw new Error(result.message);
                            }
                            loadAlbums();
                        } catch (error: any) {
                            Alert.alert("Error", error.message || `Failed to ${actionLabel.toLowerCase()} album.`);
                        }
                    }
                }
            ]
        );
    };

    const renderAlbumItem = ({ item }: { item: Album }) => {
        const isCreator = user?.id === item.created_by;
        const displayName = getDisplayName(item.id, item.name);

        return (
            <GlassCard variant="simple" style={styles.albumCard}>
                <View style={styles.albumContent}>
                    <View style={styles.iconContainer}>
                        <Ionicons name={isCreator ? "images-outline" : "people-outline"} size={20} color="#fff" />
                    </View>
                    <View style={styles.albumInfo}>
                        <ThemedText style={styles.albumName}>{displayName}</ThemedText>
                        {!isCreator && <ThemedText style={styles.guestBadge}>Guest Member</ThemedText>}
                    </View>
                    <TouchableOpacity
                        onPress={() => handleDeleteAlbum(item.id, item.name, item.created_by)}
                        style={styles.deleteButton}
                    >
                        <Ionicons
                            name={isCreator ? "trash-outline" : "exit-outline"}
                            size={20}
                            color={isCreator ? "#EF4444" : Colors.obsy.silver}
                        />
                    </TouchableOpacity>
                </View>
            </GlassCard>
        );
    };

    return (
        <ScreenWrapper hideFloatingBackground edges={['top']}>
            {/* Header - No background, renders on page background */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="chevron-back" size={28} color={Colors.obsy.silver} />
                </TouchableOpacity>
                <ThemedText type="title" style={styles.headerTitle}>Manage Albums</ThemedText>
                <View style={{ width: 44 }} />
            </View>

            <View style={styles.content}>
                <ThemedText style={styles.listHeader}>YOUR ALBUMS ({albums.length})</ThemedText>
                <ThemedText style={styles.subtitle}>You can only delete albums you created.</ThemedText>

                {loading ? (
                    <ActivityIndicator size="large" color={Colors.obsy.silver} style={{ marginTop: 20 }} />
                ) : (
                    <FlatList
                        data={albums}
                        renderItem={renderAlbumItem}
                        keyExtractor={item => item.id}
                        contentContainerStyle={styles.listContent}
                        ListEmptyComponent={
                            <View style={styles.emptyState}>
                                <ThemedText style={styles.emptyText}>No albums found.</ThemedText>
                            </View>
                        }
                    />
                )}
            </View>
        </ScreenWrapper>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 8,
        paddingTop: 12,
        paddingBottom: 20,
    },
    backButton: {
        padding: 8,
    },
    headerTitle: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 22,
        color: 'white',
    },
    content: {
        flex: 1,
        paddingHorizontal: 20,
    },
    listHeader: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 10,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.3)',
        marginBottom: 4,
        letterSpacing: 1.2,
    },
    subtitle: {
        fontFamily: 'Inter_400Regular',
        fontSize: 12,
        color: 'rgba(255,255,255,0.25)',
        marginBottom: 24,
    },
    listContent: {
        gap: 8,
        paddingBottom: 40,
    },
    albumCard: {
        padding: 4, // Inner GlassCard padding is 16 by default, so we reduce this
    },
    albumContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    albumInfo: {
        flex: 1,
    },
    iconContainer: {
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.05)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    albumName: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
    guestBadge: {
        fontFamily: 'Inter_400Regular',
        fontSize: 11,
        color: 'rgba(255,255,255,0.3)',
        marginTop: 1,
    },
    deleteButton: {
        padding: 8,
    },
    emptyState: {
        alignItems: 'center',
        padding: 40,
    },
    emptyText: {
        fontFamily: 'Inter_400Regular',
        fontSize: 16,
        color: 'rgba(255,255,255,0.4)',
    },
});

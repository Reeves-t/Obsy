import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, FlatList, Alert, ActivityIndicator, Share } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ThemedText } from '@/components/ui/ThemedText';
import { GlassCard } from '@/components/ui/GlassCard';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { Image } from 'expo-image';
import { fetchFriends, removeFriend, Friend } from '@/services/friends';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

export default function ManageFriendsScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const [friends, setFriends] = useState<Friend[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadFriends();
    }, [user]);

    const loadFriends = async () => {
        if (!user) return;
        setLoading(true);
        const data = await fetchFriends();
        setFriends(data);
        setLoading(false);
    };

    const handleSendRequest = async () => {
        if (!user) {
            Alert.alert("Sign In Required", "Please sign in to send friend requests.");
            return;
        }

        const link = Linking.createURL('invite', { queryParams: { userId: user.id } });
        const message = `Hey! Add me on Obsy so we can share moments together. Click here to connect: ${link}`;

        await Share.share({ message });
    };

    const handleRemoveFriend = (friendId: string, name: string) => {
        Alert.alert(
            "Remove Friend",
            `Are you sure you want to remove ${name}?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Remove",
                    style: "destructive",
                    onPress: async () => {
                        const success = await removeFriend(friendId);
                        if (success) {
                            loadFriends();
                        } else {
                            Alert.alert("Error", "Failed to remove friend.");
                        }
                    }
                }
            ]
        );
    };

    const getAvatarUrl = (avatarPath: string | null): string | null => {
        if (!avatarPath) return null;
        if (avatarPath.startsWith('http')) return avatarPath;
        const { data } = supabase.storage.from('avatars').getPublicUrl(avatarPath);
        return data.publicUrl;
    };

    const renderFriendItem = ({ item }: { item: Friend }) => {
        const avatarUrl = getAvatarUrl(item.avatar_url || null);

        return (
            <GlassCard variant="default" style={styles.friendCard}>
                <View style={styles.friendContent}>
                    <View style={styles.avatarContainer}>
                        {avatarUrl ? (
                            <Image source={{ uri: avatarUrl }} style={styles.avatar} contentFit="cover" />
                        ) : (
                            <View style={styles.avatarPlaceholder}>
                                <ThemedText style={styles.avatarText}>
                                    {(item.full_name || 'User').charAt(0).toUpperCase()}
                                </ThemedText>
                            </View>
                        )}
                    </View>
                    <View style={styles.friendInfo}>
                        <ThemedText style={styles.friendName}>{item.full_name || 'Unknown User'}</ThemedText>
                    </View>
                    <TouchableOpacity
                        onPress={() => handleRemoveFriend(item.id, item.full_name || 'User')}
                        style={styles.removeButton}
                    >
                        <Ionicons name="trash-outline" size={20} color="#EF4444" />
                    </TouchableOpacity>
                </View>
            </GlassCard>
        );
    };

    return (
        <ScreenWrapper hideFloatingBackground>
            {/* Header - Transparent background */}
            <View style={styles.header}>
                <View style={styles.headerContent}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <Ionicons name="chevron-back" size={24} color={Colors.obsy.silver} />
                    </TouchableOpacity>
                    <ThemedText type="title" style={styles.headerTitle}>Manage Friends</ThemedText>
                    <View style={{ width: 24 }} />
                </View>
            </View>

            <View style={styles.content}>
                {/* Send Friend Request Button */}
                <TouchableOpacity style={styles.sendRequestButton} onPress={handleSendRequest}>
                    <Ionicons name="paper-plane-outline" size={20} color="#000" />
                    <ThemedText style={styles.sendRequestText}>Send Friend Request</ThemedText>
                </TouchableOpacity>

                {/* Friends List */}
                <ThemedText style={styles.listHeader}>YOUR FRIENDS ({friends.length})</ThemedText>

                {loading ? (
                    <ActivityIndicator size="large" color={Colors.obsy.silver} style={{ marginTop: 20 }} />
                ) : (
                    <FlatList
                        data={friends}
                        renderItem={renderFriendItem}
                        keyExtractor={item => item.id}
                        contentContainerStyle={styles.listContent}
                        ListEmptyComponent={
                            <View style={styles.emptyState}>
                                <Ionicons name="people-outline" size={48} color="rgba(255,255,255,0.2)" />
                                <ThemedText style={styles.emptyText}>No friends yet.</ThemedText>
                                <ThemedText style={styles.emptySubtext}>Send a friend request to connect!</ThemedText>
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
        paddingTop: 60,
        paddingBottom: 16,
        // No background - transparent header
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 20,
        color: '#fff',
    },
    content: {
        flex: 1,
        padding: 20,
    },
    sendRequestButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: Colors.obsy.silver,
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: 25,
        marginBottom: 24,
        gap: 10,
    },
    sendRequestText: {
        color: '#000',
        fontSize: 16,
        fontWeight: '700',
    },
    listHeader: {
        fontSize: 12,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.4)',
        marginBottom: 12,
        letterSpacing: 1,
    },
    listContent: {
        gap: 12,
        paddingBottom: 40,
    },
    friendCard: {
        padding: 12,
    },
    friendContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    avatarContainer: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
    },
    avatar: {
        width: '100%',
        height: '100%',
    },
    avatarPlaceholder: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: Colors.obsy.silver,
    },
    avatarText: {
        fontSize: 18,
        fontWeight: '600',
        color: '#000',
    },
    friendInfo: {
        flex: 1,
    },
    friendName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
    removeButton: {
        padding: 8,
    },
    emptyState: {
        alignItems: 'center',
        padding: 40,
        gap: 12,
    },
    emptyText: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.5)',
    },
    emptySubtext: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.3)',
    },
});

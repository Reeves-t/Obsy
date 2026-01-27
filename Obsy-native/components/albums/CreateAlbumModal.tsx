import React, { useState, useEffect } from 'react';
import { Modal, View, StyleSheet, TouchableOpacity, TextInput, FlatList, ActivityIndicator, Alert } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import Colors from '@/constants/Colors';
import { ThemedText } from '@/components/ui/ThemedText';
import { GlassCard } from '@/components/ui/GlassCard';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface Friend {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
}

interface CreateAlbumModalProps {
    visible: boolean;
    onClose: () => void;
    onCreated: (albumId?: string) => void;
}

export function CreateAlbumModal({ visible, onClose, onCreated }: CreateAlbumModalProps) {
    const { user } = useAuth();
    const [name, setName] = useState('');
    const [friends, setFriends] = useState<Friend[]>([]);
    const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        if (visible && user) {
            loadFriends();
        }
    }, [visible, user]);

    const loadFriends = async () => {
        setLoading(true);
        try {
            const { data: relationships, error: relError } = await supabase
                .from('relationships')
                .select('following_id')
                .eq('follower_id', user?.id);

            if (relError) throw relError;

            const followingIds = relationships.map((r: any) => r.following_id);

            if (followingIds.length > 0) {
                const { data: profiles, error: profError } = await supabase
                    .from('profiles')
                    .select('id, full_name, avatar_url')
                    .in('id', followingIds);

                if (profError) throw profError;
                setFriends(profiles || []);
            } else {
                setFriends([]);
            }
        } catch (error) {
            console.error('Error loading friends:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!name.trim()) {
            Alert.alert('Error', 'Please enter an album name');
            return;
        }
        if (!user) return;

        setCreating(true);
        let albumId: string | null = null;

        try {
            // 1. Create Album
            const { data: album, error: albumError } = await supabase
                .from('albums')
                .insert({
                    name: name.trim(),
                    created_by: user.id
                })
                .select()
                .single();

            if (albumError) {
                console.error('Error creating album:', albumError);
                Alert.alert('Error', 'Failed to create album. Please try again.');
                return;
            }

            albumId = album.id;

            // 2. Add Members (Creator + Selected Friends)
            const members = [
                { album_id: album.id, user_id: user.id },
                ...selectedFriends.map(friendId => ({
                    album_id: album.id,
                    user_id: friendId
                }))
            ];

            const { error: membersError } = await supabase
                .from('album_members')
                .insert(members);

            if (membersError) {
                console.error('Error adding members to album:', membersError);

                // Retry adding just the creator as a member
                const { error: retryError } = await supabase
                    .from('album_members')
                    .insert({ album_id: album.id, user_id: user.id });

                if (retryError) {
                    console.error('Retry failed for adding creator as member:', retryError);
                    // Album was created but member addition failed
                    // Show warning but still consider album created
                    Alert.alert(
                        'Partial Success',
                        'Album was created but there was an issue adding members. You can try adding members later.',
                        [{
                            text: 'OK', onPress: () => {
                                onCreated(album.id);
                                onClose();
                                setName('');
                                setSelectedFriends([]);
                            }
                        }]
                    );
                    return;
                }

                // Creator was added, but some friends might not have been added
                if (selectedFriends.length > 0) {
                    Alert.alert(
                        'Partial Success',
                        'Album was created but some friends could not be added. You can try inviting them later.',
                        [{ text: 'OK' }]
                    );
                }
            }

            // 3. Verify the creator was added as a member
            const { data: memberCheck, error: checkError } = await supabase
                .from('album_members')
                .select('id')
                .eq('album_id', album.id)
                .eq('user_id', user.id)
                .single();

            if (checkError || !memberCheck) {
                console.warn('Creator membership verification failed, but proceeding:', checkError);
            }

            // Success - call onCreated and close modal
            onCreated(album.id);
            onClose();
            setName('');
            setSelectedFriends([]);
        } catch (error) {
            console.error('Unexpected error creating album:', error);
            Alert.alert('Error', 'An unexpected error occurred. Please try again.');
        } finally {
            setCreating(false);
        }
    };

    const toggleFriend = (id: string) => {
        setSelectedFriends(prev =>
            prev.includes(id) ? prev.filter(fid => fid !== id) : [...prev, id]
        );
    };

    const getAvatarUrl = (path: string | null) => {
        if (!path) return null;
        if (path.startsWith('http')) return path;
        const { data } = supabase.storage.from('avatars').getPublicUrl(path);
        return data.publicUrl;
    };

    return (
        <Modal
            animationType="fade"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <BlurView intensity={20} tint="dark" style={styles.container}>
                <GlassCard style={styles.modal} intensity={40} variant="simple">
                    <View style={styles.header}>
                        <ThemedText type="subtitle" style={styles.headerTitle}>Create Album</ThemedText>
                        <TouchableOpacity onPress={onClose}>
                            <Ionicons name="close" size={24} color={Colors.obsy.silver} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.inputContainer}>
                        <ThemedText style={styles.label}>Album Name</ThemedText>
                        <TextInput
                            style={styles.input}
                            value={name}
                            onChangeText={setName}
                            placeholder="e.g. Road Trip"
                            placeholderTextColor="rgba(255,255,255,0.3)"
                        />
                    </View>

                    <View style={styles.friendsContainer}>
                        <ThemedText style={styles.label}>Add Friends</ThemedText>
                        {loading ? (
                            <ActivityIndicator color={Colors.obsy.silver} />
                        ) : (
                            <FlatList
                                data={friends}
                                keyExtractor={item => item.id}
                                renderItem={({ item }) => {
                                    const isSelected = selectedFriends.includes(item.id);
                                    const avatarUrl = getAvatarUrl(item.avatar_url);
                                    return (
                                        <TouchableOpacity
                                            style={[styles.friendItem, isSelected && styles.friendItemSelected]}
                                            onPress={() => toggleFriend(item.id)}
                                        >
                                            {avatarUrl ? (
                                                <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                                            ) : (
                                                <View style={styles.avatarPlaceholder}>
                                                    <ThemedText style={styles.avatarText}>
                                                        {(item.full_name || '?').charAt(0)}
                                                    </ThemedText>
                                                </View>
                                            )}
                                            <ThemedText style={styles.friendName} numberOfLines={1}>
                                                {item.full_name || 'Unknown'}
                                            </ThemedText>
                                            {isSelected && (
                                                <View style={styles.checkmark}>
                                                    <Ionicons name="checkmark" size={12} color="black" />
                                                </View>
                                            )}
                                        </TouchableOpacity>
                                    );
                                }}
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.friendsList}
                            />
                        )}
                    </View>

                    <TouchableOpacity
                        style={styles.createButton}
                        onPress={handleCreate}
                        disabled={creating}
                    >
                        {creating ? (
                            <ActivityIndicator color="black" />
                        ) : (
                            <ThemedText style={styles.createButtonText}>Create Space</ThemedText>
                        )}
                    </TouchableOpacity>
                </GlassCard>
            </BlurView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
        padding: 20,
    },
    modal: {
        width: '100%',
        maxWidth: 400,
        padding: 24,
    },
    headerTitle: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 20,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    inputContainer: {
        marginBottom: 24,
    },
    label: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
        marginBottom: 8,
        fontWeight: '600',
        letterSpacing: 0.5,
    },
    input: {
        fontFamily: 'Inter_400Regular',
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 12,
        padding: 16,
        color: 'white',
        fontSize: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    friendsContainer: {
        marginBottom: 32,
    },
    friendsList: {
        gap: 12,
        paddingVertical: 4,
    },
    friendItem: {
        alignItems: 'center',
        width: 64,
        opacity: 0.6,
    },
    friendItemSelected: {
        opacity: 1,
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        marginBottom: 8,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    avatarPlaceholder: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    avatarText: {
        fontSize: 20,
        fontWeight: '600',
    },
    friendName: {
        fontFamily: 'Inter_400Regular',
        fontSize: 11,
        textAlign: 'center',
        marginTop: 4,
        color: 'rgba(255,255,255,0.7)',
    },
    checkmark: {
        position: 'absolute',
        top: 0,
        right: 8,
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: Colors.obsy.silver,
        justifyContent: 'center',
        alignItems: 'center',
    },
    createButton: {
        backgroundColor: Colors.obsy.silver,
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    createButtonText: {
        fontFamily: 'Inter_600SemiBold',
        color: 'black',
        fontWeight: '600',
        fontSize: 16,
    },
});

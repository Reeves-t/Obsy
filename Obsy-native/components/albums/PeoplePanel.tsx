import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Alert, Modal, TextInput, Dimensions, Animated, ScrollView } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import Colors from '@/constants/Colors';
import { ThemedText } from '@/components/ui/ThemedText';
import { fetchAlbumMembers, removeAlbumMember, AlbumMember, addAlbumMembers } from '@/services/albumMembers';
import { useAlbumHiddenMembers } from '@/lib/useAlbumHiddenMembers';
import { useAlbumRename } from '@/lib/useAlbumRename';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface Friend {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
}

const { width, height } = Dimensions.get('window');
const PANEL_WIDTH = 220; // Match AlbumSidebar width

interface PeoplePanelProps {
    visible: boolean;
    onClose: () => void;
    albumId: string;
    albumName: string;
    creatorId: string;
    onMemberRemoved?: () => void;
}

export function PeoplePanel({ visible, onClose, albumId, albumName, creatorId, onMemberRemoved }: PeoplePanelProps) {
    const { user } = useAuth();
    const [members, setMembers] = useState<AlbumMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [isRenaming, setIsRenaming] = useState(false);
    const [newName, setNewName] = useState(albumName);

    const [friends, setFriends] = useState<Friend[]>([]);
    const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
    const [addingMembers, setAddingMembers] = useState(false);
    const [showAddFriends, setShowAddFriends] = useState(false);

    const { toggleHidden, isHidden } = useAlbumHiddenMembers();
    const { setCustomName, getDisplayName } = useAlbumRename();

    const isCreator = user?.id === creatorId;
    const isPublicAlbum = albumId === 'public';
    const currentDisplayName = getDisplayName(albumId, albumName);

    // Animation value for slide
    const slideAnim = React.useRef(new Animated.Value(PANEL_WIDTH)).current;

    useEffect(() => {
        if (visible) {
            loadMembers();
            setNewName(currentDisplayName);
            // Slide in from right
            Animated.spring(slideAnim, {
                toValue: 0,
                useNativeDriver: true,
                tension: 65,
                friction: 11,
            }).start();
        } else {
            // Slide out to right
            Animated.timing(slideAnim, {
                toValue: PANEL_WIDTH,
                duration: 200,
                useNativeDriver: true,
            }).start();
        }
    }, [visible, albumId]);

    const loadMembers = async () => {
        setLoading(true);
        const data = await fetchAlbumMembers(albumId);
        setMembers(data);
        if (isCreator && !isPublicAlbum) {
            loadFriends(data);
        }
        setLoading(false);
    };

    const loadFriends = async (currentMembers: AlbumMember[]) => {
        if (!user) return;
        try {
            const { data: relationships, error: relError } = await supabase
                .from('relationships')
                .select('following_id')
                .eq('follower_id', user.id);

            if (relError) throw relError;
            const followingIds = relationships.map((r: any) => r.following_id);

            if (followingIds.length > 0) {
                const { data: profiles, error: profError } = await supabase
                    .from('profiles')
                    .select('id, full_name, avatar_url')
                    .in('id', followingIds);

                if (profError) throw profError;

                // Filter out those who are already members
                const memberIds = new Set(currentMembers.map(m => m.user_id));
                const availableFriends = profiles.filter(p => !memberIds.has(p.id));
                setFriends(availableFriends);
            }
        } catch (error) {
            console.error('Error loading friends for invitation:', error);
        }
    };

    const handleInviteFriends = async () => {
        if (selectedFriends.length === 0) return;
        setAddingMembers(true);
        const result = await addAlbumMembers(albumId, selectedFriends);
        if (result.success) {
            setSelectedFriends([]);
            setShowAddFriends(false);
            loadMembers(); // Refresh both lists
        } else {
            Alert.alert("Error", result.message);
        }
        setAddingMembers(false);
    };

    const toggleFriendSelection = (id: string) => {
        setSelectedFriends(prev =>
            prev.includes(id) ? prev.filter(fid => fid !== id) : [...prev, id]
        );
    };

    const handleRemoveMember = (memberId: string, name: string) => {
        Alert.alert(
            "Remove member?",
            `They'll lose access to this album.`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Remove",
                    style: "destructive",
                    onPress: async () => {
                        const result = await removeAlbumMember(albumId, memberId);
                        if (result.success) {
                            setMembers(prev => prev.filter(m => m.user_id !== memberId));
                            if (onMemberRemoved) onMemberRemoved();
                        } else {
                            Alert.alert("Error", result.message);
                        }
                    }
                }
            ]
        );
    };

    const handleRename = () => {
        if (newName.trim()) {
            setCustomName(albumId, newName.trim());
            setIsRenaming(false);
        }
    };

    const getAvatarUrl = (path: string | null) => {
        if (!path) return null;
        if (path.startsWith('http')) return path;
        const { data } = supabase.storage.from('avatars').getPublicUrl(path);
        return data.publicUrl;
    };

    const renderMemberItem = ({ item }: { item: AlbumMember }) => {
        const isSelf = item.user_id === user?.id;
        const memberName = item.user.full_name || 'Unknown';
        const avatarUrl = getAvatarUrl(item.user.avatar_url);
        const hidden = isHidden(albumId, item.user_id);

        return (
            <View style={styles.memberRow}>
                <View style={styles.memberInfo}>
                    <View style={styles.avatarContainer}>
                        {avatarUrl ? (
                            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                        ) : (
                            <View style={[styles.avatar, styles.avatarPlaceholder]}>
                                <ThemedText style={styles.avatarText}>{memberName.charAt(0)}</ThemedText>
                            </View>
                        )}
                        {item.user_id === creatorId && (
                            <View style={styles.creatorBadge}>
                                <Ionicons name="star" size={8} color="black" />
                            </View>
                        )}
                    </View>
                    <ThemedText style={styles.memberName} numberOfLines={1}>
                        {memberName}{isSelf ? ' (You)' : ''}
                    </ThemedText>
                </View>

                <View style={styles.actions}>
                    {!isSelf && (
                        <TouchableOpacity
                            onPress={() => toggleHidden(albumId, item.user_id)}
                            style={styles.actionButton}
                        >
                            <Ionicons
                                name={hidden ? "eye-off-outline" : "eye-outline"}
                                size={20}
                                color={hidden ? Colors.obsy.silver : "rgba(255,255,255,0.6)"}
                            />
                        </TouchableOpacity>
                    )}

                    {isCreator && !isSelf && !isPublicAlbum && (
                        <TouchableOpacity
                            onPress={() => handleRemoveMember(item.user_id, memberName)}
                            style={styles.actionButton}
                        >
                            <Ionicons name="trash-outline" size={20} color="#EF4444" />
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        );
    };

    const renderFriendItem = ({ item }: { item: Friend }) => {
        const isSelected = selectedFriends.includes(item.id);
        const avatarUrl = getAvatarUrl(item.avatar_url);
        return (
            <TouchableOpacity
                style={[styles.friendPickerItem, isSelected && styles.friendPickerItemSelected]}
                onPress={() => toggleFriendSelection(item.id)}
            >
                {avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={styles.pickerAvatar} />
                ) : (
                    <View style={styles.pickerAvatarPlaceholder}>
                        <ThemedText style={styles.pickerAvatarText}>
                            {(item.full_name || '?').charAt(0)}
                        </ThemedText>
                    </View>
                )}
                <ThemedText style={styles.pickerFriendName} numberOfLines={1}>
                    {item.full_name?.split(' ')[0] || 'Unknown'}
                </ThemedText>
                {isSelected && (
                    <View style={styles.pickerCheckmark}>
                        <Ionicons name="checkmark" size={10} color="black" />
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    return (
        <Modal
            animationType="none"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <TouchableOpacity style={styles.dismissArea} onPress={onClose} activeOpacity={1} />
                <Animated.View style={[styles.panel, { transform: [{ translateX: slideAnim }] }]}>
                    <BlurView intensity={40} tint="dark" style={styles.blurContainer}>
                        {/* Header */}
                        <View style={styles.header}>
                            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                                <Ionicons name="chevron-forward" size={28} color="rgba(255,255,255,0.5)" />
                            </TouchableOpacity>
                            <View style={styles.titleContainer}>
                                {isRenaming && !isPublicAlbum ? (
                                    <View style={styles.renameContainer}>
                                        <TextInput
                                            style={styles.renameInput}
                                            value={newName}
                                            onChangeText={setNewName}
                                            autoFocus
                                            onBlur={handleRename}
                                            onSubmitEditing={handleRename}
                                        />
                                        <TouchableOpacity onPress={handleRename}>
                                            <Ionicons name="checkmark-circle" size={24} color="#4ade80" />
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <TouchableOpacity
                                        style={styles.displayNameRow}
                                        onPress={() => !isPublicAlbum && setIsRenaming(true)}
                                        activeOpacity={isPublicAlbum ? 1 : 0.7}
                                        disabled={isPublicAlbum}
                                    >
                                        <ThemedText type="subtitle" style={styles.title}>{currentDisplayName}</ThemedText>
                                        {!isPublicAlbum && <Ionicons name="pencil-sharp" size={14} color="rgba(255,255,255,0.4)" style={{ marginLeft: 8 }} />}
                                    </TouchableOpacity>
                                )}
                                <ThemedText style={styles.memberCount}>{members.length} members</ThemedText>
                            </View>
                        </View>

                        {/* Content */}
                        <View style={styles.content}>
                            {loading ? (
                                <View style={styles.loadingContainer}>
                                    <ActivityIndicator color={Colors.obsy.silver} />
                                </View>
                            ) : showAddFriends ? (
                                // Add Friends View
                                <View style={styles.addFriendsView}>
                                    <View style={styles.addFriendsHeader}>
                                        <TouchableOpacity onPress={() => setShowAddFriends(false)}>
                                            <Ionicons name="arrow-back" size={24} color="white" />
                                        </TouchableOpacity>
                                        <ThemedText style={styles.addFriendsTitle}>Add Friends</ThemedText>
                                        <View style={{ width: 24 }} />
                                    </View>

                                    {friends.length === 0 ? (
                                        <View style={styles.emptyState}>
                                            <Ionicons name="people-outline" size={48} color="rgba(255,255,255,0.2)" />
                                            <ThemedText style={styles.emptyText}>No friends to add</ThemedText>
                                        </View>
                                    ) : (
                                        <FlatList
                                            data={friends}
                                            keyExtractor={item => item.id}
                                            renderItem={renderFriendItem}
                                            numColumns={2}
                                            contentContainerStyle={styles.friendsGrid}
                                        />
                                    )}

                                    {selectedFriends.length > 0 && (
                                        <View style={styles.addButtonContainer}>
                                            <TouchableOpacity
                                                style={styles.addSelectedButton}
                                                onPress={handleInviteFriends}
                                                disabled={addingMembers}
                                            >
                                                {addingMembers ? (
                                                    <ActivityIndicator size="small" color="black" />
                                                ) : (
                                                    <ThemedText style={styles.addSelectedButtonText}>
                                                        Add {selectedFriends.length} Friend{selectedFriends.length > 1 ? 's' : ''}
                                                    </ThemedText>
                                                )}
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                </View>
                            ) : (
                                // Members List View
                                <ScrollView style={styles.membersScrollView} showsVerticalScrollIndicator={false}>
                                    <ThemedText style={styles.sectionLabel}>MEMBERS</ThemedText>
                                    {members.map(item => (
                                        <View key={item.id}>
                                            {renderMemberItem({ item })}
                                        </View>
                                    ))}
                                </ScrollView>
                            )}
                        </View>

                        {/* Bottom Add Friends Button - Only for creators on non-public albums */}
                        {isCreator && !isPublicAlbum && !showAddFriends && !loading && (
                            <View style={styles.bottomButtonContainer}>
                                <TouchableOpacity
                                    style={styles.addFriendsButton}
                                    onPress={() => setShowAddFriends(true)}
                                >
                                    <Ionicons name="person-add-outline" size={20} color="white" />
                                    <ThemedText style={styles.addFriendsButtonText}>Add Friends</ThemedText>
                                </TouchableOpacity>
                            </View>
                        )}
                    </BlurView>
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        flexDirection: 'row',
    },
    dismissArea: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    panel: {
        width: PANEL_WIDTH,
        position: 'absolute',
        right: 0,
        top: 100,
        bottom: 100,
        borderTopLeftRadius: 20,
        borderBottomLeftRadius: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderRightWidth: 0,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    blurContainer: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.85)',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingTop: 20,
        paddingHorizontal: 16,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    closeButton: {
        marginRight: 12,
        marginTop: 4,
    },
    titleContainer: {
        flex: 1,
    },
    displayNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    title: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 22,
        color: 'white',
    },
    memberCount: {
        fontFamily: 'Inter_400Regular',
        fontSize: 13,
        color: 'rgba(255,255,255,0.4)',
        marginTop: 4,
    },
    renameContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    renameInput: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 22,
        color: 'white',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.2)',
        paddingBottom: 2,
        flex: 1,
    },
    content: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    membersScrollView: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 20,
    },
    sectionLabel: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 10,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 1,
        marginBottom: 16,
    },
    memberRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    memberInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    avatarContainer: {
        position: 'relative',
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    avatarPlaceholder: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        fontSize: 16,
        fontWeight: '600',
    },
    creatorBadge: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        backgroundColor: Colors.obsy.silver,
        borderRadius: 6,
        padding: 2,
    },
    memberName: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 15,
        color: 'rgba(255,255,255,0.9)',
        flex: 1,
    },
    actions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    actionButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.03)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    bottomButtonContainer: {
        padding: 20,
        paddingBottom: 40,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.05)',
    },
    addFriendsButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        backgroundColor: 'rgba(255,255,255,0.1)',
        paddingVertical: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    addFriendsButtonText: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 16,
        color: 'white',
    },
    // Add Friends View
    addFriendsView: {
        flex: 1,
    },
    addFriendsHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    addFriendsTitle: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 18,
        color: 'white',
    },
    friendsGrid: {
        padding: 20,
        gap: 16,
    },
    friendPickerItem: {
        alignItems: 'center',
        width: (PANEL_WIDTH - 40) / 2, // 2 columns for narrower panel
        marginBottom: 16,
        opacity: 0.5,
    },
    friendPickerItemSelected: {
        opacity: 1,
    },
    pickerAvatar: {
        width: 56,
        height: 56,
        borderRadius: 28,
        marginBottom: 8,
    },
    pickerAvatarPlaceholder: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: 'rgba(255,255,255,0.05)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    pickerAvatarText: {
        fontSize: 20,
        fontWeight: '600',
    },
    pickerFriendName: {
        fontFamily: 'Inter_400Regular',
        fontSize: 12,
        color: 'rgba(255,255,255,0.6)',
        textAlign: 'center',
    },
    pickerCheckmark: {
        position: 'absolute',
        top: 0,
        right: 12,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: Colors.obsy.silver,
        justifyContent: 'center',
        alignItems: 'center',
    },
    addButtonContainer: {
        padding: 20,
        paddingBottom: 40,
    },
    addSelectedButton: {
        backgroundColor: Colors.obsy.silver,
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
    },
    addSelectedButtonText: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 16,
        color: 'black',
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
    },
    emptyText: {
        fontFamily: 'Inter_400Regular',
        fontSize: 16,
        color: 'rgba(255,255,255,0.4)',
    },
});

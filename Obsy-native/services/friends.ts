import { supabase } from '@/lib/supabase';
import { Profile } from './profile';
import { Album, fetchAlbumsByCreators } from './albums';

export interface Friend extends Profile {
    friendship_id: string;
    friendship_created_at: string;
}

/**
 * FriendAlbum is an alias for Album.
 * The canonical Album type from albums.ts is used to maintain consistency.
 * @deprecated Use Album from './albums' directly
 */
export type FriendAlbum = Album;

/**
 * Add a friend by their user ID.
 * Creates a mutual friendship (two rows).
 */
export async function addFriendById(friendUserId: string): Promise<{ success: boolean; message: string; friend?: Profile }> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        // 1. Find the friend's profile by ID
        const { data: friendProfile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', friendUserId)
            .single();

        if (profileError || !friendProfile) {
            return { success: false, message: "User not found." };
        }

        if (friendProfile.id === user.id) {
            return { success: false, message: "You cannot add yourself." };
        }

        // 2. Check if already friends
        const { data: existing } = await supabase
            .from('friends')
            .select('id')
            .eq('user_id', user.id)
            .eq('friend_id', friendProfile.id)
            .single();

        if (existing) {
            return { success: false, message: "You are already friends." };
        }

        // 3. Create mutual friendship
        // We insert two rows: A -> B and B -> A
        const { error: insertError } = await supabase
            .from('friends')
            .insert([
                { user_id: user.id, friend_id: friendProfile.id },
                { user_id: friendProfile.id, friend_id: user.id }
            ]);

        if (insertError) throw insertError;

        return { success: true, message: "Friend added!", friend: friendProfile };

    } catch (error) {
        console.error("Error adding friend:", error);
        return { success: false, message: "Failed to add friend." };
    }
}

/**
 * @deprecated Use addFriendById instead. Friend codes are being phased out.
 * Add a friend by their unique friend code.
 * Creates a mutual friendship (two rows).
 */
export async function addFriendByCode(friendCode: string): Promise<{ success: boolean; message: string; friend?: Profile }> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        // 1. Find the friend's profile
        const { data: friendProfile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('friend_code', friendCode)
            .single();

        if (profileError || !friendProfile) {
            return { success: false, message: "Friend code not found." };
        }

        if (friendProfile.id === user.id) {
            return { success: false, message: "You cannot add yourself." };
        }

        // 2. Check if already friends
        const { data: existing } = await supabase
            .from('friends')
            .select('id')
            .eq('user_id', user.id)
            .eq('friend_id', friendProfile.id)
            .single();

        if (existing) {
            return { success: false, message: "You are already friends." };
        }

        // 3. Create mutual friendship
        // We insert two rows: A -> B and B -> A
        const { error: insertError } = await supabase
            .from('friends')
            .insert([
                { user_id: user.id, friend_id: friendProfile.id },
                { user_id: friendProfile.id, friend_id: user.id }
            ]);

        if (insertError) throw insertError;

        return { success: true, message: "Friend added!", friend: friendProfile };

    } catch (error) {
        console.error("Error adding friend:", error);
        return { success: false, message: "Failed to add friend." };
    }
}

/**
 * Fetch a user's profile by ID for invite confirmation.
 */
export async function getProfileById(userId: string): Promise<Profile | null> {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) throw error;
        return data;

    } catch (error) {
        console.error("Error fetching profile:", error);
        return null;
    }
}

/**
 * Fetch all friends for the current user.
 * @returns Array of Friend objects with profile information
 */
export async function fetchFriends(): Promise<Friend[]> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];

        // Join friends table with profiles table using foreign key
        const { data, error } = await supabase
            .from('friends')
            .select(`
                id,
                created_at,
                profiles!friends_friend_id_fkey (*)
            `)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error("Error fetching friends:", error);
            return [];
        }

        // Flatten the structure
        return data.map((row: any) => ({
            ...row.profiles,
            friendship_id: row.id,
            friendship_created_at: row.created_at
        }));

    } catch (error) {
        console.error("Error fetching friends:", error);
        return [];
    }
}

/**
 * Remove a friend (mutual deletion).
 * @param friendId - The user ID of the friend to remove
 * @returns True if removal was successful
 */
export async function removeFriend(friendId: string): Promise<boolean> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return false;

        // Delete both directions
        const { error } = await supabase
            .from('friends')
            .delete()
            .or(`and(user_id.eq.${user.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user.id})`);

        if (error) throw error;
        return true;

    } catch (error) {
        console.error("Error removing friend:", error);
        return false;
    }
}

/**
 * Fetch all albums created by friends of the current user.
 * Uses the shared fetchAlbumsByCreators helper from albums.ts to avoid code duplication.
 * @returns Array of Album objects with creator information
 */
export async function getFriendAlbums(): Promise<Album[]> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];

        // Get all friend IDs first
        const { data: friendships, error: friendError } = await supabase
            .from('friends')
            .select('friend_id')
            .eq('user_id', user.id);

        if (friendError) throw friendError;
        if (!friendships || friendships.length === 0) return [];

        const friendIds = friendships.map(f => f.friend_id);

        // Use the shared helper from albums.ts to fetch albums by friend IDs
        return fetchAlbumsByCreators(friendIds);

    } catch (error) {
        console.error("Error fetching friend albums:", error);
        return [];
    }
}

/**
 * Add a friend to an album.
 * Only the album creator can add members.
 * @param albumId - The ID of the album
 * @param friendId - The user ID of the friend to add
 * @returns Object with success status and message
 */
export async function addFriendToAlbum(albumId: string, friendId: string): Promise<{ success: boolean; message: string }> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        // 1. Verify the current user is the album creator
        const { data: album, error: albumError } = await supabase
            .from('albums')
            .select('created_by')
            .eq('id', albumId)
            .single();

        if (albumError || !album) {
            return { success: false, message: "Album not found." };
        }

        if (album.created_by !== user.id) {
            return { success: false, message: "Only the album creator can add members." };
        }

        // 2. Verify this is actually a friend
        const { data: friendship, error: friendshipError } = await supabase
            .from('friends')
            .select('id')
            .eq('user_id', user.id)
            .eq('friend_id', friendId)
            .single();

        if (friendshipError || !friendship) {
            return { success: false, message: "This user is not your friend." };
        }

        // 3. Check if already a member
        const { data: existingMember } = await supabase
            .from('album_members')
            .select('id')
            .eq('album_id', albumId)
            .eq('user_id', friendId)
            .single();

        if (existingMember) {
            return { success: false, message: "This friend is already a member of the album." };
        }

        // 4. Add friend as album member
        const { error: insertError } = await supabase
            .from('album_members')
            .insert({ album_id: albumId, user_id: friendId });

        if (insertError) throw insertError;

        return { success: true, message: "Friend added to album!" };

    } catch (error) {
        console.error("Error adding friend to album:", error);
        return { success: false, message: "Failed to add friend to album." };
    }
}

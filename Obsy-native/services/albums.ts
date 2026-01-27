import { supabase } from '@/lib/supabase';
import { Profile } from './profile';

/** Album type - 'public' for the virtual Public album, 'shared' for database albums */
export type AlbumType = 'public' | 'shared';

export interface Album {
    id: string;
    name: string;
    created_by: string;
    created_at: string;
    member_count?: number;
    creator?: Profile;
    /** Type of album - 'public' for virtual Public album, 'shared' for database albums */
    type?: AlbumType;
}

/** Virtual Public album constant - prepended to album lists */
const PUBLIC_ALBUM: Album = {
    id: 'public',
    name: 'Public',
    created_by: 'system',
    created_at: new Date().toISOString(),
    type: 'public'
};

export interface AlbumMember {
    id: string;
    album_id: string;
    user_id: string;
    joined_at: string;
    profile?: Profile;
}

/**
 * Standard select list for album queries with creator profile.
 * Used to ensure consistent data shape across all album fetch functions.
 */
const ALBUM_SELECT_WITH_CREATOR = `
    id,
    name,
    created_by,
    created_at,
    profiles!albums_created_by_fkey (
        id,
        full_name,
        avatar_url,
        friend_code
    )
`;

/**
 * Helper function to fetch albums created by a list of user IDs.
 * This is the canonical implementation for fetching friend-created albums.
 * Both getFriendAlbums (in friends.ts) and fetchFriendAlbums use this helper.
 *
 * @param creatorIds - Array of user IDs whose albums to fetch
 * @returns Array of Album objects with creator profile information
 */
export async function fetchAlbumsByCreators(creatorIds: string[]): Promise<Album[]> {
    if (!creatorIds || creatorIds.length === 0) return [];

    try {
        const { data: albums, error } = await supabase
            .from('albums')
            .select(ALBUM_SELECT_WITH_CREATOR)
            .in('created_by', creatorIds)
            .order('created_at', { ascending: false });

        if (error) throw error;

        return (albums || []).map((album: any) => ({
            id: album.id,
            name: album.name,
            created_by: album.created_by,
            created_at: album.created_at,
            creator: album.profiles,
            type: 'shared' as AlbumType
        }));
    } catch (error) {
        console.error("Error fetching albums by creators:", error);
        return [];
    }
}

/**
 * Fetch all albums the current user has access to (created or member of).
 * Prepends the virtual Public album and maps DB albums to type: 'shared'.
 * @returns Array of Album objects with metadata
 */
export async function fetchUserAlbums(): Promise<Album[]> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [PUBLIC_ALBUM]; // Return only Public album for non-authenticated users

        // Get albums where user is a member
        const { data, error } = await supabase
            .from('album_members')
            .select(`
                album_id,
                albums!album_members_album_id_fkey (
                    id,
                    name,
                    created_by,
                    created_at,
                    profiles!albums_created_by_fkey (
                        id,
                        full_name,
                        avatar_url
                    )
                )
            `)
            .eq('user_id', user.id)
            .order('joined_at', { ascending: false });

        if (error) {
            console.error("Error fetching user albums:", error);
            return [PUBLIC_ALBUM]; // Return only Public album on error
        }

        // Flatten, deduplicate, and map to type: 'shared'
        const sharedAlbums: Album[] = data
            .filter((row: any) => row.albums)
            .map((row: any) => ({
                ...row.albums,
                creator: row.albums.profiles,
                type: 'shared' as AlbumType
            }));

        // Prepend Public album to the list
        return [PUBLIC_ALBUM, ...sharedAlbums];

    } catch (error) {
        console.error("Error fetching user albums:", error);
        return [PUBLIC_ALBUM]; // Return only Public album on error
    }
}

/**
 * Fetch albums created by friends of the current user.
 * Uses the shared fetchAlbumsByCreators helper to avoid code duplication.
 * @returns Array of Album objects with creator profile information
 */
export async function fetchFriendAlbums(): Promise<Album[]> {
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

        // Use the shared helper to fetch albums by friend IDs
        return fetchAlbumsByCreators(friendIds);

    } catch (error) {
        console.error("Error fetching friend albums:", error);
        return [];
    }
}

/**
 * Create a new album.
 * Automatically adds the creator as a member.
 * @param name - The name of the album
 * @returns The created Album object, or null on failure
 */
export async function createAlbum(name: string): Promise<Album | null> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        // 1. Create the album
        const { data: album, error: albumError } = await supabase
            .from('albums')
            .insert({ name, created_by: user.id })
            .select()
            .single();

        if (albumError) throw albumError;

        // 2. Add creator as a member
        const { error: memberError } = await supabase
            .from('album_members')
            .insert({ album_id: album.id, user_id: user.id });

        if (memberError) {
            console.error("Error adding creator as member:", memberError);
            // Album was created, so we still return it
        }

        return album;

    } catch (error) {
        console.error("Error creating album:", error);
        return null;
    }
}

/**
 * Add a user to an album's members.
 * Only album creator or existing members can add new members.
 * @param albumId - The ID of the album
 * @param userId - The user ID to add as a member
 * @returns Object with success status and message
 */
export async function addMemberToAlbum(albumId: string, userId: string): Promise<{ success: boolean; message: string }> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        // Check if current user is a member (RLS should handle this, but good for feedback)
        const { data: membership } = await supabase
            .from('album_members')
            .select('id')
            .eq('album_id', albumId)
            .eq('user_id', user.id)
            .single();

        if (!membership) {
            return { success: false, message: "You are not a member of this album." };
        }

        // Check if user to add exists
        const { data: userExists } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', userId)
            .single();

        if (!userExists) {
            return { success: false, message: "User not found." };
        }

        // Check if already a member
        const { data: existingMember } = await supabase
            .from('album_members')
            .select('id')
            .eq('album_id', albumId)
            .eq('user_id', userId)
            .single();

        if (existingMember) {
            return { success: false, message: "User is already a member of this album." };
        }

        // Add the member
        const { error: insertError } = await supabase
            .from('album_members')
            .insert({ album_id: albumId, user_id: userId });

        if (insertError) throw insertError;

        return { success: true, message: "Member added to album!" };

    } catch (error) {
        console.error("Error adding member to album:", error);
        return { success: false, message: "Failed to add member to album." };
    }
}

/**
 * Remove a user from album members.
 * Only album creator or the user themselves can remove membership.
 * @param albumId - The ID of the album
 * @param userId - The user ID to remove
 * @returns Object with success status and message
 */
export async function removeMemberFromAlbum(albumId: string, userId: string): Promise<{ success: boolean; message: string }> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        // Get album to check ownership
        const { data: album } = await supabase
            .from('albums')
            .select('created_by')
            .eq('id', albumId)
            .single();

        if (!album) {
            return { success: false, message: "Album not found." };
        }

        // Only creator or self can remove
        if (album.created_by !== user.id && userId !== user.id) {
            return { success: false, message: "You can only remove yourself or members if you're the creator." };
        }

        // Cannot remove the creator
        if (userId === album.created_by) {
            return { success: false, message: "Cannot remove the album creator." };
        }

        // Remove the member
        const { error: deleteError } = await supabase
            .from('album_members')
            .delete()
            .eq('album_id', albumId)
            .eq('user_id', userId);

        if (deleteError) throw deleteError;

        return { success: true, message: "Member removed from album." };

    } catch (error) {
        console.error("Error removing member from album:", error);
        return { success: false, message: "Failed to remove member from album." };
    }
}

/**
 * Delete an album and all its associated data (members, entries, insights).
 * Only the album creator can delete an album.
 * Note: Related album_entries, album_members, and album_daily_insights are
 * automatically deleted via ON DELETE CASCADE in the database schema.
 * @param albumId - The ID of the album to delete
 * @returns Object with success status and message
 */
export async function deleteAlbum(albumId: string): Promise<{ success: boolean; message: string }> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        // 1. Verify ownership (optional, RLS handles this but good for UI feedback)
        const { data: album, error: fetchError } = await supabase
            .from('albums')
            .select('created_by')
            .eq('id', albumId)
            .single();

        if (fetchError || !album) {
            return { success: false, message: "Album not found." };
        }

        if (album.created_by !== user.id) {
            return { success: false, message: "You can only delete albums you created." };
        }

        // 2. Delete the album (cascades to album_entries, album_members, album_daily_insights)
        const { error: deleteError } = await supabase
            .from('albums')
            .delete()
            .eq('id', albumId);

        if (deleteError) throw deleteError;

        return { success: true, message: "Album deleted successfully." };

    } catch (error) {
        console.error("Error deleting album:", error);
        return { success: false, message: "Failed to delete album." };
    }
}

/**
 * Check if a user is a member of an album.
 * @param albumId - The album ID to check
 * @param userId - The user ID to check membership for
 * @returns true if user is a member, false otherwise
 */
export async function checkAlbumMembership(albumId: string, userId: string): Promise<boolean> {
    try {
        const { data, error } = await supabase
            .from('album_members')
            .select('id')
            .eq('album_id', albumId)
            .eq('user_id', userId)
            .single();

        if (error) {
            // PGRST116 means no rows found, which means user is not a member
            if (error.code === 'PGRST116') {
                return false;
            }
            console.error("Error checking album membership:", error);
            return false;
        }

        return !!data;
    } catch (error) {
        console.error("Error in checkAlbumMembership:", error);
        return false;
    }
}

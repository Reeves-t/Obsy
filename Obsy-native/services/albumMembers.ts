import { supabase } from '@/lib/supabase';

export interface AlbumMember {
    id: string;
    album_id: string;
    user_id: string;
    user: {
        id: string;
        full_name: string | null;
        avatar_url: string | null;
    };
}

/**
 * Fetches all members of a specific album with their profile information.
 * Uses a two-step approach since album_members references auth.users, not profiles.
 */
export async function fetchAlbumMembers(albumId: string): Promise<AlbumMember[]> {
    // The 'public' album is a mock/virtual album - it doesn't exist in the database
    if (albumId === 'public') {
        return [];
    }

    try {
        // Step 1: Fetch album members
        const { data: membersData, error: membersError } = await supabase
            .from('album_members')
            .select('id, album_id, user_id')
            .eq('album_id', albumId);

        if (membersError) {
            console.error('Error fetching album members:', membersError);
            return [];
        }

        if (!membersData || membersData.length === 0) {
            return [];
        }

        // Step 2: Fetch profiles for all user IDs
        const userIds = membersData.map(m => m.user_id);
        const { data: profilesData, error: profilesError } = await supabase
            .from('profiles')
            .select('id, full_name, avatar_url')
            .in('id', userIds);

        if (profilesError) {
            console.error('Error fetching profiles:', profilesError);
            return [];
        }

        // Step 3: Combine the data
        const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || []);

        return membersData.map(member => ({
            id: member.id,
            album_id: member.album_id,
            user_id: member.user_id,
            user: profilesMap.get(member.user_id) || {
                id: member.user_id,
                full_name: null,
                avatar_url: null
            }
        }));
    } catch (err) {
        console.error('Unexpected error fetching album members:', err);
        return [];
    }
}

/**
 * Removes a member from an album.
 */
export async function removeAlbumMember(albumId: string, userId: string): Promise<{ success: boolean; message: string }> {
    try {
        const { error } = await supabase
            .from('album_members')
            .delete()
            .eq('album_id', albumId)
            .eq('user_id', userId);

        if (error) {
            console.error('Error removing album member:', error);
            return { success: false, message: 'Failed to remove member.' };
        }

        return { success: true, message: 'Member removed successfully.' };
    } catch (err) {
        console.error('Unexpected error removing album member:', err);
        return { success: false, message: 'An unexpected error occurred.' };
    }
}

/**
 * Adds multiple members to an album.
 */
export async function addAlbumMembers(albumId: string, userIds: string[]): Promise<{ success: boolean; message: string }> {
    try {
        const members = userIds.map(userId => ({
            album_id: albumId,
            user_id: userId
        }));

        const { error } = await supabase
            .from('album_members')
            .insert(members);

        if (error) {
            console.error('Error adding album members:', error);
            return { success: false, message: 'Failed to add members.' };
        }

        return { success: true, message: 'Members added successfully.' };
    } catch (err) {
        console.error('Unexpected error adding album members:', err);
        return { success: false, message: 'An unexpected error occurred.' };
    }
}

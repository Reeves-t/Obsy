import { supabase } from '@/lib/supabase';
import { Profile } from './profile';

export interface Friend extends Profile {
    friendship_id: string;
    friendship_created_at: string;
}

/**
 * Add a friend by their user ID.
 * Creates a mutual friendship (two rows).
 */
export async function addFriendById(friendUserId: string): Promise<{ success: boolean; message: string; friend?: Profile }> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        // 1. Find the friend's profile by ID.
        // profiles SELECT is relationship-scoped (OBS-15); a not-yet-friend is
        // looked up via the SECURITY DEFINER RPC (minimal fields, exact id).
        const { data: byId, error: profileError } = await supabase
            .rpc('get_profile_for_friending_by_id', { target_id: friendUserId });
        const friendProfile = byId?.[0];

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

        // 1. Find the friend's profile by code.
        // profiles SELECT is relationship-scoped (OBS-15); friend-code discovery
        // of a not-yet-friend goes through the SECURITY DEFINER RPC.
        const { data: byCode, error: profileError } = await supabase
            .rpc('get_profile_for_friending_by_code', { target_code: friendCode });
        const friendProfile = byCode?.[0];

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
        // profiles SELECT is relationship-scoped (OBS-15). Invite preview reads a
        // not-yet-friend by exact id via the SECURITY DEFINER RPC (minimal fields).
        const { data, error } = await supabase
            .rpc('get_profile_for_friending_by_id', { target_id: userId });

        if (error) throw error;
        return (data?.[0] as Profile) ?? null;

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

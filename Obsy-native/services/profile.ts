import { supabase } from "@/lib/supabase";
import { AiToneId, DEFAULT_AI_TONE_ID } from "@/lib/aiTone";
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

const GUEST_SETTINGS_KEY = "obsy_guest_settings";
const GUEST_ID_KEY = "obsy_guest_id";

/**
 * Profile interface combining identity data from `profiles` table
 * and settings from `user_settings` table.
 *
 * Identity fields (from `profiles` table):
 * - id, full_name, avatar_url, friend_code
 *
 * Settings fields (from `user_settings` table):
 * - ai_tone, ai_auto_daily_insights, ai_use_journal_in_insights, ai_per_photo_captions
 */
export interface Profile {
    // Identity fields from profiles table
    id: string;
    full_name?: string;
    avatar_url?: string;
    friend_code?: string;

    // Settings fields from user_settings table
    ai_tone: AiToneId;
    ai_auto_daily_insights: boolean;
    ai_use_journal_in_insights: boolean;
    ai_per_photo_captions: boolean;
    selected_custom_tone_id?: string | null;
}


export async function getProfile(): Promise<Profile | null> {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        // Guest mode: try local storage
        let guestId = "";
        try {
            const localData = await AsyncStorage.getItem(GUEST_SETTINGS_KEY);
            if (localData) {
                const parsed = JSON.parse(localData) as Profile;
                // Ensure the stored profile has a valid UUID, not "guest"
                if (parsed.id && parsed.id !== "guest") {
                    return {
                        ...parsed,
                        ai_per_photo_captions: parsed.ai_per_photo_captions ?? true
                    };
                }
            }

            // If we are here, we need a stable guest ID
            // Check if we have just the ID stored (legacy or from captureStore)
            const storedGuestId = await AsyncStorage.getItem(GUEST_ID_KEY);
            if (storedGuestId) {
                guestId = storedGuestId;
            } else {
                guestId = Crypto.randomUUID();
                await AsyncStorage.setItem(GUEST_ID_KEY, guestId);
            }
        } catch (e) {
            console.error("Error reading guest settings:", e);
            guestId = Crypto.randomUUID();
        }

        // Default guest profile
        return {
            id: guestId,
            ai_tone: DEFAULT_AI_TONE_ID,
            ai_auto_daily_insights: true,
            ai_use_journal_in_insights: true,
            ai_per_photo_captions: true,
        };
    }

    // Fetch identity data from profiles table
    const { data: profileData, error: profileError } = await (supabase as any)
        .from("profiles")
        .select("id, full_name, avatar_url, friend_code")
        .eq("id", user.id)
        .single();

    // Fetch settings data from user_settings table
    const { data: settingsData, error: settingsError } = await (supabase as any)
        .from("user_settings")
        .select("*")
        .eq("user_id", user.id)
        .single();

    if (profileError && settingsError) {
        console.error("Error fetching profile:", profileError, settingsError);
        // If tables don't exist or rows missing, return default
        return {
            id: user.id,
            ai_tone: DEFAULT_AI_TONE_ID,
            ai_auto_daily_insights: true,
            ai_use_journal_in_insights: true,
            ai_per_photo_captions: true,
        };
    }

    // Combine identity (profiles) and settings (user_settings) data
    return {
        // Identity from profiles table
        id: profileData?.id ?? user.id,
        full_name: profileData?.full_name ?? undefined,
        avatar_url: profileData?.avatar_url ?? undefined,
        friend_code: profileData?.friend_code ?? undefined,
        // Settings from user_settings table
        ai_tone: (settingsData?.ai_tone as AiToneId) ?? DEFAULT_AI_TONE_ID,
        ai_auto_daily_insights: settingsData?.ai_auto_daily_insights ?? true,
        ai_use_journal_in_insights: settingsData?.ai_use_journal_in_insights ?? true,
        ai_per_photo_captions: settingsData?.ai_per_photo_captions ?? true,
        selected_custom_tone_id: settingsData?.selected_custom_tone_id ?? undefined,
    };
}


export async function updateProfile(updates: Partial<Profile>) {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        // Guest mode: save to local storage
        const current = await getProfile();
        // Keep the existing ID (which should be a UUID now), or fallback to a new one if missing
        const guestId = current?.id && current.id !== "guest" ? current.id : Crypto.randomUUID();

        const updated = { ...current, ...updates, id: guestId } as Profile;
        await AsyncStorage.setItem(GUEST_SETTINGS_KEY, JSON.stringify(updated));
        // Also ensure the ID is stored separately for other services
        await AsyncStorage.setItem(GUEST_ID_KEY, guestId);

        return updated;
    }

    // Separate updates for profiles table (identity) vs user_settings table (settings)
    const profileUpdates: Record<string, unknown> = {};
    const settingsUpdates: Record<string, unknown> = {};

    // Identity fields go to profiles table
    if (updates.full_name !== undefined) profileUpdates.full_name = updates.full_name;
    if (updates.avatar_url !== undefined) profileUpdates.avatar_url = updates.avatar_url;
    // Note: friend_code should not be updated directly; it's generated automatically

    // Settings fields go to user_settings table
    if (updates.ai_tone !== undefined) settingsUpdates.ai_tone = updates.ai_tone;
    if (updates.ai_auto_daily_insights !== undefined) settingsUpdates.ai_auto_daily_insights = updates.ai_auto_daily_insights;
    if (updates.ai_use_journal_in_insights !== undefined) settingsUpdates.ai_use_journal_in_insights = updates.ai_use_journal_in_insights;
    if (updates.ai_per_photo_captions !== undefined) settingsUpdates.ai_per_photo_captions = updates.ai_per_photo_captions;
    if (updates.selected_custom_tone_id !== undefined) settingsUpdates.selected_custom_tone_id = updates.selected_custom_tone_id;


    // Update profiles table if there are identity updates
    if (Object.keys(profileUpdates).length > 0) {
        const { error: profileError } = await (supabase as any)
            .from("profiles")
            .update({ ...profileUpdates, updated_at: new Date().toISOString() })
            .eq("id", user.id);

        if (profileError) {
            console.error("Error updating profile identity:", profileError);
            throw profileError;
        }
    }

    // Update user_settings table if there are settings updates
    if (Object.keys(settingsUpdates).length > 0) {
        const { error: settingsError } = await (supabase as any)
            .from("user_settings")
            .upsert({ user_id: user.id, ...settingsUpdates, updated_at: new Date().toISOString() })
            .select()
            .single();

        if (settingsError) {
            console.error("Error updating profile settings:", settingsError);
            throw settingsError;
        }
    }

    // Return the updated profile
    return getProfile();
}

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Mood } from '@/types/mood';
import { supabase } from '@/lib/supabase';
import { moodCache } from '@/lib/moodCache';

const ASYNC_STORAGE_KEY = 'obsy-custom-moods';
const MIGRATION_FLAG_KEY = 'obsy-custom-moods-migrated';

interface CustomMoodState {
    customMoods: Mood[];
    systemMoods: Mood[];
    loading: boolean;
    error: string | null;
    initialized: boolean;

    // Actions
    fetchSystemMoods: () => Promise<void>;
    fetchCustomMoods: (userId: string) => Promise<void>;
    addCustomMood: (name: string, userId: string) => Promise<Mood>;
    deleteCustomMood: (id: string) => Promise<void>;
    getMoodById: (id: string) => Mood | undefined;
    clearError: () => void;
}

export const useCustomMoodStore = create<CustomMoodState>()((set, get) => ({
    customMoods: [],
    systemMoods: [],
    loading: false,
    error: null,
    initialized: false,

    fetchSystemMoods: async () => {
        try {
            const { data, error } = await supabase
                .from('moods')
                .select('*')
                .eq('type', 'system');

            if (error) {
                console.error('[MoodStore] Error fetching system moods:', error);
                return;
            }

            set({ systemMoods: data || [] });
        } catch (err) {
            console.error('[MoodStore] Unexpected error fetching system moods:', err);
        }
    },

    fetchCustomMoods: async (userId: string) => {
        set({ loading: true, error: null });
        try {
            const { data, error } = await supabase
                .from('moods')
                .select('*')
                .eq('user_id', userId)
                .eq('type', 'custom');

            if (error) {
                console.error('[MoodStore] Error fetching custom moods:', error);
                set({ error: 'Unable to load moods. Check your connection.', loading: false });
                return;
            }

            set({ customMoods: data || [], loading: false, initialized: true });
        } catch (err) {
            console.error('[MoodStore] Unexpected error fetching custom moods:', err);
            set({ error: 'Unable to load moods. Check your connection.', loading: false });
        }
    },

    addCustomMood: async (name: string, userId: string) => {
        const trimmedName = name.trim();

        if (!trimmedName) {
            throw new Error('Mood name cannot be empty');
        }

        const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        const newMood: Mood = {
            id,
            name: trimmedName,
            type: 'custom',
            user_id: userId,
            created_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
            .from('moods')
            .insert(newMood)
            .select()
            .single();

        if (error) {
            console.error('[MoodStore] Error creating custom mood:', error);

            // Handle unique constraint violation (duplicate name)
            if (error.code === '23505') {
                throw new Error(`You already have a mood named "${trimmedName}"`);
            }

            // Handle RLS policy errors
            if (error.code === '42501') {
                throw new Error('Please sign in to create custom moods');
            }

            throw new Error('Failed to create mood. Please try again.');
        }

        // Add to local state
        set(state => ({ customMoods: [...state.customMoods, data] }));

        // Invalidate mood cache so it picks up the new mood
        moodCache.invalidateCache();

        return data;
    },

    deleteCustomMood: async (id: string) => {
        const { error } = await supabase
            .from('moods')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id);

        if (error) {
            console.error('[MoodStore] Error deleting custom mood:', error);
            throw new Error('Failed to delete mood. Please try again.');
        }

        // Update local state to mark mood as deleted
        set(state => ({
            customMoods: state.customMoods.map(m =>
                m.id === id ? { ...m, deleted_at: new Date().toISOString() } : m
            )
        }));

        // Invalidate mood cache so it reflects the deletion
        moodCache.invalidateCache();
    },

    getMoodById: (id: string) => {
        const { systemMoods, customMoods } = get();

        // Check system moods first
        const systemMood = systemMoods.find(m => m.id === id);
        if (systemMood) {
            return systemMood;
        }

        // Then check custom moods (including deleted ones for historical resolution)
        return customMoods.find(m => m.id === id);
    },

    clearError: () => set({ error: null }),
}));

/**
 * Migrate custom moods from AsyncStorage to Supabase database.
 * This runs once per user after they authenticate.
 *
 * IMPORTANT: Only clears AsyncStorage after ALL inserts succeed to prevent data loss.
 * If any insert fails (other than duplicates), migration will retry on next app launch.
 */
async function migrateFromAsyncStorage(userId: string): Promise<void> {
    try {
        // Check if migration already done
        const migrationFlag = await AsyncStorage.getItem(MIGRATION_FLAG_KEY);
        if (migrationFlag === 'true') {
            console.log('[MoodStore] Migration already completed, skipping');
            return;
        }

        // Read old custom moods from AsyncStorage
        const storedData = await AsyncStorage.getItem(ASYNC_STORAGE_KEY);
        if (!storedData) {
            console.log('[MoodStore] No AsyncStorage data to migrate');
            await AsyncStorage.setItem(MIGRATION_FLAG_KEY, 'true');
            return;
        }

        const parsed = JSON.parse(storedData);
        const oldMoods: Mood[] = parsed?.state?.customMoods || [];

        if (oldMoods.length === 0) {
            console.log('[MoodStore] No custom moods to migrate');
            await AsyncStorage.setItem(MIGRATION_FLAG_KEY, 'true');
            return;
        }

        console.log(`[MoodStore] Migrating ${oldMoods.length} custom moods to database`);

        // Track whether any non-duplicate error occurred
        let hasNonDuplicateError = false;
        let successCount = 0;
        let duplicateCount = 0;

        // Insert each mood, tracking errors
        for (const mood of oldMoods) {
            const moodToInsert: Mood = {
                id: mood.id,
                name: mood.name,
                type: 'custom',
                user_id: userId,
                created_at: mood.created_at || new Date().toISOString(),
                deleted_at: mood.deleted_at,
            };

            const { error } = await supabase
                .from('moods')
                .insert(moodToInsert);

            if (error) {
                if (error.code === '23505') {
                    // Duplicate key - mood already migrated, this is fine
                    duplicateCount++;
                    console.log('[MoodStore] Mood already exists (duplicate):', mood.id);
                } else {
                    // Non-duplicate error - this is a problem
                    hasNonDuplicateError = true;
                    console.error('[MoodStore] Error migrating mood:', mood.id, error);
                    // Short-circuit on Supabase errors to avoid partial loss
                    // Stop trying to insert more moods if we're having connection issues
                    if (error.code === 'PGRST301' || error.message?.includes('network') || error.message?.includes('timeout')) {
                        console.error('[MoodStore] Network/connection error detected, stopping migration to retry later');
                        break;
                    }
                }
            } else {
                successCount++;
            }
        }

        console.log(`[MoodStore] Migration results: ${successCount} inserted, ${duplicateCount} duplicates, hasErrors: ${hasNonDuplicateError}`);

        // Only mark migration complete and clear storage if ALL inserts succeeded (or were duplicates)
        if (!hasNonDuplicateError) {
            // Mark migration as complete
            await AsyncStorage.setItem(MIGRATION_FLAG_KEY, 'true');

            // Clear old AsyncStorage data
            await AsyncStorage.removeItem(ASYNC_STORAGE_KEY);

            console.log('[MoodStore] Migration completed successfully');
        } else {
            // Don't clear storage or set flag - migration will retry on next app launch
            console.warn('[MoodStore] Migration incomplete due to errors, will retry on next launch');
        }
    } catch (err) {
        console.error('[MoodStore] Migration error:', err);
        // Don't throw - migration failure shouldn't block the app
        // Don't clear storage - migration will retry on next launch
    }
}

/**
 * Initialize the mood store. Call this after authentication is established.
 * @param userId - The authenticated user's ID, or null for guest mode
 */
export async function initializeMoodStore(userId: string | null): Promise<void> {
    const store = useCustomMoodStore.getState();

    // Always fetch system moods
    await store.fetchSystemMoods();

    if (userId) {
        // Run migration for authenticated users
        await migrateFromAsyncStorage(userId);

        // Fetch user's custom moods
        await store.fetchCustomMoods(userId);
    } else {
        // Guest mode - just mark as initialized with no custom moods
        useCustomMoodStore.setState({ initialized: true, customMoods: [] });
    }
}

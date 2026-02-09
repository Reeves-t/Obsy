import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@obsy/ambient_mood_field_enabled';

interface AmbientMoodFieldState {
    enabled: boolean;
    toggleEnabled: () => void;
    loadSavedState: () => Promise<void>;
}

/**
 * Ambient Mood Field Settings Store
 *
 * Manages the enabled/disabled state for the Ambient Mood Field feature.
 * Provides accessibility option for motion-sensitive users.
 */
export const useAmbientMoodFieldStore = create<AmbientMoodFieldState>((set, get) => ({
    enabled: true, // Default enabled

    toggleEnabled: async () => {
        const newEnabled = !get().enabled;
        set({ enabled: newEnabled });

        // Persist to storage
        try {
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newEnabled));
        } catch (error) {
            console.error('[AmbientMoodField] Failed to save enabled state:', error);
        }
    },

    loadSavedState: async () => {
        try {
            const saved = await AsyncStorage.getItem(STORAGE_KEY);
            if (saved !== null) {
                set({ enabled: JSON.parse(saved) });
            }
        } catch (error) {
            console.error('[AmbientMoodField] Failed to load enabled state:', error);
        }
    },
}));

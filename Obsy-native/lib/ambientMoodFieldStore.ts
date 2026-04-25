import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@obsy/ambient_mood_field_enabled';
const MODE_STORAGE_KEY = '@obsy/ambient_mood_field_mode';

export type AmbientMode = 'sparkles' | 'moodverse';

interface AmbientMoodFieldState {
    enabled: boolean;
    mode: AmbientMode;
    toggleEnabled: () => void;
    setMode: (mode: AmbientMode) => void;
    loadSavedState: () => Promise<void>;
}

/**
 * Ambient Mood Field Settings Store
 *
 * Manages the enabled/disabled state and mode selection for the home screen
 * ambient background. Mode switches between sparkle clusters and moodverse galaxy.
 */
export const useAmbientMoodFieldStore = create<AmbientMoodFieldState>((set, get) => ({
    enabled: true,
    mode: 'sparkles' as AmbientMode,

    toggleEnabled: async () => {
        const newEnabled = !get().enabled;
        set({ enabled: newEnabled });

        try {
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newEnabled));
        } catch (error) {
            console.error('[AmbientMoodField] Failed to save enabled state:', error);
        }
    },

    setMode: async (mode: AmbientMode) => {
        set({ mode });

        try {
            await AsyncStorage.setItem(MODE_STORAGE_KEY, mode);
        } catch (error) {
            console.error('[AmbientMoodField] Failed to save mode:', error);
        }
    },

    loadSavedState: async () => {
        try {
            const [savedEnabled, savedMode] = await Promise.all([
                AsyncStorage.getItem(STORAGE_KEY),
                AsyncStorage.getItem(MODE_STORAGE_KEY),
            ]);
            const updates: Partial<AmbientMoodFieldState> = {};
            if (savedEnabled !== null) updates.enabled = JSON.parse(savedEnabled);
            if (savedMode === 'sparkles' || savedMode === 'moodverse') updates.mode = savedMode;
            if (Object.keys(updates).length > 0) set(updates);
        } catch (error) {
            console.error('[AmbientMoodField] Failed to load saved state:', error);
        }
    },
}));

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@obsy/horizon_stars_enabled';

interface HorizonStarsState {
  enabled: boolean;
  toggleEnabled: () => void;
  loadSavedState: () => Promise<void>;
}

export const useHorizonStarsStore = create<HorizonStarsState>((set, get) => ({
  enabled: true,

  toggleEnabled: async () => {
    const newEnabled = !get().enabled;
    set({ enabled: newEnabled });
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newEnabled));
    } catch (error) {
      console.error('[HorizonStars] Failed to save state:', error);
    }
  },

  loadSavedState: async () => {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved !== null) set({ enabled: JSON.parse(saved) });
    } catch (error) {
      console.error('[HorizonStars] Failed to load state:', error);
    }
  },
}));

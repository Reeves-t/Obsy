import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface FloatingBackgroundState {
    enabled: boolean;
    toggleEnabled: () => void;
}

export const useFloatingBackgroundStore = create<FloatingBackgroundState>()(
    persist(
        (set) => ({
            enabled: true,
            toggleEnabled: () => set((state) => ({ enabled: !state.enabled })),
        }),
        {
            name: 'floating-background-storage',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);

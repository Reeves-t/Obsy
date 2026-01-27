import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type FloatingMode = 'obsy-drift' | 'static-drift' | 'orbital-float' | 'parallax-float';

interface FloatingBackgroundState {
    enabled: boolean;
    mode: FloatingMode;
    toggleEnabled: () => void;
    setMode: (mode: FloatingMode) => void;
}

export const useFloatingBackgroundStore = create<FloatingBackgroundState>()(
    persist(
        (set) => ({
            enabled: true,
            mode: 'obsy-drift',
            toggleEnabled: () => set((state) => ({ enabled: !state.enabled })),
            setMode: (mode: FloatingMode) => set({ mode }),
        }),
        {
            name: 'floating-background-storage',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);

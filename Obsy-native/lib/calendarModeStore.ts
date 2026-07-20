import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** How the month calendar renders each day cell. */
export type CalendarDisplayMode = 'mood' | 'activity' | 'flow';

interface CalendarModeState {
    mode: CalendarDisplayMode;
    setMode: (mode: CalendarDisplayMode) => void;
}

export const useCalendarModeStore = create<CalendarModeState>()(
    persist(
        (set) => ({
            mode: 'mood',
            setMode: (mode) => set({ mode }),
        }),
        {
            name: 'obsy-calendar-display-mode',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);

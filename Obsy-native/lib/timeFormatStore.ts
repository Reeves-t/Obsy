import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns';

export type TimeFormat = 'system' | '12h' | '24h';

interface TimeFormatState {
    timeFormat: TimeFormat;
    setTimeFormat: (format: TimeFormat) => void;
}

export const useTimeFormatStore = create<TimeFormatState>()(
    persist(
        (set) => ({
            timeFormat: 'system',
            setTimeFormat: (newFormat) => set({ timeFormat: newFormat }),
        }),
        {
            name: 'obsy-time-format-storage',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);

/**
 * Common formatter for display time based on user preference
 */
export const getFormattedTime = (date: Date, preference: TimeFormat): string => {
    if (preference === '12h') {
        return format(date, 'h:mm a');
    }
    if (preference === '24h') {
        return format(date, 'HH:mm');
    }

    // 'system' - try to guess based on locale
    return date.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
    });
};

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CheckinSlot,
  DEFAULT_CHECKIN_SLOTS,
  DEFAULT_YEAR_PIXELS_HOUR,
  DEFAULT_YEAR_PIXELS_MINUTE,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// State Shape
// ─────────────────────────────────────────────────────────────────────────────

export interface NotificationSettingsState {
  // Master toggle
  remindersEnabled: boolean;

  // Daily check-in slots (3 fixed slots)
  checkinSlots: [CheckinSlot, CheckinSlot, CheckinSlot];

  // Year-in-Pixels evening reminder
  yearPixelsEnabled: boolean;
  yearPixelsHour: number;
  yearPixelsMinute: number;

  // Album activity (future remote push — state only, no delivery in MVP)
  albumActivityEnabled: boolean;
  albumNewPostsEnabled: boolean;

  // Actions
  setRemindersEnabled: (enabled: boolean) => void;
  updateCheckinSlot: (index: 0 | 1 | 2, updates: Partial<CheckinSlot>) => void;
  setYearPixelsEnabled: (enabled: boolean) => void;
  setYearPixelsTime: (hour: number, minute: number) => void;
  setAlbumActivityEnabled: (enabled: boolean) => void;
  setAlbumNewPostsEnabled: (enabled: boolean) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const useNotificationSettingsStore = create<NotificationSettingsState>()(
  persist(
    (set) => ({
      remindersEnabled: false,
      checkinSlots: [...DEFAULT_CHECKIN_SLOTS] as [CheckinSlot, CheckinSlot, CheckinSlot],
      yearPixelsEnabled: true,
      yearPixelsHour: DEFAULT_YEAR_PIXELS_HOUR,
      yearPixelsMinute: DEFAULT_YEAR_PIXELS_MINUTE,
      albumActivityEnabled: false,
      albumNewPostsEnabled: false,

      setRemindersEnabled: (enabled) => set({ remindersEnabled: enabled }),

      updateCheckinSlot: (index, updates) =>
        set((state) => {
          const newSlots = [...state.checkinSlots] as [CheckinSlot, CheckinSlot, CheckinSlot];
          newSlots[index] = { ...newSlots[index], ...updates };
          return { checkinSlots: newSlots };
        }),

      setYearPixelsEnabled: (enabled) => set({ yearPixelsEnabled: enabled }),

      setYearPixelsTime: (hour, minute) =>
        set({ yearPixelsHour: hour, yearPixelsMinute: minute }),

      setAlbumActivityEnabled: (enabled) => set({ albumActivityEnabled: enabled }),

      setAlbumNewPostsEnabled: (enabled) => set({ albumNewPostsEnabled: enabled }),
    }),
    {
      name: 'obsy-notification-settings',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

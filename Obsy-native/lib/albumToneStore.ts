import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'album_tones';

interface AlbumToneState {
    /** Map of albumId → { toneId, customToneId? } */
    tones: Record<string, { toneId: string; customToneId?: string }>;
    loaded: boolean;
    load: () => Promise<void>;
    setAlbumTone: (albumId: string, toneId: string, customToneId?: string) => void;
    getAlbumTone: (albumId: string) => { toneId: string; customToneId?: string };
}

export const useAlbumToneStore = create<AlbumToneState>((set, get) => ({
    tones: {},
    loaded: false,

    load: async () => {
        try {
            const raw = await AsyncStorage.getItem(STORAGE_KEY);
            if (raw) {
                set({ tones: JSON.parse(raw), loaded: true });
            } else {
                set({ loaded: true });
            }
        } catch {
            set({ loaded: true });
        }
    },

    setAlbumTone: (albumId, toneId, customToneId) => {
        const updated = { ...get().tones, [albumId]: { toneId, customToneId } };
        set({ tones: updated });
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
    },

    getAlbumTone: (albumId) => {
        return get().tones[albumId] ?? { toneId: 'neutral' };
    },
}));

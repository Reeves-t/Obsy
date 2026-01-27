import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AlbumRenameState {
    // Record of albumId -> custom name string
    customNames: Record<string, string>;
    setCustomName: (albumId: string, name: string) => void;
    getDisplayName: (albumId: string, baseName: string) => string;
}

export const useAlbumRename = create<AlbumRenameState>()(
    persist(
        (set, get) => ({
            customNames: {},

            setCustomName: (albumId, name) => {
                set((state) => ({
                    customNames: {
                        ...state.customNames,
                        [albumId]: name
                    }
                }));
            },

            getDisplayName: (albumId, baseName) => {
                return get().customNames[albumId] || baseName;
            }
        }),
        {
            name: 'obsy-album-renames',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);

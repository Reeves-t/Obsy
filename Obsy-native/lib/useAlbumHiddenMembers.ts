import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AlbumHiddenMembersState {
    // Record of albumId -> array of hidden userIds
    hiddenMembers: Record<string, string[]>;
    toggleHidden: (albumId: string, userId: string) => void;
    isHidden: (albumId: string, userId: string) => boolean;
    getHiddenMembersForAlbum: (albumId: string) => string[];
}

export const useAlbumHiddenMembers = create<AlbumHiddenMembersState>()(
    persist(
        (set, get) => ({
            hiddenMembers: {},

            toggleHidden: (albumId, userId) => {
                set((state) => {
                    const currentHidden = state.hiddenMembers[albumId] || [];
                    const isAlreadyHidden = currentHidden.includes(userId);

                    const newHidden = isAlreadyHidden
                        ? currentHidden.filter(id => id !== userId)
                        : [...currentHidden, userId];

                    return {
                        hiddenMembers: {
                            ...state.hiddenMembers,
                            [albumId]: newHidden
                        }
                    };
                });
            },

            isHidden: (albumId, userId) => {
                const hidden = get().hiddenMembers[albumId] || [];
                return hidden.includes(userId);
            },

            getHiddenMembersForAlbum: (albumId) => {
                return get().hiddenMembers[albumId] || [];
            }
        }),
        {
            name: 'obsy-album-hidden-members',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);

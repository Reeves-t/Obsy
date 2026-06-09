import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Types ────────────────────────────────────────────────────

/**
 * Per-topic Board state. We persist tldraw's serialized snapshot verbatim — it's
 * an opaque blob to us — plus an `isEmpty` flag so the native empty-state overlay
 * can render instantly without parsing the snapshot. Images live in the snapshot
 * as `obsy://<storage_path>` references (resolved to signed URLs at load), so the
 * snapshot stays small and durable.
 */
export type BoardRecord = {
    topicId: string;
    snapshot: unknown;
    isEmpty: boolean;
    updatedAt: string;
};

type BoardState = {
    boards: Record<string, BoardRecord>;
    getBoard: (topicId: string) => BoardRecord | undefined;
    setBoard: (topicId: string, snapshot: unknown, isEmpty: boolean) => void;
    removeBoard: (topicId: string) => void;
};

export const useBoardStore = create<BoardState>()(
    persist(
        (set, get) => ({
            boards: {},

            getBoard: (topicId) => get().boards[topicId],

            setBoard: (topicId, snapshot, isEmpty) =>
                set((state) => ({
                    boards: {
                        ...state.boards,
                        [topicId]: {
                            topicId,
                            snapshot,
                            isEmpty,
                            updatedAt: new Date().toISOString(),
                        },
                    },
                })),

            removeBoard: (topicId) =>
                set((state) => {
                    const next = { ...state.boards };
                    delete next[topicId];
                    return { boards: next };
                }),
        }),
        {
            name: 'obsy-board-storage',
            storage: createJSONStorage(() => AsyncStorage),
            version: 1,
            partialize: (state) => ({ boards: state.boards }),
        }
    )
);

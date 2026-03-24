import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';

export interface StrokeData {
    path: string;           // SVG path string
    color: string;
    strokeWidth: number;
    timestamp: number;
}

export interface PixelData {
    date: string;           // YYYY-MM-DD
    color: string | null;   // Primary color (for grid view)
    strokes: StrokeData[];  // Detailed drawing data
    photoUri?: string;      // Optional linked photo (user selected)
    gridCells?: Record<string, string>;  // Daily pixel grid cells, keyed by "row,col" -> color hex
}

export interface LegendItem {
    id: string;
    color: string;
    label: string;
    order: number;
}

interface YearInPixelsState {
    // Data
    year: number;
    pixels: Record<string, PixelData>;  // keyed by YYYY-MM-DD
    legend: LegendItem[];

    // UI State
    activeColorId: string | null;
    photoMode: boolean;

    // Sync
    currentUserId: string | null;
    loadFromSupabase: (user: User) => Promise<void>;
    syncToSupabase: () => Promise<void>;

    // Actions
    setYear: (year: number) => void;
    setActiveColorId: (id: string | null) => void;
    togglePhotoMode: () => void;
    setPixelColor: (date: string, color: string | null) => void;
    addStroke: (date: string, stroke: StrokeData) => void;
    setStrokes: (date: string, strokes: StrokeData[]) => void;
    setPixelPhoto: (date: string, photoUri: string | undefined) => void;
    clearPixel: (date: string) => void;

    // Grid cell actions (daily pixel painting)
    setGridCell: (date: string, cellKey: string, color: string | null) => void;
    clearGrid: (date: string) => void;

    // Legend actions
    addLegendItem: (item: Omit<LegendItem, 'id'>) => void;
    updateLegendItem: (id: string, updates: Partial<LegendItem>) => void;
    removeLegendItem: (id: string) => void;
    reorderLegend: (items: LegendItem[]) => void;
}

// Debounce timer for sync — batches rapid mutations (e.g. brush strokes)
let syncTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSyncAfterMutation() {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
        useYearInPixelsStore.getState().syncToSupabase();
    }, 1500);
}

export const useYearInPixelsStore = create<YearInPixelsState>()(
    persist(
        (set, get) => ({
            year: new Date().getFullYear(),
            pixels: {},
            legend: [],
            activeColorId: null,
            photoMode: false,
            currentUserId: null,

            loadFromSupabase: async (user: User) => {
                const year = get().year;
                set({ currentUserId: user.id });

                const { data, error } = await supabase
                    .from('year_in_pixels')
                    .select('pixels, legend')
                    .eq('user_id', user.id)
                    .eq('year', year)
                    .single();

                if (error) {
                    // PGRST116 = no rows found — that's fine for a new user
                    if (error.code !== 'PGRST116') {
                        console.error('[YearInPixels] Load error:', error.message);
                    }
                    return;
                }

                if (data) {
                    set({
                        pixels: data.pixels ?? {},
                        legend: data.legend ?? [],
                    });
                }
            },

            syncToSupabase: async () => {
                const { currentUserId, year, pixels, legend } = get();
                if (!currentUserId) return;

                const { error } = await supabase
                    .from('year_in_pixels')
                    .upsert(
                        { user_id: currentUserId, year, pixels, legend, updated_at: new Date().toISOString() },
                        { onConflict: 'user_id,year' }
                    );

                if (error) {
                    console.error('[YearInPixels] Sync error:', error.message);
                }
            },

            setYear: (year) => set({ year }),

            setActiveColorId: (id) => set({ activeColorId: id }),

            togglePhotoMode: () => set((state) => ({ photoMode: !state.photoMode })),

            setPixelColor: (date, color) => {
                set((state) => ({
                    pixels: {
                        ...state.pixels,
                        [date]: {
                            ...(state.pixels[date] || { date, strokes: [] }),
                            color,
                        },
                    }
                }));
                scheduleSyncAfterMutation();
            },

            addStroke: (date, stroke) => {
                set((state) => ({
                    pixels: {
                        ...state.pixels,
                        [date]: {
                            ...(state.pixels[date] || { date, color: null, strokes: [] }),
                            strokes: [...(state.pixels[date]?.strokes || []), stroke],
                        },
                    }
                }));
                scheduleSyncAfterMutation();
            },

            setStrokes: (date, strokes) => {
                set((state) => ({
                    pixels: {
                        ...state.pixels,
                        [date]: {
                            ...(state.pixels[date] || { date, color: null }),
                            strokes,
                        },
                    }
                }));
                scheduleSyncAfterMutation();
            },

            setPixelPhoto: (date, photoUri) => {
                set((state) => ({
                    pixels: {
                        ...state.pixels,
                        [date]: {
                            ...(state.pixels[date] || { date, color: null, strokes: [] }),
                            photoUri,
                        },
                    }
                }));
                scheduleSyncAfterMutation();
            },

            clearPixel: (date) => {
                set((state) => {
                    const newPixels = { ...state.pixels };
                    delete newPixels[date];
                    return { pixels: newPixels };
                });
                scheduleSyncAfterMutation();
            },

            setGridCell: (date, cellKey, color) => {
                set((state) => {
                    const existing = state.pixels[date] || { date, color: null, strokes: [] };
                    const gridCells = { ...(existing.gridCells || {}) };
                    if (color) {
                        gridCells[cellKey] = color;
                    } else {
                        delete gridCells[cellKey];
                    }
                    // Update the day's primary color to the painted color so Year in Pixels grid reflects it
                    const dayColor = color ?? existing.color;
                    return {
                        pixels: {
                            ...state.pixels,
                            [date]: { ...existing, gridCells, color: dayColor },
                        },
                    };
                });
                scheduleSyncAfterMutation();
            },

            clearGrid: (date) => {
                set((state) => {
                    const existing = state.pixels[date];
                    if (!existing) return state;
                    return {
                        pixels: {
                            ...state.pixels,
                            [date]: { ...existing, gridCells: {} },
                        },
                    };
                });
                scheduleSyncAfterMutation();
            },

            addLegendItem: (item) => {
                set((state) => {
                    const newId = Math.random().toString(36).substring(7);
                    return {
                        legend: [
                            ...state.legend,
                            { ...item, id: newId }
                        ],
                        activeColorId: newId
                    };
                });
                scheduleSyncAfterMutation();
            },

            updateLegendItem: (id, updates) => {
                set((state) => ({
                    legend: state.legend.map((item) =>
                        item.id === id ? { ...item, ...updates } : item
                    ),
                }));
                scheduleSyncAfterMutation();
            },

            removeLegendItem: (id) => {
                set((state) => ({
                    legend: state.legend.filter((item) => item.id !== id),
                    activeColorId: state.activeColorId === id ? null : state.activeColorId,
                }));
                scheduleSyncAfterMutation();
            },

            reorderLegend: (items) => {
                set({ legend: items });
                scheduleSyncAfterMutation();
            },
        }),
        {
            name: 'obsy-year-in-pixels',
            storage: createJSONStorage(() => AsyncStorage),
            // Don't persist currentUserId — always set fresh from auth on load
            partialize: (state) => ({
                year: state.year,
                pixels: state.pixels,
                legend: state.legend,
                activeColorId: state.activeColorId,
                photoMode: state.photoMode,
            }),
        }
    )
);

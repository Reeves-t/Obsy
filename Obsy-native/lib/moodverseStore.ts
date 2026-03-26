import { create } from 'zustand';
import type { SelectionMode } from '@/components/moodverse/galaxyTypes';

export interface ChatMessage {
    id: string;
    role: 'assistant' | 'user';
    text: string;
}

interface MoodverseState {
    // ── View state ──────────────────────────────────────────────────────────
    selectedYear: number;
    viewMode: 'year' | 'quarter' | 'month';
    selectedQuarter: number | null;
    selectedMonth: number | null;

    // ── Selection state ─────────────────────────────────────────────────────
    selectedOrbId: string | null;
    selectedOrbIds: string[];
    selectionMode: SelectionMode;
    showLinks: boolean;
    selectModeActive: boolean;

    // ── Search / filter ─────────────────────────────────────────────────────
    searchQuery: string;
    searchResultIds: string[];
    isolateClusterId: string | null;

    // ── Explain chat ────────────────────────────────────────────────────────
    isExplainOpen: boolean;
    chatMessages: ChatMessage[];
    isAiLoading: boolean;

    // Context snapshot for the full-screen chat page
    chatContextOrbIds: string[];       // selected orb IDs when chat was opened
    chatContextAllOrbIds: string[];    // not stored — read from orbs prop
    chatContextMode: 'single' | 'multi' | 'cluster' | 'general';

    // ── Camera / orbit ──────────────────────────────────────────────────────
    orbitModeActive: boolean;

    // ── Idle / interaction tracking ─────────────────────────────────────────
    isIdle: boolean;
    isInteracting: boolean;

    // ── AI highlight (visual alienation) ────────────────────────────────────
    aiHighlightedOrbIds: string[];

    // ── Actions ─────────────────────────────────────────────────────────────
    setSelectedYear: (year: number) => void;
    setViewMode: (mode: 'year' | 'quarter' | 'month') => void;
    setSelectedQuarter: (quarter: number | null) => void;
    setSelectedMonth: (month: number | null) => void;
    selectOrb: (id: string | null) => void;
    selectMultiple: (ids: string[]) => void;
    addToSelection: (id: string) => void;
    clearSelection: () => void;
    setShowLinks: (show: boolean) => void;
    toggleSelectMode: () => void;
    setSearchQuery: (query: string) => void;
    setSearchResultIds: (ids: string[]) => void;
    setIsolateCluster: (id: string | null) => void;

    // Explain chat actions
    openExplain: () => void;
    closeExplain: () => void;
    openChat: (orbIds: string[], mode: 'single' | 'multi' | 'cluster' | 'general') => void;
    addChatMessage: (msg: ChatMessage) => void;
    setAiLoading: (loading: boolean) => void;
    setAiHighlightedOrbIds: (ids: string[]) => void;

    // Camera / orbit actions
    toggleOrbitMode: () => void;
    setOrbitModeActive: (active: boolean) => void;

    // Idle actions
    setIdle: (idle: boolean) => void;
    setInteracting: (interacting: boolean) => void;

    reset: () => void;
}

const initialState = {
    selectedYear: new Date().getFullYear(),
    viewMode: 'year' as const,
    selectedQuarter: null as number | null,
    selectedMonth: null as number | null,
    selectedOrbId: null as string | null,
    selectedOrbIds: [] as string[],
    selectionMode: 'single' as SelectionMode,
    showLinks: false,
    selectModeActive: false,
    searchQuery: '',
    searchResultIds: [] as string[],
    isolateClusterId: null as string | null,
    isExplainOpen: false,
    chatMessages: [] as ChatMessage[],
    isAiLoading: false,
    chatContextOrbIds: [] as string[],
    chatContextAllOrbIds: [] as string[],
    chatContextMode: 'general' as 'single' | 'multi' | 'cluster' | 'general',
    orbitModeActive: false,
    isIdle: true,
    isInteracting: false,
    aiHighlightedOrbIds: [] as string[],
};

export const useMoodverseStore = create<MoodverseState>()((set) => ({
    ...initialState,

    setSelectedYear: (year) => set({ selectedYear: year }),
    setViewMode: (mode) => set({ viewMode: mode }),
    setSelectedQuarter: (quarter) => set({ selectedQuarter: quarter }),
    setSelectedMonth: (month) => set({ selectedMonth: month }),

    selectOrb: (id) => set({
        selectedOrbId: id,
        selectedOrbIds: id ? [id] : [],
        selectionMode: 'single',
        showLinks: true,
    }),

    selectMultiple: (ids) => set({
        selectedOrbId: null,
        selectedOrbIds: ids,
        selectionMode: 'multi',
        showLinks: false,
    }),

    addToSelection: (id) => set((state) => {
        const ids = state.selectedOrbIds.includes(id)
            ? state.selectedOrbIds
            : [...state.selectedOrbIds, id];
        return { selectedOrbIds: ids, selectionMode: 'multi' };
    }),

    clearSelection: () => set({
        selectedOrbId: null,
        selectedOrbIds: [],
        selectionMode: 'single',
        showLinks: false,
        isExplainOpen: false,
        chatMessages: [],
        isAiLoading: false,
        aiHighlightedOrbIds: [],
    }),

    setShowLinks: (show) => set({ showLinks: show }),
    toggleSelectMode: () => set((s) => ({ selectModeActive: !s.selectModeActive })),

    setSearchQuery: (query) => set({ searchQuery: query }),
    setSearchResultIds: (ids) => set({ searchResultIds: ids }),
    setIsolateCluster: (id) => set({ isolateClusterId: id }),

    // Explain chat
    openExplain: () => set({ isExplainOpen: true }),
    closeExplain: () => set({
        isExplainOpen: false,
        chatMessages: [],
        isAiLoading: false,
        aiHighlightedOrbIds: [],
        chatContextOrbIds: [],
        chatContextAllOrbIds: [],
        chatContextMode: 'general',
    }),
    openChat: (orbIds, mode) => set({
        isExplainOpen: true,
        chatMessages: [],
        isAiLoading: false,
        aiHighlightedOrbIds: [],
        chatContextOrbIds: orbIds,
        chatContextMode: mode,
    }),
    addChatMessage: (msg) => set((s) => ({
        chatMessages: [...s.chatMessages, msg],
    })),
    setAiLoading: (loading) => set({ isAiLoading: loading }),
    setAiHighlightedOrbIds: (ids) => set({ aiHighlightedOrbIds: ids }),

    // Camera / orbit
    toggleOrbitMode: () => set((s) => ({
        orbitModeActive: !s.orbitModeActive,
        // Turning orbit on disables brush-select (they conflict on pan gesture)
        selectModeActive: !s.orbitModeActive ? false : s.selectModeActive,
    })),
    setOrbitModeActive: (active) => set((s) => ({
        orbitModeActive: active,
        selectModeActive: active ? false : s.selectModeActive,
    })),

    // Idle tracking
    setIdle: (idle) => set({ isIdle: idle }),
    setInteracting: (interacting) => set({ isInteracting: interacting }),

    reset: () => set(initialState),
}));

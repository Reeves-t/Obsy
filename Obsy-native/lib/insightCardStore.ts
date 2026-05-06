import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CardType, InsightCardResult } from '@/services/insightCardClient';

export interface SavedInsightCard extends InsightCardResult {
  id: string;
  savedAt: string;
  dateFrom: string;
  dateTo: string;
  toneId: string;
  scope: 'all' | 'specific';
  moodFilter?: string | null;
  userTitle?: string; // user-edited override
}

interface CacheEntry {
  result: InsightCardResult;
  generatedAt: string;
  captureCount: number;
}

// Rate limit: 10 card generations per calendar day per user
const DAILY_LIMIT = 10;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildCacheKey(
  cardType: CardType,
  scope: 'all' | 'specific',
  moodFilter: string | null | undefined,
  dateFrom: string,
  dateTo: string,
  toneId: string,
): string {
  return [cardType, scope, moodFilter ?? '', dateFrom, dateTo, toneId].join('|');
}

interface InsightCardState {
  savedCards: SavedInsightCard[];
  cache: Record<string, CacheEntry>;
  rateLimitDay: string;
  rateLimitCount: number;

  // Check if user can generate (rate limit)
  canGenerate: () => boolean;
  getRemainingGenerations: () => number;

  // Consume one generation slot
  consumeGeneration: () => void;

  // Cache operations
  getCached: (
    cardType: CardType,
    scope: 'all' | 'specific',
    moodFilter: string | null | undefined,
    dateFrom: string,
    dateTo: string,
    toneId: string,
    currentCaptureCount: number,
  ) => InsightCardResult | null;

  setCached: (
    cardType: CardType,
    scope: 'all' | 'specific',
    moodFilter: string | null | undefined,
    dateFrom: string,
    dateTo: string,
    toneId: string,
    result: InsightCardResult,
    captureCount: number,
  ) => void;

  // Saved cards
  saveCard: (card: InsightCardResult, meta: {
    dateFrom: string;
    dateTo: string;
    toneId: string;
    scope: 'all' | 'specific';
    moodFilter?: string | null;
  }) => SavedInsightCard;

  updateCardTitle: (cardId: string, title: string) => void;
  deleteCard: (cardId: string) => void;
  isCardSaved: (requestId: string) => boolean;
}

export const useInsightCardStore = create<InsightCardState>()(
  persist(
    (set, get) => ({
      savedCards: [],
      cache: {},
      rateLimitDay: todayKey(),
      rateLimitCount: 0,

      canGenerate: () => {
        const state = get();
        const today = todayKey();
        if (state.rateLimitDay !== today) return true;
        return state.rateLimitCount < DAILY_LIMIT;
      },

      getRemainingGenerations: () => {
        const state = get();
        const today = todayKey();
        if (state.rateLimitDay !== today) return DAILY_LIMIT;
        return Math.max(0, DAILY_LIMIT - state.rateLimitCount);
      },

      consumeGeneration: () => {
        const today = todayKey();
        set((state) => ({
          rateLimitDay: today,
          rateLimitCount: state.rateLimitDay === today ? state.rateLimitCount + 1 : 1,
        }));
      },

      getCached: (cardType, scope, moodFilter, dateFrom, dateTo, toneId, currentCaptureCount) => {
        const key = buildCacheKey(cardType, scope, moodFilter, dateFrom, dateTo, toneId);
        const entry = get().cache[key];
        if (!entry) return null;
        // Invalidate if capture count changed (new data logged)
        if (entry.captureCount !== currentCaptureCount) return null;
        return entry.result;
      },

      setCached: (cardType, scope, moodFilter, dateFrom, dateTo, toneId, result, captureCount) => {
        const key = buildCacheKey(cardType, scope, moodFilter, dateFrom, dateTo, toneId);
        set((state) => ({
          cache: {
            ...state.cache,
            [key]: { result, generatedAt: new Date().toISOString(), captureCount },
          },
        }));
      },

      saveCard: (card, meta) => {
        const saved: SavedInsightCard = {
          ...card,
          id: `card_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          savedAt: new Date().toISOString(),
          dateFrom: meta.dateFrom,
          dateTo: meta.dateTo,
          toneId: meta.toneId,
          scope: meta.scope,
          moodFilter: meta.moodFilter,
        };
        set((state) => ({ savedCards: [saved, ...state.savedCards] }));
        return saved;
      },

      updateCardTitle: (cardId, title) => {
        set((state) => ({
          savedCards: state.savedCards.map((c) =>
            c.id === cardId ? { ...c, userTitle: title } : c,
          ),
        }));
      },

      deleteCard: (cardId) => {
        set((state) => ({
          savedCards: state.savedCards.filter((c) => c.id !== cardId),
        }));
      },

      isCardSaved: (requestId) => {
        return get().savedCards.some((c) => c.requestId === requestId);
      },
    }),
    {
      name: 'obsy-insight-cards',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        savedCards: state.savedCards,
        rateLimitDay: state.rateLimitDay,
        rateLimitCount: state.rateLimitCount,
        // Don't persist cache — invalidation is simpler if it's session-only
      }),
    },
  ),
);

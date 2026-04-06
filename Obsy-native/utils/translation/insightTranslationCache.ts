import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupportedLanguageCode } from '@/i18n/languages';
import type { InsightTranslationCacheEntry, LocalizedInsightRecord } from '@/types/insightTranslation';

const CACHE_KEY = '@obsy/insight-translation-cache/v2';

type InsightCacheMap = Record<string, LocalizedInsightRecord>;

async function readCache(): Promise<InsightCacheMap> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as InsightCacheMap;
  } catch {
    return {};
  }
}

async function writeCache(data: InsightCacheMap): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // Non-blocking: translation should still proceed in-memory.
  }
}

export async function getLocalizedInsightRecord(insightId: string): Promise<LocalizedInsightRecord | null> {
  const cache = await readCache();
  return cache[insightId] ?? null;
}

export async function getCachedTranslation(
  insightId: string,
  language: SupportedLanguageCode,
): Promise<InsightTranslationCacheEntry | null> {
  const record = await getLocalizedInsightRecord(insightId);
  if (!record?.translations) return null;
  return record.translations[language] ?? null;
}

export async function upsertLocalizedInsightRecord(record: LocalizedInsightRecord): Promise<void> {
  const cache = await readCache();
  const existing = cache[record.id];

  cache[record.id] = {
    id: record.id,
    originalText: record.originalText,
    originalLanguage: record.originalLanguage,
    translations: {
      ...(existing?.translations ?? {}),
      ...(record.translations ?? {}),
    },
  };

  await writeCache(cache);
}

export async function saveTranslation(
  insightId: string,
  originalText: string,
  originalLanguage: 'en',
  language: SupportedLanguageCode,
  text: string,
): Promise<void> {
  await upsertLocalizedInsightRecord({
    id: insightId,
    originalText,
    originalLanguage,
    translations: {
      [language]: {
        text,
        translatedAt: new Date().toISOString(),
      },
    },
  });
}

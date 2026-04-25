import type { SupportedLanguageCode } from '@/i18n/languages';

export interface InsightToneTranslationMetadata {
  toneId?: string;
  customTonePrompt?: string;
}

export interface InsightTranslationCacheEntry {
  text: string;
  translatedAt?: string;
}

export interface LocalizedInsightRecord {
  id: string;
  originalText: string;
  originalLanguage: 'en';
  translations?: Partial<Record<SupportedLanguageCode, InsightTranslationCacheEntry>>;
}

export interface InsightTranslationRequest {
  insightId: string;
  originalText: string;
  originalLanguage?: SupportedLanguageCode;
  targetLanguage?: SupportedLanguageCode | null;
  protectedTerms?: readonly string[];
  toneMetadata?: InsightToneTranslationMetadata;
  preserveParagraphs?: boolean;
}

export interface InsightTranslationResult {
  text: string;
  language: SupportedLanguageCode;
  usedFallback: boolean;
  fromCache: boolean;
  translated: boolean;
}

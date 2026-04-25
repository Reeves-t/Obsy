import type { SupportedLanguageCode } from '@/i18n/languages';
import type { InsightToneTranslationMetadata } from '@/types/insightTranslation';

export interface InsightTranslationProviderRequest {
  text: string;
  sourceLanguage: SupportedLanguageCode;
  targetLanguage: SupportedLanguageCode;
  protectedTerms: readonly string[];
  toneMetadata?: InsightToneTranslationMetadata;
  preserveParagraphs?: boolean;
}

export interface InsightTranslationProvider {
  translate: (request: InsightTranslationProviderRequest) => Promise<string>;
}

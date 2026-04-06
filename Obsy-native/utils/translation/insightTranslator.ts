import { DEFAULT_LANGUAGE, isSupportedLanguage, type SupportedLanguageCode } from '@/i18n/languages';
import type { InsightTranslationRequest, InsightTranslationResult } from '@/types/insightTranslation';
import { getCachedTranslation, saveTranslation, upsertLocalizedInsightRecord } from '@/utils/translation/insightTranslationCache';
import { MockInsightTranslationProvider } from '@/utils/translation/providers/mockInsightTranslationProvider';
import type { InsightTranslationProvider } from '@/utils/translation/providers/insightTranslationProvider';
import { DEFAULT_PROTECTED_TERMS, protectTerms, restoreProtectedTerms } from '@/utils/translation/protectedTerms';

let provider: InsightTranslationProvider = new MockInsightTranslationProvider();

export function setInsightTranslationProvider(nextProvider: InsightTranslationProvider) {
  provider = nextProvider;
}

function resolveLanguage(language?: SupportedLanguageCode | null): SupportedLanguageCode {
  if (!language) return DEFAULT_LANGUAGE;
  return isSupportedLanguage(language) ? language : DEFAULT_LANGUAGE;
}

export async function maybeTranslateInsight(request: InsightTranslationRequest): Promise<InsightTranslationResult> {
  const sourceLanguage = resolveLanguage(request.originalLanguage ?? 'en');
  const targetLanguage = resolveLanguage(request.targetLanguage);

  await upsertLocalizedInsightRecord({
    id: request.insightId,
    originalText: request.originalText,
    originalLanguage: sourceLanguage,
  });

  if (!request.originalText?.trim()) {
    return {
      text: request.originalText,
      language: sourceLanguage,
      translated: false,
      usedFallback: true,
      fromCache: false,
    };
  }

  if (targetLanguage === sourceLanguage || targetLanguage === 'en') {
    return {
      text: request.originalText,
      language: sourceLanguage,
      translated: false,
      usedFallback: false,
      fromCache: false,
    };
  }

  const cached = await getCachedTranslation(request.insightId, targetLanguage);
  if (cached?.text) {
    return {
      text: cached.text,
      language: targetLanguage,
      translated: true,
      fromCache: true,
      usedFallback: false,
    };
  }

  const protectedTerms = request.protectedTerms ?? DEFAULT_PROTECTED_TERMS;
  const { output: protectedInput, tokenToTerm } = protectTerms(request.originalText, protectedTerms);

  try {
    const translatedProtected = await provider.translate({
      text: protectedInput,
      sourceLanguage,
      targetLanguage,
      protectedTerms,
      toneMetadata: request.toneMetadata,
      preserveParagraphs: request.preserveParagraphs,
    });

    if (!translatedProtected || typeof translatedProtected !== 'string') {
      throw new Error('Malformed translation response');
    }

    const restoredText = restoreProtectedTerms(translatedProtected, tokenToTerm);

    await saveTranslation(request.insightId, request.originalText, 'en', targetLanguage, restoredText);

    return {
      text: restoredText,
      language: targetLanguage,
      translated: true,
      fromCache: false,
      usedFallback: false,
    };
  } catch (error) {
    if (__DEV__) {
      console.warn('[InsightTranslation] Translation failed; using original insight.', error);
    }

    return {
      text: request.originalText,
      language: sourceLanguage,
      translated: false,
      fromCache: false,
      usedFallback: true,
    };
  }
}

export async function getDisplayInsight(request: InsightTranslationRequest): Promise<string> {
  const result = await maybeTranslateInsight(request);
  return result.text;
}

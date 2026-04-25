import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/i18n/config';
import { getDisplayInsight } from '@/utils/translation/insightTranslator';
import type { SupportedLanguageCode } from '@/i18n/languages';
import type { InsightToneTranslationMetadata } from '@/types/insightTranslation';

interface UseTranslatedInsightParams {
  insightId?: string;
  sourceText: string | null | undefined;
  sourceLanguage?: SupportedLanguageCode;
  toneMetadata?: InsightToneTranslationMetadata;
}

function buildFallbackInsightId(sourceText: string | null | undefined): string {
  if (!sourceText) return 'insight-empty';

  let hash = 0;
  for (let i = 0; i < sourceText.length; i += 1) {
    hash = ((hash << 5) - hash) + sourceText.charCodeAt(i);
    hash |= 0;
  }

  return `insight-${Math.abs(hash)}`;
}

export function useTranslatedInsight({
  insightId,
  sourceText,
  sourceLanguage = 'en',
  toneMetadata,
}: UseTranslatedInsightParams): string | null {
  const { language } = useI18n();
  const [displayText, setDisplayText] = useState<string | null>(sourceText ?? null);

  const resolvedInsightId = useMemo(() => {
    return insightId ?? buildFallbackInsightId(sourceText);
  }, [insightId, sourceText]);

  useEffect(() => {
    let isCanceled = false;

    const resolve = async () => {
      if (!sourceText) {
        setDisplayText(null);
        return;
      }

      const translated = await getDisplayInsight({
        insightId: resolvedInsightId,
        originalText: sourceText,
        originalLanguage: sourceLanguage,
        targetLanguage: language,
        toneMetadata,
        preserveParagraphs: true,
      });

      if (!isCanceled) {
        setDisplayText(translated);
      }
    };

    resolve();

    return () => {
      isCanceled = true;
    };
  }, [resolvedInsightId, sourceText, sourceLanguage, language, toneMetadata?.toneId, toneMetadata?.customTonePrompt]);

  return displayText;
}

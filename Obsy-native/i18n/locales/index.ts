import { en, type TranslationDictionary } from './en';
import { ja } from './ja';
import { tl } from './tl';
import type { SupportedLanguageCode } from '@/i18n/languages';

const scaffoldFromEnglish = (): TranslationDictionary => ({
  ...en,
  navigation: { ...en.navigation },
  common: { ...en.common },
  settings: { ...en.settings },
  insight: { ...en.insight },
});

export const LOCALES: Record<SupportedLanguageCode, TranslationDictionary> = {
  en,
  ja,
  tl,
  es: scaffoldFromEnglish(),
  fr: scaffoldFromEnglish(),
  de: scaffoldFromEnglish(),
  pt: scaffoldFromEnglish(),
  ko: scaffoldFromEnglish(),
  'zh-CN': scaffoldFromEnglish(),
  'zh-TW': scaffoldFromEnglish(),
  it: scaffoldFromEnglish(),
  nl: scaffoldFromEnglish(),
  hi: scaffoldFromEnglish(),
  id: scaffoldFromEnglish(),
  ar: scaffoldFromEnglish(),
  tr: scaffoldFromEnglish(),
  vi: scaffoldFromEnglish(),
  ru: scaffoldFromEnglish(),
};

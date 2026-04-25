export type Tier = 'tier1' | 'tier2';

export type SupportedLanguageCode =
  | 'en'
  | 'ja'
  | 'tl'
  | 'es'
  | 'fr'
  | 'de'
  | 'pt'
  | 'ko'
  | 'zh-CN'
  | 'zh-TW'
  | 'it'
  | 'nl'
  | 'hi'
  | 'id'
  | 'ar'
  | 'tr'
  | 'vi'
  | 'ru';

export interface LanguageOption {
  code: SupportedLanguageCode;
  name: string;
  nativeName: string;
  tier: Tier;
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: 'en', name: 'English', nativeName: 'English', tier: 'tier1' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', tier: 'tier1' },
  { code: 'tl', name: 'Filipino', nativeName: 'Filipino', tier: 'tier1' },

  { code: 'es', name: 'Spanish', nativeName: 'Español', tier: 'tier2' },
  { code: 'fr', name: 'French', nativeName: 'Français', tier: 'tier2' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', tier: 'tier2' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', tier: 'tier2' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', tier: 'tier2' },
  { code: 'zh-CN', name: 'Chinese (Simplified)', nativeName: '简体中文', tier: 'tier2' },
  { code: 'zh-TW', name: 'Chinese (Traditional)', nativeName: '繁體中文', tier: 'tier2' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', tier: 'tier2' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', tier: 'tier2' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', tier: 'tier2' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', tier: 'tier2' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', tier: 'tier2' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', tier: 'tier2' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', tier: 'tier2' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', tier: 'tier2' },
];

export const DEFAULT_LANGUAGE: SupportedLanguageCode = 'en';

export const SUPPORTED_LANGUAGE_CODES = LANGUAGE_OPTIONS.map((lang) => lang.code);

export function isSupportedLanguage(code: string): code is SupportedLanguageCode {
  return SUPPORTED_LANGUAGE_CODES.includes(code as SupportedLanguageCode);
}

export function normalizeLocaleToLanguageCode(localeTag?: string | null): SupportedLanguageCode {
  if (!localeTag) return DEFAULT_LANGUAGE;

  const normalized = localeTag.replace('_', '-');

  if (isSupportedLanguage(normalized)) {
    return normalized;
  }

  const base = normalized.split('-')[0];

  if (isSupportedLanguage(base)) {
    return base;
  }

  if (base === 'zh') {
    if (normalized.toLowerCase().includes('tw') || normalized.toLowerCase().includes('hant')) {
      return 'zh-TW';
    }
    return 'zh-CN';
  }

  return DEFAULT_LANGUAGE;
}

export function getLanguageLabel(code: SupportedLanguageCode): string {
  const option = LANGUAGE_OPTIONS.find((item) => item.code === code);
  if (!option) return 'English';
  return `${option.nativeName} (${option.name})`;
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_LANGUAGE, getLanguageLabel, isSupportedLanguage, normalizeLocaleToLanguageCode, type SupportedLanguageCode } from '@/i18n/languages';
import { LOCALES } from '@/i18n/locales';
import type { TranslationDictionary, TranslationKey } from '@/i18n/locales/en';

const LANGUAGE_STORAGE_KEY = '@obsy/language-code';
const LANGUAGE_INITIALIZED_KEY = '@obsy/language-initialized';

interface I18nContextValue {
  language: SupportedLanguageCode;
  isReady: boolean;
  setLanguage: (language: SupportedLanguageCode) => Promise<void>;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  languageLabel: string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

function getValueFromKey(dictionary: TranslationDictionary, key: TranslationKey): string {
  const value = key.split('.').reduce((acc, path) => {
    if (!acc || typeof acc !== 'object') return undefined;
    return (acc as any)[path];
  }, dictionary as unknown as Record<string, unknown>);

  if (typeof value === 'string') {
    return value;
  }

  const fallbackValue = key.split('.').reduce((acc, path) => {
    if (!acc || typeof acc !== 'object') return undefined;
    return (acc as any)[path];
  }, LOCALES.en as unknown as Record<string, unknown>);

  if (typeof fallbackValue === 'string') {
    if (__DEV__) {
      console.warn(`[i18n] Missing key "${key}" for locale.`);
    }
    return fallbackValue;
  }

  if (__DEV__) {
    console.warn(`[i18n] Missing key "${key}" in default locale.`);
  }

  return key;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return Object.entries(vars).reduce((acc, [name, value]) => {
    return acc.replaceAll(`{{${name}}}`, String(value));
  }, template);
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguageCode>(DEFAULT_LANGUAGE);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    const initializeLanguage = async () => {
      try {
        const savedLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (savedLanguage && isSupportedLanguage(savedLanguage)) {
          if (mounted) setLanguageState(savedLanguage);
          return;
        }

        const isInitialized = await AsyncStorage.getItem(LANGUAGE_INITIALIZED_KEY);
        if (isInitialized) {
          if (mounted) setLanguageState(DEFAULT_LANGUAGE);
          return;
        }

        const locales = Localization.getLocales();
        const deviceTag = locales[0]?.languageTag;
        const detected = normalizeLocaleToLanguageCode(deviceTag);

        if (mounted) setLanguageState(detected);
        await AsyncStorage.multiSet([
          [LANGUAGE_STORAGE_KEY, detected],
          [LANGUAGE_INITIALIZED_KEY, 'true'],
        ]);
      } catch (error) {
        if (__DEV__) {
          console.warn('[i18n] Failed to initialize language preference:', error);
        }
        if (mounted) setLanguageState(DEFAULT_LANGUAGE);
      } finally {
        if (mounted) setIsReady(true);
      }
    };

    initializeLanguage();

    return () => {
      mounted = false;
    };
  }, []);

  const setLanguage = useCallback(async (nextLanguage: SupportedLanguageCode) => {
    setLanguageState(nextLanguage);
    try {
      await AsyncStorage.multiSet([
        [LANGUAGE_STORAGE_KEY, nextLanguage],
        [LANGUAGE_INITIALIZED_KEY, 'true'],
      ]);
    } catch (error) {
      if (__DEV__) {
        console.warn('[i18n] Failed to persist selected language:', error);
      }
    }
  }, []);

  const t = useCallback((key: TranslationKey, vars?: Record<string, string | number>) => {
    const dictionary = LOCALES[language] ?? LOCALES.en;
    const raw = getValueFromKey(dictionary, key);
    return interpolate(raw, vars);
  }, [language]);

  const value = useMemo<I18nContextValue>(() => ({
    language,
    isReady,
    setLanguage,
    t,
    languageLabel: getLanguageLabel(language),
  }), [language, isReady, setLanguage, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
}

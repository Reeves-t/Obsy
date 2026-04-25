import { maybeTranslateInsight, setInsightTranslationProvider } from '@/utils/translation/insightTranslator';
import { protectTerms, restoreProtectedTerms } from '@/utils/translation/protectedTerms';
import type { InsightTranslationProvider, InsightTranslationProviderRequest } from '@/utils/translation/providers/insightTranslationProvider';

const mockStorage = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockStorage.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      mockStorage.delete(key);
    }),
  },
}));

class PrefixProvider implements InsightTranslationProvider {
  calls = 0;

  async translate({ text, targetLanguage }: InsightTranslationProviderRequest) {
    this.calls += 1;
    return `[${targetLanguage}] ${text}`;
  }
}

describe('insight translation pipeline', () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it('returns original text for english target', async () => {
    const provider = new PrefixProvider();
    setInsightTranslationProvider(provider);

    const result = await maybeTranslateInsight({
      insightId: 'daily-1',
      originalText: 'First paragraph.\n\nSecond paragraph.',
      targetLanguage: 'en',
    });

    expect(result.text).toBe('First paragraph.\n\nSecond paragraph.');
    expect(result.translated).toBe(false);
    expect(provider.calls).toBe(0);
  });

  it('reuses cached translation for same insight and language', async () => {
    const provider = new PrefixProvider();
    setInsightTranslationProvider(provider);

    await maybeTranslateInsight({
      insightId: 'daily-2',
      originalText: 'A short insight.',
      targetLanguage: 'ja',
    });

    const second = await maybeTranslateInsight({
      insightId: 'daily-2',
      originalText: 'A short insight.',
      targetLanguage: 'ja',
    });

    expect(second.fromCache).toBe(true);
    expect(provider.calls).toBe(1);
  });

  it('falls back to original text when provider throws', async () => {
    setInsightTranslationProvider({
      async translate() {
        throw new Error('translation unavailable');
      },
    });

    const result = await maybeTranslateInsight({
      insightId: 'daily-3',
      originalText: 'Canonical insight text.',
      targetLanguage: 'tl',
    });

    expect(result.text).toBe('Canonical insight text.');
    expect(result.usedFallback).toBe(true);
  });

  it('falls back to english for missing language code', async () => {
    const provider = new PrefixProvider();
    setInsightTranslationProvider(provider);

    const result = await maybeTranslateInsight({
      insightId: 'daily-4',
      originalText: 'Canonical insight text.',
      targetLanguage: null,
    });

    expect(result.text).toBe('Canonical insight text.');
    expect(result.language).toBe('en');
    expect(provider.calls).toBe(0);
  });

  it('preserves paragraph separators through translation pipeline', async () => {
    const provider = new PrefixProvider();
    setInsightTranslationProvider(provider);

    const original = 'Paragraph one.\n\nParagraph two.';
    const result = await maybeTranslateInsight({
      insightId: 'daily-5',
      originalText: original,
      targetLanguage: 'ja',
    });

    expect(result.text.includes('\n\n')).toBe(true);
  });

  it('protects and restores brand placeholders deterministically', () => {
    const original = 'Obsy and Moodverse live inside Year in Pixels.';
    const { output, tokenToTerm } = protectTerms(original, ['Obsy', 'Moodverse', 'Year in Pixels']);

    expect(output).toContain('__OBSY_PROTECTED_TERM_0__');
    expect(output).toContain('__OBSY_PROTECTED_TERM_1__');
    expect(output).toContain('__OBSY_PROTECTED_TERM_2__');

    const restored = restoreProtectedTerms(output, tokenToTerm);
    expect(restored).toBe(original);
  });

  it('keeps protected terms unchanged in translated output', async () => {
    setInsightTranslationProvider({
      async translate({ text }) {
        return text.replace('felt calm', '落ち着いていた');
      },
    });

    const result = await maybeTranslateInsight({
      insightId: 'daily-6',
      originalText: 'Obsy felt calm in Moodverse.',
      targetLanguage: 'ja',
      protectedTerms: ['Obsy', 'Moodverse'],
    });

    expect(result.text).toContain('Obsy');
    expect(result.text).toContain('Moodverse');
  });
});

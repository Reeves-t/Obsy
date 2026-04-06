import type { InsightTranslationProvider, InsightTranslationProviderRequest } from './insightTranslationProvider';

/**
 * Default mock provider for production-safe fallback.
 * Returns source text unchanged until a real backend provider is wired.
 */
export class MockInsightTranslationProvider implements InsightTranslationProvider {
  async translate(request: InsightTranslationProviderRequest): Promise<string> {
    return request.text;
  }
}

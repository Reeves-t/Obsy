export type InsightErrorStage = 'auth' | 'fetch' | 'model' | 'parse' | 'validate' | 'extract' | 'unknown';

export interface InsightError {
  stage: InsightErrorStage;
  message: string;
  requestId?: string;
}

const stageMap: Record<string, InsightErrorStage> = {
  auth: 'auth',
  fetch: 'fetch',
  model: 'model',
  parse: 'parse',
  validate: 'validate',
  extract: 'extract',
  unknown: 'unknown',
};

export function parseInsightError(err: unknown): InsightError {
  const rawMessage =
    typeof err === 'string'
      ? err
      : (err as any)?.message ||
        (err as any)?.error?.message ||
        'An unexpected error occurred';

  let stage: InsightErrorStage = 'unknown';
  let requestId: string | undefined;

  const stageMatch = rawMessage.match(/^\[([a-zA-Z]+)\]\s*/);
  if (stageMatch) {
    const candidate = stageMatch[1].toLowerCase();
    stage = stageMap[candidate] ?? 'unknown';
  }

  const requestMatch = rawMessage.match(/Request ID:\s*([^)]+)\)/i);
  if (requestMatch) {
    requestId = requestMatch[1].trim();
  }

  let message = rawMessage;
  if (stageMatch) {
    message = message.replace(stageMatch[0], '').trim();
  }
  if (requestMatch) {
    message = message.replace(requestMatch[0], '').trim();
  }
  // Remove trailing parentheses or punctuation
  message = message.replace(/\(\s*\)$/, '').trim();

  return {
    stage,
    message: message || rawMessage,
    requestId,
  };
}

export function getUserFriendlyErrorMessage(error: InsightError): string {
  const base = (() => {
    switch (error.stage) {
      case 'auth':
        return 'Please sign in again to continue.';
      case 'fetch':
        return 'Unable to load your captures. Please try again.';
      case 'model':
        return 'AI service temporarily unavailable. Please try again later.';
      case 'parse':
        return 'Unable to process insight. Please try again.';
      case 'validate':
        return 'Insight validation failed. Please try again.';
      case 'extract':
        return 'Unable to generate insight. Please try again.';
      default:
        return 'An unexpected error occurred. Please try again.';
    }
  })();

  if (error.requestId) {
    return `${base} (Error ID: ${error.requestId})`;
  }
  return base;
}

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
  const lower = error.message.toLowerCase();

  // Check message content first for more specific feedback
  if (lower.includes('high demand') || lower.includes('overloaded') || lower.includes('capacity')) {
    return 'Our AI is a bit busy right now. Give it a moment and try again.';
  }
  if (lower.includes('rate limit') || lower.includes('429')) {
    return "You've reached your insight limit for today. Check back tomorrow.";
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return 'The request took too long. Try again in a moment.';
  }

  // Fall back to stage-based messages
  switch (error.stage) {
    case 'auth':
      return 'Session expired. Please sign in again to generate insights.';
    case 'fetch':
      return 'Could not reach the server. Check your connection and try again.';
    case 'model':
      return 'AI service temporarily unavailable. Try again in a moment.';
    case 'parse':
    case 'extract':
      return 'Something went wrong generating your insight. Try again.';
    case 'validate':
      return "You've reached your insight limit for today. Check back tomorrow.";
    default:
      return 'Something unexpected happened. Try again in a moment.';
  }
}

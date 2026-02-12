import { supabase } from '@/lib/supabase';

export interface ObservedPatternsCaptureData {
  mood: string;
  note?: string;
  obsyNote?: string;
  capturedAt: string;
  tags?: string[];
  timeBucket?: string;
  dayPart?: string;
}

export interface ObservedPatternsResponse {
  ok: boolean;
  text?: string;
  requestId?: string;
  error?: {
    stage: string;
    message: string;
    status: number;
  };
}

export interface StoredObservedPattern {
  pattern_text: string;
  eligible_capture_count: number;
  generation_number: number;
  updated_at: string;
}

export async function callObservedPatterns(
  captures: ObservedPatternsCaptureData[],
  previousPatternText: string | null,
  generationNumber: number,
  eligibleCount: number,
): Promise<ObservedPatternsResponse> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) {
    return {
      ok: false,
      error: { stage: 'auth', message: 'Authentication required', status: 401 },
    };
  }

  try {
    const response = await supabase.functions.invoke('generate-observed-patterns', {
      body: { captures, previousPatternText, generationNumber, eligibleCount },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (response.error) {
      return {
        ok: false,
        error: {
          stage: 'fetch',
          message: response.error.message || 'Network error',
          status: (response.error as any)?.status ?? 500,
        },
      };
    }

    const data = response.data;
    if (!data || typeof data !== 'object') {
      return {
        ok: false,
        error: { stage: 'parse', message: 'Invalid response format', status: 500 },
      };
    }

    return data as ObservedPatternsResponse;
  } catch (error: any) {
    return {
      ok: false,
      error: { stage: 'unknown', message: error?.message || 'Unexpected error', status: 500 },
    };
  }
}

export async function fetchObservedPattern(userId: string): Promise<StoredObservedPattern | null> {
  const { data, error } = await supabase
    .from('observed_patterns')
    .select('pattern_text, eligible_capture_count, generation_number, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

export async function upsertObservedPattern(
  userId: string,
  patternText: string,
  eligibleCaptureCount: number,
  generationNumber: number,
): Promise<void> {
  const { error } = await supabase
    .from('observed_patterns')
    .upsert(
      {
        user_id: userId,
        pattern_text: patternText,
        eligible_capture_count: eligibleCaptureCount,
        generation_number: generationNumber,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

  if (error) {
    console.error('[ObservedPatterns] Failed to upsert:', error);
    throw error;
  }
}

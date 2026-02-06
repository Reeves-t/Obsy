import { supabase } from '@/lib/supabase';
import { CaptureData } from '@/lib/captureData';

export interface WeeklyInsightResponse {
  ok: boolean;
  text?: string;
  requestId?: string;
  error?: {
    stage: string;
    message: string;
    status: number;
  };
}

export async function callWeekly(
  weekLabel: string,
  captures: CaptureData[],
  tone: string,
  customTonePrompt?: string,
): Promise<WeeklyInsightResponse> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) {
    return {
      ok: false,
      error: {
        stage: 'auth',
        message: 'Authentication required',
        status: 401,
      },
    };
  }

  try {
    const payloadSize = JSON.stringify({ weekLabel, captures, tone, customTonePrompt }).length;
    console.log('[WEEKLY_INVOKE_START] body size:', payloadSize, 'captures:', captures?.length);
    const response = await supabase.functions.invoke('generate-weekly-insight', {
      body: { weekLabel, captures, tone, customTonePrompt },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    console.log('[WEEKLY_INVOKE_RESPONSE]', { hasError: !!response.error, data: response.data, error: response.error });

    if (response.error) {
      if (response.data && typeof response.data === 'object') {
        return response.data as WeeklyInsightResponse;
      }
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
        error: {
          stage: 'parse',
          message: 'Invalid response format',
          status: 500,
        },
      };
    }

    return data as WeeklyInsightResponse;
  } catch (error: any) {
    return {
      ok: false,
      error: {
        stage: 'unknown',
        message: error?.message || 'Unexpected error',
        status: 500,
      },
    };
  }
}

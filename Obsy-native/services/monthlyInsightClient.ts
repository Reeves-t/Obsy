import { supabase } from '@/lib/supabase';
import { MonthSignals } from '@/lib/captureData';

export interface MonthlyInsightResponse {
  ok: boolean;
  text?: string;
  requestId?: string;
  error?: {
    stage: string;
    message: string;
    status: number;
  };
}

export async function callMonthly(
  monthLabel: string,
  signals: MonthSignals,
  tone: string,
  customTonePrompt?: string,
  monthStart?: string,
): Promise<MonthlyInsightResponse> {
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
    const response = await supabase.functions.invoke('generate-monthly-insight', {
      body: { monthLabel, monthStart, signals, tone, customTonePrompt },
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
        error: {
          stage: 'parse',
          message: 'Invalid response format',
          status: 500,
        },
      };
    }

    return data as MonthlyInsightResponse;
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

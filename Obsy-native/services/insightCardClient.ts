import { supabase } from '@/lib/supabase';

export type CardType = 'reflective' | 'analytical';
export type CardScope = 'all' | 'specific';

export interface CardCaptureData {
  mood: string;
  note?: string;
  capturedAt: string;
  tags?: string[];
}

export interface InsightCardRequest {
  cardType: CardType;
  scope: CardScope;
  moodFilter?: string | null;
  dateFrom: string;
  dateTo: string;
  tone: string;
  customTonePrompt?: string;
  captures: CardCaptureData[];
}

export interface InsightCardResult {
  ok: true;
  requestId: string;
  title: string;
  body: string;
  emotionalTheme?: string;
  dominantMoods?: string[];
  cardType: CardType;
}

export interface InsightCardError {
  ok: false;
  error: {
    stage: string;
    message: string;
    status: number;
  };
}

export type InsightCardResponse = InsightCardResult | InsightCardError;

export async function callInsightCard(req: InsightCardRequest): Promise<InsightCardResponse> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) {
    return {
      ok: false,
      error: { stage: 'auth', message: 'Authentication required', status: 401 },
    };
  }

  try {
    const response = await supabase.functions.invoke('generate-insight-card', {
      body: req,
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

    return data as InsightCardResponse;
  } catch (error: any) {
    return {
      ok: false,
      error: { stage: 'unknown', message: error?.message || 'Unexpected error', status: 500 },
    };
  }
}

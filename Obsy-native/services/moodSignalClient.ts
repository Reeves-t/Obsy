import { supabase } from '@/lib/supabase';
import type { MoodSignalRange, MoodSignalSummary } from '@/lib/moodSignals';
import type { MoodConnectionSummary } from '@/lib/moodConnections';
import { isPresetTone } from '@/lib/aiTone';
import { getProfile } from '@/services/profile';
import { resolveTonePrompt } from '@/services/secureAI';

export interface MoodSignalInterpretationRequest {
  kind: 'weekly_signal' | 'weekday_shape' | 'mood_connection';
  range: MoodSignalRange;
  rangeLabel: string;
  weekdayLabel?: string;
  selectedMood?: string;
  tone?: string;
  customTonePrompt?: string;
  summary: MoodSignalSummary | MoodConnectionSummary;
  moodWeights: Array<{
    mood: string;
    moodId: string;
    color: string;
    count: number;
    percentage: number;
  }>;
  days: Array<{
    dayName: string;
    totalCaptures: number;
    topMood: string | null;
    dominance: number;
    mixLevel: string;
    segments: Array<{
      mood: string;
      count: number;
      percentage: number;
    }>;
  }>;
  connections?: {
    before: Array<{ mood: string; count: number }>;
    after: Array<{ mood: string; count: number }>;
  };
}

export interface MoodSignalInterpretationSuccess {
  ok: true;
  requestId: string;
  text: string;
  usage?: MoodSignalInterpretationUsage;
}

export interface MoodSignalInterpretationError {
  ok: false;
  requestId?: string;
  error: {
    stage: string;
    message: string;
    status: number;
  };
  usage?: MoodSignalInterpretationUsage;
}

export interface MoodSignalInterpretationUsage {
  used: number;
  limit: number;
  remaining: number;
  tier: 'free' | 'plus';
}

export type MoodSignalInterpretationResponse =
  | MoodSignalInterpretationSuccess
  | MoodSignalInterpretationError;

export interface MoodSignalTonePayload {
  tone: string;
  customTonePrompt?: string;
  toneKey: string;
}

export async function resolveMoodSignalTonePayload(
  selectedToneId?: string
): Promise<MoodSignalTonePayload> {
  const profile = selectedToneId ? null : await getProfile();
  const toneId = selectedToneId ?? profile?.selected_custom_tone_id ?? profile?.ai_tone ?? 'neutral';
  const selectedCustomToneId = isPresetTone(toneId) ? undefined : toneId;
  const resolved = await resolveTonePrompt(toneId, selectedCustomToneId);

  return {
    tone: resolved.resolvedTone,
    customTonePrompt: selectedCustomToneId ? resolved.resolvedPrompt : undefined,
    toneKey: selectedCustomToneId
      ? `custom:${selectedCustomToneId}`
      : `preset:${resolved.resolvedTone}`,
  };
}

export async function callMoodSignalInterpretation(
  req: MoodSignalInterpretationRequest
): Promise<MoodSignalInterpretationResponse> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) {
    return {
      ok: false,
      error: { stage: 'auth', message: 'Authentication required', status: 401 },
    };
  }

  try {
    const response = await supabase.functions.invoke('generate-mood-signal-interpretation', {
      body: req,
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (response.error) {
      if (response.data && typeof response.data === 'object') {
        return response.data as MoodSignalInterpretationResponse;
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
        error: { stage: 'parse', message: 'Invalid response format', status: 500 },
      };
    }

    return data as MoodSignalInterpretationResponse;
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

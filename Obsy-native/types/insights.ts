import { MoodSegment, MoodFlowReading, MoodFlowData } from '@/lib/dailyMoodFlows';

export type ArchiveInsightType = 'daily' | 'weekly' | 'monthly' | 'album' | 'tagging';

export interface ArchiveInsight {
    id: string;
    user_id: string;
    type: ArchiveInsightType;
    title: string;
    summary: string;
    body: string;
    date_scope: string;
    album_id?: string | null;
    tag_group_id?: string | null;
    related_capture_ids: string[];
    tone?: string | null;
    created_at: string;
    tags?: string[];
    saved_at?: string;
    deleted_at?: string | null;
}

export interface InsightNarrative {
  title?: string;
  text: string;
  bullets?: string[];
}

export interface InsightStats {
  captureCount: number;
  activeDays?: number;
  avgPerDay?: number;
  dominantMood?: string;
}

export interface InsightTone {
  mode: 'preset' | 'custom';
  label: string;
  instructions?: string;
}

export interface InsightRange {
  startISO: string;
  endISO: string;
}

export interface InsightResponse {
  timeframe: 'daily' | 'weekly' | 'monthly' | 'album' | 'tag';
  range?: InsightRange;
  tone?: InsightTone;
  stats?: InsightStats;
  narrative: InsightNarrative;

  // Daily-specific fields
  vibe_tags?: string[];
  mood_colors?: string[];
  mood_flow?: MoodFlowData; // Support both old (array) and new (object) formats

  // Metadata
  safety?: { noMarkdown: boolean };
}

export interface ParsedDailyInsight {
  insight: string;
  vibe_tags?: string[];
  mood_colors?: string[];
  mood_flow?: MoodFlowData; // Support both old (array) and new (object) formats
}

export interface ParsedWeeklyInsight {
  insight: string;
}

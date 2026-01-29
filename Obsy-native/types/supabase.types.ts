/**
 * Supabase Database type definitions for type-safe data access
 * Add new table definitions here as they are created
 */

export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[];

export interface Database {
    public: {
        Tables: {
            album_insight_posts: {
                Row: {
                    id: string;
                    album_id: string;
                    author_id: string;
                    insight_text: string;
                    tone: string | null;
                    insight_type: string | null;
                    source_insight_id: string | null;
                    generated_at: string;
                    posted_at: string;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    album_id: string;
                    author_id: string;
                    insight_text: string;
                    tone?: string | null;
                    insight_type?: string | null;
                    source_insight_id?: string | null;
                    generated_at: string;
                    posted_at?: string;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    album_id?: string;
                    author_id?: string;
                    insight_text?: string;
                    tone?: string | null;
                    insight_type?: string | null;
                    source_insight_id?: string | null;
                    generated_at?: string;
                    posted_at?: string;
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: 'album_insight_posts_album_id_fkey';
                        columns: ['album_id'];
                        referencedRelation: 'albums';
                        referencedColumns: ['id'];
                    },
                    {
                        foreignKeyName: 'album_insight_posts_author_id_fkey';
                        columns: ['author_id'];
                        referencedRelation: 'users';
                        referencedColumns: ['id'];
                    }
                ];
            };
            user_settings: {
                Row: {
                    user_id: string;
                    ai_tone: string | null;
                    ai_auto_daily_insights: boolean | null;
                    ai_use_journal_in_insights: boolean | null;
                    ai_per_photo_captions: boolean | null;
                    is_premium: boolean | null;
                    premium_until: string | null;
                    subscription_tier: 'guest' | 'free' | 'founder' | 'subscriber';
                    is_founder: boolean;
                    daily_insight_count: number;
                    group_insight_count: number;
                    weekly_insight_count: number;
                    daily_capture_count: number;
                    capture_count_reset_at: string | null;
                    last_reset_date: string | null;
                    selected_custom_tone_id: string | null;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    user_id: string;
                    ai_tone?: string | null;
                    ai_auto_daily_insights?: boolean | null;
                    ai_use_journal_in_insights?: boolean | null;
                    ai_per_photo_captions?: boolean | null;
                    is_premium?: boolean | null;
                    premium_until?: string | null;
                    subscription_tier?: 'guest' | 'free' | 'founder' | 'subscriber';
                    is_founder?: boolean;
                    daily_insight_count?: number;
                    group_insight_count?: number;
                    weekly_insight_count?: number;
                    daily_capture_count?: number;
                    capture_count_reset_at?: string | null;
                    last_reset_date?: string | null;
                    selected_custom_tone_id?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    user_id?: string;
                    ai_tone?: string | null;
                    ai_auto_daily_insights?: boolean | null;
                    ai_use_journal_in_insights?: boolean | null;
                    ai_per_photo_captions?: boolean | null;
                    is_premium?: boolean | null;
                    premium_until?: string | null;
                    subscription_tier?: 'guest' | 'free' | 'founder' | 'subscriber';
                    is_founder?: boolean;
                    daily_insight_count?: number;
                    group_insight_count?: number;
                    weekly_insight_count?: number;
                    daily_capture_count?: number;
                    capture_count_reset_at?: string | null;
                    last_reset_date?: string | null;
                    selected_custom_tone_id?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "user_settings_user_id_fkey";
                        columns: ["user_id"];
                        referencedRelation: "users";
                        referencedColumns: ["id"];
                    }
                ];
            };
            system_stats: {
                Row: {
                    key: string;
                    value: Json;
                    updated_at: string;
                };
                Insert: {
                    key: string;
                    value: Json;
                    updated_at?: string;
                };
                Update: {
                    key?: string;
                    value?: Json;
                    updated_at?: string;
                };
                Relationships: [];
            };
            custom_ai_tones: {
                Row: {
                    id: string;
                    user_id: string;
                    name: string;
                    prompt: string;
                    is_default: boolean;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    user_id: string;
                    name: string;
                    prompt: string;
                    is_default?: boolean;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    user_id?: string;
                    name?: string;
                    prompt?: string;
                    is_default?: boolean;
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "custom_ai_tones_user_id_fkey";
                        columns: ["user_id"];
                        referencedRelation: "users";
                        referencedColumns: ["id"];
                    }
                ];
            };
            daily_mood_flows: {
                Row: {
                    id: string;
                    user_id: string;
                    date_key: string;
                    segments: Json;
                    dominant: string;
                    total_captures: number;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    user_id: string;
                    date_key: string;
                    segments: Json;
                    dominant: string;
                    total_captures: number;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    user_id?: string;
                    date_key?: string;
                    segments?: Json;
                    dominant?: string;
                    total_captures?: number;
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: 'daily_mood_flows_user_id_fkey';
                        columns: ['user_id'];
                        referencedRelation: 'users';
                        referencedColumns: ['id'];
                    }
                ];
            };
            monthly_mood_summaries: {
                Row: {
                    id: string;
                    user_id: string;
                    month_key: string;
                    mood_totals: Json;
                    ai_summary: string | null;
                    month_phrase: string | null;
                    ai_reasoning: string | null;
                    month_to_date_summary: string | null;
                    generated_through_date: string | null;
                    source_stats: Json | null;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    user_id: string;
                    month_key: string;
                    mood_totals: Json;
                    ai_summary?: string | null;
                    month_phrase?: string | null;
                    ai_reasoning?: string | null;
                    month_to_date_summary?: string | null;
                    generated_through_date?: string | null;
                    source_stats?: Json | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    user_id?: string;
                    month_key?: string;
                    mood_totals?: Json;
                    ai_summary?: string | null;
                    month_phrase?: string | null;
                    ai_reasoning?: string | null;
                    month_to_date_summary?: string | null;
                    generated_through_date?: string | null;
                    source_stats?: Json | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: 'monthly_mood_summaries_user_id_fkey';
                        columns: ['user_id'];
                        referencedRelation: 'users';
                        referencedColumns: ['id'];
                    }
                ];
            };
            entries: {
                Row: {
                    id: string;
                    user_id: string;
                    mood: string | null;
                    note: string | null;
                    ai_summary: string | null;
                    photo_path: string | null;
                    tags: string[] | null;
                    include_in_insights: boolean;
                    use_photo_for_insight: boolean;
                    captured_at: string;
                    day_date: string;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    user_id: string;
                    mood?: string | null;
                    note?: string | null;
                    ai_summary?: string | null;
                    photo_path?: string | null;
                    tags?: string[] | null;
                    include_in_insights?: boolean;
                    use_photo_for_insight?: boolean;
                    captured_at?: string;
                    day_date?: string;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    user_id?: string;
                    mood?: string | null;
                    note?: string | null;
                    ai_summary?: string | null;
                    photo_path?: string | null;
                    tags?: string[] | null;
                    include_in_insights?: boolean;
                    use_photo_for_insight?: boolean;
                    captured_at?: string;
                    day_date?: string;
                    created_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: 'entries_user_id_fkey';
                        columns: ['user_id'];
                        referencedRelation: 'users';
                        referencedColumns: ['id'];
                    }
                ];
            };
            albums: {
                Row: {
                    id: string;
                    name: string;
                    created_by: string;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    name: string;
                    created_by: string;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    name?: string;
                    created_by?: string;
                    created_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: 'albums_created_by_fkey';
                        columns: ['created_by'];
                        referencedRelation: 'users';
                        referencedColumns: ['id'];
                    },
                    {
                        foreignKeyName: 'albums_created_by_fkey';
                        columns: ['created_by'];
                        referencedRelation: 'profiles';
                        referencedColumns: ['id'];
                    }
                ];
            };
            album_members: {
                Row: {
                    id: string;
                    album_id: string;
                    user_id: string;
                    joined_at: string;
                };
                Insert: {
                    id?: string;
                    album_id: string;
                    user_id: string;
                    joined_at?: string;
                };
                Update: {
                    id?: string;
                    album_id?: string;
                    user_id?: string;
                    joined_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: 'album_members_album_id_fkey';
                        columns: ['album_id'];
                        referencedRelation: 'albums';
                        referencedColumns: ['id'];
                    },
                    {
                        foreignKeyName: 'album_members_user_id_fkey';
                        columns: ['user_id'];
                        referencedRelation: 'users';
                        referencedColumns: ['id'];
                    }
                ];
            };
            album_entries: {
                Row: {
                    id: string;
                    album_id: string;
                    entry_id: string;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    album_id: string;
                    entry_id: string;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    album_id?: string;
                    entry_id?: string;
                    created_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: 'album_entries_album_id_fkey';
                        columns: ['album_id'];
                        referencedRelation: 'albums';
                        referencedColumns: ['id'];
                    },
                    {
                        foreignKeyName: 'album_entries_entry_id_fkey';
                        columns: ['entry_id'];
                        referencedRelation: 'entries';
                        referencedColumns: ['id'];
                    }
                ];
            };
            album_daily_insights: {
                Row: {
                    id: string;
                    album_id: string;
                    user_id: string;
                    insight_date: string;
                    narrative_text: string;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    album_id: string;
                    user_id: string;
                    insight_date: string;
                    narrative_text: string;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    album_id?: string;
                    user_id?: string;
                    insight_date?: string;
                    narrative_text?: string;
                    created_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: 'album_daily_insights_album_id_fkey';
                        columns: ['album_id'];
                        referencedRelation: 'albums';
                        referencedColumns: ['id'];
                    },
                    {
                        foreignKeyName: 'album_daily_insights_user_id_fkey';
                        columns: ['user_id'];
                        referencedRelation: 'users';
                        referencedColumns: ['id'];
                    }
                ];
            };
        };
        Views: {
            [_ in never]: never;
        };
        Functions: {
            [_ in never]: never;
        };
        Enums: {
            [_ in never]: never;
        };
        CompositeTypes: {
            [_ in never]: never;
        };
    };
}

// Helper types for easier access
export type AlbumInsightPostRow = Database['public']['Tables']['album_insight_posts']['Row'];
export type AlbumInsightPostInsert = Database['public']['Tables']['album_insight_posts']['Insert'];
export type AlbumInsightPostUpdate = Database['public']['Tables']['album_insight_posts']['Update'];

export type DailyMoodFlowRow = Database['public']['Tables']['daily_mood_flows']['Row'];
export type DailyMoodFlowInsert = Database['public']['Tables']['daily_mood_flows']['Insert'];
export type DailyMoodFlowUpdate = Database['public']['Tables']['daily_mood_flows']['Update'];

export type MonthlyMoodSummaryRow = Database['public']['Tables']['monthly_mood_summaries']['Row'];
export type MonthlyMoodSummaryInsert = Database['public']['Tables']['monthly_mood_summaries']['Insert'];
export type MonthlyMoodSummaryUpdate = Database['public']['Tables']['monthly_mood_summaries']['Update'];

export type CustomAiToneRow = Database['public']['Tables']['custom_ai_tones']['Row'];
export type CustomAiToneInsert = Database['public']['Tables']['custom_ai_tones']['Insert'];
export type CustomAiToneUpdate = Database['public']['Tables']['custom_ai_tones']['Update'];

export type EntryRow = Database['public']['Tables']['entries']['Row'];
export type EntryInsert = Database['public']['Tables']['entries']['Insert'];
export type EntryUpdate = Database['public']['Tables']['entries']['Update'];

export type AlbumRow = Database['public']['Tables']['albums']['Row'];
export type AlbumInsert = Database['public']['Tables']['albums']['Insert'];
export type AlbumUpdate = Database['public']['Tables']['albums']['Update'];

export type AlbumMemberRow = Database['public']['Tables']['album_members']['Row'];
export type AlbumMemberInsert = Database['public']['Tables']['album_members']['Insert'];
export type AlbumMemberUpdate = Database['public']['Tables']['album_members']['Update'];

export type AlbumEntryRow = Database['public']['Tables']['album_entries']['Row'];
export type AlbumEntryInsert = Database['public']['Tables']['album_entries']['Insert'];
export type AlbumEntryUpdate = Database['public']['Tables']['album_entries']['Update'];

export type AlbumDailyInsightRow = Database['public']['Tables']['album_daily_insights']['Row'];
export type AlbumDailyInsightInsert = Database['public']['Tables']['album_daily_insights']['Insert'];
export type AlbumDailyInsightUpdate = Database['public']['Tables']['album_daily_insights']['Update'];

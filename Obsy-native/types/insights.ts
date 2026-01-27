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

/**
 * Core Album and Photo types
 */

export type AlbumType = 'public' | 'shared';

export interface Album {
    id: string;
    name: string;
    type: AlbumType;
    icon?: string;
    created_by?: string;
    created_at?: string;
}

export interface Photo {
    id: string;
    albumId: string;
    uri: string;
    user: string;
    mood: string;
    time: string;
    created_at: string;
    isSeen: boolean;
    isMock?: boolean;
    isIntro?: boolean;
}

/**
 * Types for album insight posts (thought clouds)
 */

/**
 * Main type for a posted thought cloud stored in album_insight_posts table
 */
export interface AlbumInsightPost {
    id: string;
    album_id: string;
    author_id: string;
    insight_text: string;
    tone: string | null;
    insight_type: string | null;
    source_insight_id: string | null;
    generated_at: string; // ISO timestamp
    posted_at: string; // ISO timestamp
    created_at: string;
    updated_at: string;
}

/**
 * Extended type with author profile information from profiles table
 */
export interface AlbumInsightPostWithAuthor extends AlbumInsightPost {
    author: {
        id: string;
        full_name: string | null;
        avatar_url: string | null;
    };
}

/**
 * Input type for creating a new album insight post
 */
export interface AlbumInsightPostInput {
    albumId: string;
    authorId: string;
    insightText: string;
    tone?: string | null;
    insightType?: string | null;
    sourceInsightId?: string | null;
    generatedAt: string; // ISO timestamp
}

/**
 * View model for UI consumption - simplified for rendering thought cloud bubbles
 */
export interface AlbumThoughtCloudVM {
    id: string;
    insightText: string;
    postedAt: string;
    generatedAt: string;
    authorName: string;
    authorId: string;
    tone: string | null;
}


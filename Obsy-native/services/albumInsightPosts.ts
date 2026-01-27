import { supabase } from '@/lib/supabase';
import {
    AlbumInsightPostInput,
    AlbumInsightPostWithAuthor,
} from '@/types/albums';
import { AlbumInsightPostInsert, AlbumInsightPostRow } from '@/types/supabase.types';

/**
 * Post an album insight to the album (create a thought cloud)
 * @param input - The input data for creating the post
 * @returns The created post's id on success
 */
export async function postAlbumInsightToAlbum(
    input: AlbumInsightPostInput
): Promise<{ id: string }> {
    try {
        const insertData: AlbumInsightPostInsert = {
            album_id: input.albumId,
            author_id: input.authorId,
            insight_text: input.insightText,
            tone: input.tone ?? null,
            insight_type: input.insightType ?? 'album',
            source_insight_id: input.sourceInsightId ?? null,
            generated_at: input.generatedAt,
        };

        const { data, error } = await supabase
            .from('album_insight_posts')
            .insert(insertData)
            .select('id')
            .single();

        if (error) {
            console.error('Error posting album insight:', error);
            throw new Error(`Failed to post album insight: ${error.message}`);
        }

        return { id: (data as { id: string }).id };
    } catch (error) {
        console.error('Error in postAlbumInsightToAlbum:', error);
        throw error;
    }
}

/**
 * Fetch all insight posts for an album with author profiles
 * @param albumId - The album ID to fetch posts for
 * @returns Array of posts with author information, ordered by posted_at DESC
 */
export async function fetchAlbumInsightPosts(
    albumId: string
): Promise<AlbumInsightPostWithAuthor[]> {
    try {
        const { data, error } = await supabase
            .from('album_insight_posts')
            .select(`
                id,
                album_id,
                author_id,
                insight_text,
                tone,
                insight_type,
                source_insight_id,
                generated_at,
                posted_at,
                created_at,
                updated_at,
                profiles!album_insight_posts_author_id_profiles_fkey (
                    id,
                    full_name,
                    avatar_url
                )
            `)
            .eq('album_id', albumId)
            .order('posted_at', { ascending: false });

        if (error) {
            console.error('Error fetching album insight posts:', error);
            return [];
        }

        // Map the response to the expected type (row extends AlbumInsightPostRow with joined profiles)
        type FetchedRow = AlbumInsightPostRow & {
            profiles: { id: string; full_name: string | null; avatar_url: string | null } | null;
        };
        const posts: AlbumInsightPostWithAuthor[] = (data as FetchedRow[] || []).map((row) => ({
            id: row.id,
            album_id: row.album_id,
            author_id: row.author_id,
            insight_text: row.insight_text,
            tone: row.tone,
            insight_type: row.insight_type,
            source_insight_id: row.source_insight_id,
            generated_at: row.generated_at,
            posted_at: row.posted_at,
            created_at: row.created_at,
            updated_at: row.updated_at,
            author: {
                id: row.profiles?.id || row.author_id,
                full_name: row.profiles?.full_name || null,
                avatar_url: row.profiles?.avatar_url || null,
            },
        }));

        return posts;
    } catch (error) {
        console.error('Error in fetchAlbumInsightPosts:', error);
        return [];
    }
}

/**
 * Delete an album insight post
 * RLS ensures only the author can delete their own posts
 * @param postId - The post ID to delete
 * @returns Success status and message
 */
export async function deleteAlbumInsightPost(
    postId: string
): Promise<{ success: boolean; message: string }> {
    try {
        const { error } = await supabase
            .from('album_insight_posts')
            .delete()
            .eq('id', postId);

        if (error) {
            console.error('Error deleting album insight post:', error);
            return { success: false, message: `Failed to delete post: ${error.message}` };
        }

        return { success: true, message: 'Post deleted successfully.' };
    } catch (error) {
        console.error('Error in deleteAlbumInsightPost:', error);
        return { success: false, message: 'An unexpected error occurred.' };
    }
}


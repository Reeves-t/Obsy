import { useState, useEffect, useCallback } from 'react';
import {
    AlbumInsightPostInput,
    AlbumInsightPostWithAuthor,
} from '@/types/albums';
import {
    fetchAlbumInsightPosts,
    postAlbumInsightToAlbum,
} from '@/services/albumInsightPosts';

/**
 * Hook to fetch album insight posts for a given album
 * @param albumId - The album ID to fetch posts for
 */
export function useAlbumInsightPosts(albumId: string | undefined) {
    const [posts, setPosts] = useState<AlbumInsightPostWithAuthor[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refetch = useCallback(async () => {
        if (!albumId) {
            setPosts([]);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const data = await fetchAlbumInsightPosts(albumId);
            setPosts(data);
        } catch (err) {
            console.error('Error fetching album insight posts:', err);
            setError('Failed to fetch insight posts');
            setPosts([]);
        } finally {
            setLoading(false);
        }
    }, [albumId]);

    useEffect(() => {
        refetch();
    }, [refetch]);

    return { posts, loading, error, refetch };
}

/**
 * Hook to post an album insight
 * Returns a function to post and loading/error states
 */
export function usePostAlbumInsight() {
    const [isPosting, setIsPosting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const postInsight = useCallback(
        async (input: AlbumInsightPostInput): Promise<{ id: string }> => {
            setIsPosting(true);
            setError(null);

            try {
                const result = await postAlbumInsightToAlbum(input);
                return result;
            } catch (err) {
                const errorMessage =
                    err instanceof Error ? err.message : 'Failed to post insight';
                console.error('Error posting album insight:', err);
                setError(errorMessage);
                throw err;
            } finally {
                setIsPosting(false);
            }
        },
        []
    );

    return { postInsight, isPosting, error };
}


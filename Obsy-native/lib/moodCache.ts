import { supabase } from '@/lib/supabase';
import { Mood } from '@/types/mood';

const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

/**
 * Singleton mood cache service that queries Supabase directly.
 * Provides reliable mood resolution independent of Zustand store hydration.
 */
class MoodCache {
    private moods: Map<string, Mood> = new Map();
    private lastFetched: number = 0;
    private userId: string | null = null;
    private ttl: number = DEFAULT_TTL;
    private isFetching: boolean = false;
    private fetchPromise: Promise<void> | null = null;

    /**
     * Fetch all moods (system + custom) from the database.
     * @param userId - The authenticated user's ID, or null for guests
     */
    async fetchAllMoods(userId: string | null): Promise<void> {
        // If already fetching, wait for the existing fetch to complete
        if (this.isFetching && this.fetchPromise) {
            return this.fetchPromise;
        }

        this.isFetching = true;
        this.fetchPromise = this._doFetch(userId);

        try {
            await this.fetchPromise;
        } finally {
            this.isFetching = false;
            this.fetchPromise = null;
        }
    }

    private async _doFetch(userId: string | null): Promise<void> {
        try {
            this.userId = userId;

            // Fetch system moods
            const { data: systemMoods, error: systemError } = await supabase
                .from('moods')
                .select('*')
                .eq('type', 'system');

            if (systemError) {
                console.error('[MoodCache] Error fetching system moods:', systemError);
                return;
            }

            // Clear and rebuild cache
            this.moods.clear();

            // Add system moods
            (systemMoods || []).forEach(mood => {
                this.moods.set(mood.id, mood);
            });

            // Fetch custom moods if user is authenticated
            if (userId) {
                const { data: customMoods, error: customError } = await supabase
                    .from('moods')
                    .select('*')
                    .eq('type', 'custom')
                    .eq('user_id', userId)
                    .is('deleted_at', null);

                if (customError) {
                    console.error('[MoodCache] Error fetching custom moods:', customError);
                } else {
                    // Add custom moods
                    (customMoods || []).forEach(mood => {
                        this.moods.set(mood.id, mood);
                    });
                }
            }

            this.lastFetched = Date.now();
            console.log(`[MoodCache] Loaded ${this.moods.size} moods (user: ${userId ? 'authenticated' : 'guest'})`);
        } catch (err) {
            console.error('[MoodCache] Unexpected error fetching moods:', err);
        }
    }

    /**
     * Get a mood by ID from the cache.
     * Returns null if not found.
     */
    getMoodById(id: string): Mood | null {
        return this.moods.get(id) || null;
    }

    /**
     * Check if the cache is stale (past TTL).
     */
    isStale(): boolean {
        return Date.now() - this.lastFetched > this.ttl;
    }

    /**
     * Check if the cache is currently loading.
     */
    isLoading(): boolean {
        return this.isFetching;
    }

    /**
     * Check if the cache has been initialized.
     */
    isInitialized(): boolean {
        return this.lastFetched > 0;
    }

    /**
     * Invalidate the cache, forcing a refresh on next access.
     */
    invalidateCache(): void {
        this.lastFetched = 0;
        console.log('[MoodCache] Cache invalidated');
    }

    /**
     * Get all cached moods.
     */
    getAllMoods(): Mood[] {
        return Array.from(this.moods.values());
    }

    /**
     * Get the current user ID the cache is associated with.
     */
    getCurrentUserId(): string | null {
        return this.userId;
    }
}

// Export singleton instance
export const moodCache = new MoodCache();


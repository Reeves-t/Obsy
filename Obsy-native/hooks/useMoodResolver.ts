import { useCallback, useEffect, useState } from 'react';
import { moodCache } from '@/lib/moodCache';
import { resolveMoodColor } from '@/lib/moodColorUtils';
import { Mood } from '@/types/mood';
import { supabase } from '@/lib/supabase';

export function useMoodResolver() {
    const [isLoading, setIsLoading] = useState(!moodCache.isInitialized());

    // Initialize cache on mount and when user changes
    useEffect(() => {
        const initCache = async () => {
            if (!moodCache.isInitialized() || moodCache.isStale()) {
                setIsLoading(true);
                const { data: { user } } = await supabase.auth.getUser();
                await moodCache.fetchAllMoods(user?.id ?? null);
                setIsLoading(false);
            }
        };

        initCache();

        // Listen for auth changes to refresh cache
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (_event, session) => {
                setIsLoading(true);
                await moodCache.fetchAllMoods(session?.user?.id ?? null);
                setIsLoading(false);
            }
        );

        return () => subscription.unsubscribe();
    }, []);

    const resolveMood = useCallback((moodId: string): Mood | null => {
        return moodCache.getMoodById(moodId);
    }, []);

    const getMoodDisplay = useCallback((moodId: string, nameSnapshot?: string) => {
        const mood = moodCache.getMoodById(moodId);

        if (!mood) {
            // If mood not found, fallback to snapshot if available
            if (nameSnapshot) {
                return {
                    name: nameSnapshot,
                    color: resolveMoodColor({ name: nameSnapshot, type: 'custom' } as Mood),
                    type: 'custom' as const,
                };
            }
            return null;
        }

        return {
            name: mood.name,
            color: resolveMoodColor(mood),
            type: mood.type,
        };
    }, []);

    return { resolveMood, getMoodDisplay, isLoading };
}

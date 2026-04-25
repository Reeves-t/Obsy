import { useCallback, useEffect, useState } from 'react';
import { moodCache } from '@/lib/moodCache';
import { Mood } from '@/types/mood';
import { supabase } from '@/lib/supabase';
import { getMoodTheme } from '@/lib/moods';
import type { MoodGradient } from '@/lib/moods';

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
            if (nameSnapshot) {
                const theme = getMoodTheme(nameSnapshot);
                return {
                    name: nameSnapshot,
                    color: theme.solid,
                    gradient: theme.gradient,
                    textOn: theme.textOn,
                    type: 'custom' as const,
                };
            }
            return null;
        }

        const theme = getMoodTheme(mood.type === 'system' ? mood.id : mood.name);
        return {
            name: mood.name,
            color: theme.solid,
            gradient: theme.gradient,
            textOn: theme.textOn,
            type: mood.type,
        };
    }, []);

    return { resolveMood, getMoodDisplay, isLoading };
}

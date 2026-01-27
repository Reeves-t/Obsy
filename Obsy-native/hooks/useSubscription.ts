import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Database } from '../types/supabase.types';

type UserSettings = Database['public']['Tables']['user_settings']['Row'];
type SubscriptionTier = UserSettings['subscription_tier'];

export type FeatureName = 'daily_insight' | 'group_insight' | 'weekly_insight' | 'albums' | 'premium_tones';

interface SubscriptionState {
    tier: SubscriptionTier;
    isFounder: boolean;
    counts: {
        daily_insight: number;
        group_insight: number;
        weekly_insight: number;
    };
    loading: boolean;
    refresh: () => Promise<void>;
    checkLimit: (feature: FeatureName) => boolean;
    incrementLimit: (feature: FeatureName) => Promise<boolean>;
}

const LIMITS = {
    guest: {
        daily_insight: 1,
        group_insight: 0,
        weekly_insight: 0,
    },
    free: {
        daily_insight: 3,
        group_insight: 3,
        weekly_insight: 1,
    },
    founder: {
        daily_insight: Infinity,
        group_insight: Infinity,
        weekly_insight: Infinity,
    },
    subscriber: {
        daily_insight: Infinity,
        group_insight: Infinity,
        weekly_insight: Infinity,
    },
};

export function useSubscription(): SubscriptionState {
    const { user } = useAuth();
    const [settings, setUserSettings] = useState<UserSettings | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchSettings = useCallback(async () => {
        if (!user) {
            setUserSettings(null);
            setLoading(false);
            return;
        }

        try {
            // First, trigger the check_and_reset_limits function
            await supabase.rpc('check_and_reset_limits', { user_uuid: user.id });

            const { data, error } = await supabase
                .from('user_settings')
                .select('*')
                .eq('user_id', user.id)
                .single();

            if (error) throw error;
            setUserSettings(data);
        } catch (error) {
            console.error('Error fetching user settings:', error);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        fetchSettings();

        // Subscribe to changes
        if (!user) return;

        const subscription = supabase
            .channel(`user_settings:${user.id}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'user_settings',
                    filter: `user_id=eq.${user.id}`,
                },
                (payload) => {
                    setUserSettings(payload.new as UserSettings);
                }
            )
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, [user, fetchSettings]);

    // Determine tier: 'guest' only if no user session, otherwise default to 'free'
    const tier: SubscriptionTier = !user
        ? 'guest'
        : (settings?.subscription_tier || 'free');
    const isFounder = settings?.is_founder || false;

    const checkLimit = useCallback(
        (feature: FeatureName): boolean => {
            if (tier === 'founder' || tier === 'subscriber') return true;
            if (feature === 'albums' && tier === 'guest') return false; // Guests can't access albums
            if (feature === 'albums') return true; // Free users can access albums
            if (feature === 'premium_tones' && (tier === 'guest' || tier === 'free')) return false;

            const currentCount =
                feature === 'daily_insight'
                    ? settings?.daily_insight_count || 0
                    : feature === 'group_insight'
                        ? settings?.group_insight_count || 0
                        : feature === 'weekly_insight'
                            ? settings?.weekly_insight_count || 0
                            : 0;

            const limit = LIMITS[tier][feature as keyof typeof LIMITS.guest];
            return currentCount < limit;
        },
        [tier, settings]
    );

    const incrementLimit = useCallback(
        async (feature: FeatureName): Promise<boolean> => {
            if (!user) return false;

            // If unlimited, just return true (but maybe we still want to track usage? For now, no.)
            if (tier === 'founder' || tier === 'subscriber') return true;

            if (!checkLimit(feature)) return false;

            try {
                const { data, error } = await supabase.rpc('increment_usage', {
                    feature_name: feature,
                });

                if (error) throw error;

                // Optimistic update handled by subscription, but we can also manually update local state if needed
                // The RPC returns the new count, so we could update state here.
                // For now, rely on the realtime subscription to update the UI.

                return true;
            } catch (error) {
                console.error('Error incrementing usage:', error);
                return false;
            }
        },
        [user, tier, checkLimit]
    );

    return {
        tier,
        isFounder,
        counts: {
            daily_insight: settings?.daily_insight_count || 0,
            group_insight: settings?.group_insight_count || 0,
            weekly_insight: settings?.weekly_insight_count || 0,
        },
        loading,
        refresh: fetchSettings,
        checkLimit,
        incrementLimit,
    };
}

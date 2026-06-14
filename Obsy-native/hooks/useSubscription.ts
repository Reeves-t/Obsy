import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Database } from '../types/supabase.types';

type UserSettings = Database['public']['Tables']['user_settings']['Row'];
// OBS-19: the app recognizes free|plus only. The DB schema mirror
// (types/supabase.types.ts) still lists a legacy 'guest' value and is
// intentionally left untouched (code-only removal); any legacy/unknown stored
// value (including 'guest') is normalized to 'free' by normalizeTier() below.
type SubscriptionTier = 'free' | 'plus';

export type FeatureName = 'daily_insight' | 'group_insight' | 'weekly_insight' | 'premium_tones' | 'topic_chat';

interface SubscriptionState {
    tier: SubscriptionTier;
    counts: {
        daily_insight: number;
        group_insight: number;
        weekly_insight: number;
    };
    loading: boolean;
    refresh: () => Promise<void>;
    checkLimit: (feature: FeatureName) => boolean;
    incrementLimit: (feature: FeatureName) => Promise<boolean>;
    getLimits: () => TierLimits;
}

export interface TierLimits {
    daily_insight: number;
    group_insight: number;
    weekly_insight: number;
    captures_per_day: number;
    max_local_captures: number;
    archive_slots: number;
    cloud_backup: boolean;
}

const LIMITS: Record<SubscriptionTier, TierLimits> = {
    free: {
        daily_insight: 3,
        group_insight: 3,
        weekly_insight: 3,
        captures_per_day: 10,
        max_local_captures: 200,
        archive_slots: 30,
        cloud_backup: false,
    },
    plus: {
        daily_insight: Infinity,
        group_insight: Infinity,
        weekly_insight: Infinity,
        captures_per_day: Infinity,
        max_local_captures: Infinity,
        archive_slots: 150,
        cloud_backup: true,
    },
};

// Tiers that existed before the free|plus collapse (OBS-10, commit cd28dec). A
// user_settings row can still carry one of these if the collapse migration
// (20260610_collapse_tiers_remove_founder) hasn't been applied to this database
// yet. They were all paid tiers, so honor them as 'plus'. The legacy 'guest'
// value (OBS-19) is NOT listed here, so it falls through to the safe 'free'
// default below — as does any other unrecognized value. This guarantees the
// value is always a real key of LIMITS so an unexpected tier can never crash
// the app (previously LIMITS[tier] would be undefined and throw on access).
const LEGACY_PAID_TIERS = new Set(['founder', 'subscriber', 'lifetime', 'premium', 'pro']);

export function normalizeTier(tier: string | null | undefined): SubscriptionTier {
    if (tier && tier in LIMITS) return tier as SubscriptionTier;
    if (tier && LEGACY_PAID_TIERS.has(tier)) return 'plus';
    return 'free';
}

/**
 * Get limits for a specific tier. Exported for use in other modules.
 * Unknown/legacy tier values are normalized to a valid tier first.
 */
export function getTierLimits(tier: SubscriptionTier): TierLimits {
    return LIMITS[normalizeTier(tier)];
}

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

    // Determine tier. No session is treated as 'free' (OBS-19: the guest tier
    // was removed). For signed-in users, normalize the stored tier (handles
    // legacy/unknown values so LIMITS[tier] is always valid).
    const tier: SubscriptionTier = !user
        ? 'free'
        : normalizeTier(settings?.subscription_tier);
    const checkLimit = useCallback(
        (feature: FeatureName): boolean => {
            // While loading, be optimistic and allow the action
            // This prevents blocking Plus members while settings are being fetched
            if (loading && user) return true;

            if (tier === 'plus') return true;
            // Remaining tier is 'free': Plus-only features are blocked.
            if (feature === 'premium_tones') return false;
            if (feature === 'topic_chat') return false;

            const currentCount =
                feature === 'daily_insight'
                    ? settings?.daily_insight_count || 0
                    : feature === 'group_insight'
                        ? settings?.group_insight_count || 0
                        : feature === 'weekly_insight'
                            ? settings?.weekly_insight_count || 0
                            : 0;

            // Premium-only features returned above; the remaining FeatureNames are
            // all numeric-limit keys of TierLimits.
            const limit = LIMITS[tier][feature as 'daily_insight' | 'group_insight' | 'weekly_insight'];
            return currentCount < limit;
        },
        [tier, settings, loading, user]
    );

    const incrementLimit = useCallback(
        async (feature: FeatureName): Promise<boolean> => {
            if (!user) return false;

            // If unlimited, just return true (but maybe we still want to track usage? For now, no.)
            if (tier === 'plus') return true;

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

    const getLimits = useCallback(() => LIMITS[tier], [tier]);

    return {
        tier,
        counts: {
            daily_insight: settings?.daily_insight_count || 0,
            group_insight: settings?.group_insight_count || 0,
            weekly_insight: settings?.weekly_insight_count || 0,
        },
        loading,
        refresh: fetchSettings,
        checkLimit,
        incrementLimit,
        getLimits,
    };
}

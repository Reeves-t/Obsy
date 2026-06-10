-- OBS-10 Cluster B: collapse subscription tiers to (free | plus) and remove the
-- founder / lifetime path. Board decision (2026-06-10): a single paid tier "Plus"
-- ($6/mo, annual -20%), no founder, no lifetime.
--
-- App-side changes ship in the same PR (VanguardPaywall, useSubscription, types,
-- feature gates). Entitlement is written server-side by the RevenueCat webhook
-- (tracked in the server-side-entitlement child issue); this migration only
-- collapses the allowed values + retires the founder flag.

-- 1. Migrate existing rows to the collapsed tier set.
--    founder/subscriber -> plus; any stray guest -> free (guest is a no-session
--    runtime state and is never persisted at rest).
UPDATE public.user_settings SET subscription_tier = 'plus'
  WHERE subscription_tier IN ('founder', 'subscriber');
UPDATE public.user_settings SET subscription_tier = 'free'
  WHERE subscription_tier = 'guest' OR subscription_tier IS NULL;

-- 2. Replace the tier CHECK constraint with the collapsed set.
ALTER TABLE public.user_settings DROP CONSTRAINT IF EXISTS check_subscription_tier;
ALTER TABLE public.user_settings
  ADD CONSTRAINT check_subscription_tier CHECK (subscription_tier IN ('free', 'plus'));

-- 3. Remove the founder flag entirely (entitlement is now just free|plus).
ALTER TABLE public.user_settings DROP COLUMN IF EXISTS is_founder;

-- 4. Retire the fabricated founder scarcity counter row.
DELETE FROM public.system_stats WHERE key = 'founder_count';

-- 5. Update the custom-tone limit trigger: the paid tier is now 'plus'
--    (was 'founder'/'subscriber' in 20260107_custom_ai_tones.sql).
CREATE OR REPLACE FUNCTION public.check_custom_tone_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    tone_count integer;
    user_tier text;
    max_tones integer;
BEGIN
    SELECT subscription_tier INTO user_tier
    FROM public.user_settings WHERE user_id = NEW.user_id;

    IF user_tier = 'plus' THEN
        max_tones := 5;
    ELSE
        max_tones := 1;
    END IF;

    SELECT COUNT(*) INTO tone_count
    FROM public.custom_ai_tones WHERE user_id = NEW.user_id;

    IF tone_count >= max_tones THEN
        RAISE EXCEPTION 'Custom tone limit reached for user % (max %)', NEW.user_id, max_tones
        USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

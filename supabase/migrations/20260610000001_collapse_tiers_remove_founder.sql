-- OBS-10 Cluster B: collapse subscription tiers to (free | plus) and remove the
-- founder / lifetime path. Board decision (2026-06-10): a single paid tier "Plus"
-- ($6/mo, annual -20%), no founder, no lifetime.
--
-- App-side changes ship in the same PR (VanguardPaywall, useSubscription, types,
-- feature gates). Entitlement is written server-side by the RevenueCat webhook
-- (tracked in the server-side-entitlement child issue); this migration only
-- collapses the allowed values + retires the founder flag.

-- 1. Drop the OLD tier CHECK constraint FIRST. The pre-collapse constraint on
--    this DB permits the legacy set (free/founder/subscriber/...) but NOT 'plus',
--    so it must be removed before the UPDATEs below can rewrite rows to 'plus'.
ALTER TABLE public.user_settings DROP CONSTRAINT IF EXISTS check_subscription_tier;

-- 2. Migrate existing rows to the collapsed tier set.
--    founder/subscriber/lifetime -> plus (all were paid tiers). Any remaining
--    value that isn't already free|plus (guest, NULL, or anything stray) -> free.
--    guest is a no-session runtime state and is never persisted at rest. The
--    second UPDATE is a catch-all so the CHECK constraint added below can never
--    fail on unexpected legacy data.
UPDATE public.user_settings SET subscription_tier = 'plus'
  WHERE subscription_tier IN ('founder', 'subscriber', 'lifetime');
UPDATE public.user_settings SET subscription_tier = 'free'
  WHERE subscription_tier IS NULL OR subscription_tier NOT IN ('free', 'plus');

-- 3. Add the collapsed-set CHECK constraint (all rows are now free|plus).
ALTER TABLE public.user_settings
  ADD CONSTRAINT check_subscription_tier CHECK (subscription_tier IN ('free', 'plus'));

-- 4. Remove the founder flag entirely (entitlement is now just free|plus).
ALTER TABLE public.user_settings DROP COLUMN IF EXISTS is_founder;

-- 5. Retire the fabricated founder scarcity counter row. Guarded so a remote
--    without the system_stats table (it predates this folder's tracked history)
--    cannot abort the migration.
DO $$ BEGIN
  IF to_regclass('public.system_stats') IS NOT NULL THEN
    DELETE FROM public.system_stats WHERE key = 'founder_count';
  END IF;
END $$;

-- 6. Update the custom-tone limit trigger: the paid tier is now 'plus'
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

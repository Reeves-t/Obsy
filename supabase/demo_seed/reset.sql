-- ============================================================================
-- Obsy — demo seed RESET (INN-3)
-- ============================================================================
-- Removes ALL demo rows for a single user_id and returns the account to a clean
-- 'free' state. Scoped strictly to ONE user_id — never touches other users.
--
-- This does NOT delete the auth user itself, and it does NOT delete the photo
-- objects in the `entries` storage bucket. To remove the demo photos too, run:
--   ./upload_demo_photos.sh --delete
--
-- HOW TO RUN:
--   psql "$OBSY_DB_URL" -v demo_user="<DEMO_USER_UUID>" -f reset.sql
--   (pass the bare uuid — the script quotes it via :'demo_user')
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Assert service-role claim so we are allowed to flip subscription_tier back.
SELECT set_config('request.jwt.claim.role', 'service_role', true);
-- Stash the target user id in a GUC so the guarded DO block below can read it.
SELECT set_config('demo.user_id', :'demo_user', true);

DELETE FROM public.recommendations   WHERE user_id = :'demo_user'::uuid;
DELETE FROM public.observed_patterns WHERE user_id = :'demo_user'::uuid;
DELETE FROM public.daily_insights    WHERE user_id = :'demo_user'::uuid;
DELETE FROM public.entries           WHERE user_id = :'demo_user'::uuid;
DELETE FROM public.moods             WHERE user_id = :'demo_user'::uuid AND type = 'custom';

-- Best-effort cleanup of device-generated aggregates, if present. Guarded so a
-- missing table never aborts the reset.
DO $$
BEGIN
  IF to_regclass('public.daily_mood_flows') IS NOT NULL THEN
    DELETE FROM public.daily_mood_flows WHERE user_id = (current_setting('demo.user_id'))::uuid;
  END IF;
EXCEPTION WHEN undefined_object THEN
  -- demo.user_id GUC not set; skip (these tables are also fine to leave — they
  -- regenerate from entries, which are now gone).
  NULL;
END $$;

-- Return the account to free.
UPDATE public.user_settings
   SET subscription_tier = 'free',
       is_premium = false,
       premium_until = NULL,
       updated_at = now()
 WHERE user_id = :'demo_user'::uuid;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verify:
--   SELECT count(*) FROM public.entries WHERE user_id = :'demo_user'::uuid;          -- expect 0
--   SELECT subscription_tier FROM public.user_settings WHERE user_id = :'demo_user'::uuid;  -- expect free

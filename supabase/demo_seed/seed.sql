-- ============================================================================
-- Obsy — App Store screenshot demo seed (INN-3)
-- ============================================================================
-- Seeds a SINGLE demo user with clean, realistic, NON-PII data so screenshots
-- look polished. Idempotent + repeatable: it wipes any prior demo rows for the
-- target user first, then re-inserts, so you can run it as many times as you
-- like. Scoped strictly to ONE user_id — it never touches other users' data.
--
-- WHAT THIS SEEDS (high-confidence, stable columns only):
--   * user_settings  -> subscription_tier = 'plus' (+ legacy is_premium flag)  => Plus unlocked
--   * moods          -> 2 custom moods (for variety in the mood views)
--   * entries        -> ~14 captures across ~12 days, varied moods/source types,
--                       3 of them reference a photo in the private `entries` bucket
--   * daily_insights -> a few narrative insight cards
--   * observed_patterns -> one "patterns noticed" row
--   * recommendations   -> a few gentle suggestions
--
-- WHAT IS *NOT* SEEDED HERE (generated on-device or stored client-side — see README):
--   * daily_mood_flows / monthly summaries / year-in-pixels  (app computes these
--     from the seeded entries; their jsonb shape is owned by the client stores)
--   * Topics            (persisted in AsyncStorage on the device, not in Postgres)
--   * Live "Today"/weekly/monthly AI insights (regenerate on device from entries)
--
-- PHOTOS: entries.photo_path points at `<demo_user>/<file>` in the PRIVATE
-- `entries` bucket; the app serves them via short-lived signed URLs. Upload the
-- bitmaps with ./upload_demo_photos.sh BEFORE/AFTER running this — order does not
-- matter, the photo just won't render until the object exists.
--
-- HOW TO RUN (see README.md for full setup):
--   psql "$OBSY_DB_URL" -v demo_user="<DEMO_USER_UUID>" -f seed.sql
--   (pass the bare uuid — the script quotes it via :'demo_user')
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- The subscription_tier guard trigger (20260610000002) blocks any client-side
-- change to subscription_tier unless auth.role() = 'service_role'. auth.role()
-- reads the request.jwt.claim.role GUC, so we assert the service-role claim for
-- THIS transaction only. This works whether you connect as the service role or
-- as the Postgres superuser via the pooler/direct connection string.
SELECT set_config('request.jwt.claim.role', 'service_role', true);

-- --------------------------------------------------------------------------
-- 0. Clean slate for THIS demo user only (makes the seed idempotent)
-- --------------------------------------------------------------------------
DELETE FROM public.recommendations   WHERE user_id = :'demo_user'::uuid;
DELETE FROM public.observed_patterns WHERE user_id = :'demo_user'::uuid;
DELETE FROM public.daily_insights    WHERE user_id = :'demo_user'::uuid;
DELETE FROM public.entries           WHERE user_id = :'demo_user'::uuid;
DELETE FROM public.moods             WHERE user_id = :'demo_user'::uuid AND type = 'custom';

-- --------------------------------------------------------------------------
-- 1. Custom moods (for the mood/topic views) — clearly synthetic labels
-- --------------------------------------------------------------------------
INSERT INTO public.moods (id, name, type, user_id, gradient_from, gradient_mid, gradient_to, color_pool_id)
VALUES
  ('custom_demo_cozy',   'Cozy',   'custom', :'demo_user'::uuid, '#F6C89F', '#E8A87C', '#C97C5D', 'custom_pool_1'),
  ('custom_demo_dreamy', 'Dreamy', 'custom', :'demo_user'::uuid, '#A8C0FF', '#8E9CF0', '#6A6CE0', 'custom_pool_2');

-- --------------------------------------------------------------------------
-- 2. Entries — the timeline. Recent-relative dates so screenshots look current.
--    mood        = mood id (system id, or one of the custom ids above)
--    mood_name_snapshot = display label (always set, so it renders even if the
--                         device-side mood cache hasn't loaded the custom mood)
--    photo_path  = '<demo_user>/<file>'  (private bucket, served via signed URL)
-- --------------------------------------------------------------------------
INSERT INTO public.entries
  (user_id, mood, mood_name_snapshot, note, ai_summary, photo_path, tags,
   include_in_insights, use_photo_for_insight, source_type, captured_at, day_date, created_at)
VALUES
  -- today
  (:'demo_user'::uuid, 'grateful', 'Grateful',
   'Slow morning with coffee and a window full of rain. Letting the day arrive on its own time.',
   'A calm, grateful start — you gave yourself room to breathe before the day began.',
   :'demo_user' || '/demo_morning.jpg', ARRAY['morning','coffee','calm'],
   true, true, 'capture', now() - interval '2 hours', (now())::date, now() - interval '2 hours'),

  (:'demo_user'::uuid, 'focused', 'Focused',
   'Deep work block on the new design. Phone in the other room. Two hours felt like twenty minutes.',
   'Focused and in flow — removing distractions paid off.',
   NULL, ARRAY['work','flow','focus'],
   true, false, 'capture', now() - interval '6 hours', (now())::date, now() - interval '6 hours'),

  -- yesterday
  (:'demo_user'::uuid, 'joyful', 'Joyful',
   'Long walk by the harbour at golden hour. The light on the water was unreal.',
   'Joyful and present — nature and good light lifted the whole evening.',
   :'demo_user' || '/demo_harbour.jpg', ARRAY['outdoors','walk','goldenhour'],
   true, true, 'capture', now() - interval '1 day 3 hours', (now() - interval '1 day')::date, now() - interval '1 day 3 hours'),

  (:'demo_user'::uuid, 'custom_demo_cozy', 'Cozy',
   'Made soup, lit a candle, read a few chapters. A quiet kind of happy.',
   'A cozy wind-down — small rituals helped you feel settled.',
   NULL, ARRAY['evening','home','reading'],
   true, false, 'journal', now() - interval '1 day 9 hours', (now() - interval '1 day')::date, now() - interval '1 day 9 hours'),

  -- 2 days ago
  (:'demo_user'::uuid, 'inspired', 'Inspired',
   'Sketched three ideas for the side project on the train. Couldn''t write them down fast enough.',
   'Inspired and generative — momentum is building on the side project.',
   NULL, ARRAY['ideas','creative','commute'],
   true, false, 'capture', now() - interval '2 days 5 hours', (now() - interval '2 days')::date, now() - interval '2 days 5 hours'),

  (:'demo_user'::uuid, 'tired', 'Tired',
   'Pushed too hard today. Noting it so I remember to rest tomorrow.',
   'Tired but self-aware — you noticed the limit instead of ignoring it.',
   NULL, ARRAY['rest','boundaries'],
   true, false, 'journal', now() - interval '2 days 11 hours', (now() - interval '2 days')::date, now() - interval '2 days 11 hours'),

  -- 3 days ago
  (:'demo_user'::uuid, 'social', 'Social',
   'Dinner with old friends. Laughed until my face hurt. Worth staying out late for.',
   'Socially recharged — connection was the highlight of the week so far.',
   :'demo_user' || '/demo_dinner.jpg', ARRAY['friends','dinner','connection'],
   true, true, 'capture', now() - interval '3 days 4 hours', (now() - interval '3 days')::date, now() - interval '3 days 4 hours'),

  -- 4 days ago
  (:'demo_user'::uuid, 'calm', 'Calm',
   'Morning yoga and a clear to-do list. Everything felt manageable.',
   'Calm and organised — a grounded start set the tone.',
   NULL, ARRAY['yoga','morning','calm'],
   true, false, 'capture', now() - interval '4 days 2 hours', (now() - interval '4 days')::date, now() - interval '4 days 2 hours'),

  (:'demo_user'::uuid, 'curious', 'Curious',
   'Fell down a rabbit hole reading about deep-sea creatures. The ocean is so strange.',
   'Curiosity-led — you followed an interest just because it was interesting.',
   NULL, ARRAY['learning','curiosity'],
   true, false, 'capture', now() - interval '4 days 8 hours', (now() - interval '4 days')::date, now() - interval '4 days 8 hours'),

  -- 6 days ago
  (:'demo_user'::uuid, 'anxious', 'Anxious',
   'Nervous before the presentation. Wrote down what I could and couldn''t control.',
   'Anxious but proactive — naming the controllables eased the pressure.',
   NULL, ARRAY['work','nerves'],
   true, false, 'journal', now() - interval '6 days 6 hours', (now() - interval '6 days')::date, now() - interval '6 days 6 hours'),

  (:'demo_user'::uuid, 'confident', 'Confident',
   'Presentation went well. The prep showed. Treated myself to a good coffee after.',
   'Confidence earned — preparation turned nerves into a win.',
   NULL, ARRAY['work','win'],
   true, false, 'capture', now() - interval '6 days 2 hours', (now() - interval '6 days')::date, now() - interval '6 days 2 hours'),

  -- 8 days ago
  (:'demo_user'::uuid, 'custom_demo_dreamy', 'Dreamy',
   'Stayed up watching the meteor shower from the roof. Lost track of time completely.',
   'A dreamy, expansive night — you let yourself be small under a big sky.',
   NULL, ARRAY['night','sky','wonder'],
   true, false, 'capture', now() - interval '8 days 14 hours', (now() - interval '8 days')::date, now() - interval '8 days 14 hours'),

  -- 10 days ago
  (:'demo_user'::uuid, 'reflective', 'Reflective',
   'Looked back at last month''s notes. I''ve come further than it feels day to day.',
   'Reflective and kind to yourself — progress is clearer in hindsight.',
   NULL, ARRAY['reflection','growth'],
   true, false, 'journal', now() - interval '10 days 7 hours', (now() - interval '10 days')::date, now() - interval '10 days 7 hours'),

  -- 12 days ago
  (:'demo_user'::uuid, 'hopeful', 'Hopeful',
   'Started a small morning routine. Day one of something I want to keep.',
   'Hopeful beginnings — a small, repeatable step toward the habit you want.',
   NULL, ARRAY['habit','morning','start'],
   true, false, 'capture', now() - interval '12 days 1 hour', (now() - interval '12 days')::date, now() - interval '12 days 1 hour');

-- --------------------------------------------------------------------------
-- 3. Daily insight cards (insights screen) — narrative text, clearly synthetic
-- --------------------------------------------------------------------------
INSERT INTO public.daily_insights (user_id, insight_date, narrative_text)
VALUES
  (:'demo_user'::uuid, (now())::date,
   'Today leaned calm and grateful. You started slow on purpose and protected a focused work block — a pairing that tends to leave you steadier by evening.'),
  (:'demo_user'::uuid, (now() - interval '1 day')::date,
   'Yesterday was bright and outward-facing. A walk at golden hour and a cozy night in bookended the day — movement early, softness late.'),
  (:'demo_user'::uuid, (now() - interval '3 days')::date,
   'Connection was the throughline. Time with friends lifted your mood noticeably, and it carried into the next morning.')
ON CONFLICT (user_id, insight_date) DO UPDATE SET narrative_text = EXCLUDED.narrative_text;

-- --------------------------------------------------------------------------
-- 4. Observed patterns (one row per user) — the "patterns noticed" surface
-- --------------------------------------------------------------------------
INSERT INTO public.observed_patterns (user_id, pattern_text, eligible_capture_count, generation_number)
VALUES
  (:'demo_user'::uuid,
   'Your steadiest days start slow — mornings with coffee, yoga, or a short routine tend to be followed by focused, grateful entries. The harder days are usually the ones that begin already rushed.',
   14, 1)
ON CONFLICT (user_id) DO UPDATE
  SET pattern_text = EXCLUDED.pattern_text,
      eligible_capture_count = EXCLUDED.eligible_capture_count,
      generation_number = public.observed_patterns.generation_number + 1,
      updated_at = now();

-- --------------------------------------------------------------------------
-- 5. Recommendations — gentle, generic suggestions (no PII)
-- --------------------------------------------------------------------------
INSERT INTO public.recommendations (user_id, message)
VALUES
  (:'demo_user'::uuid, 'You tend to feel best after a slow morning. Try protecting the first 20 minutes of tomorrow before checking your phone.'),
  (:'demo_user'::uuid, 'Walks keep showing up on your brightest days. A short one this evening might be worth it.'),
  (:'demo_user'::uuid, 'Connection lifted you this week. Reaching out to one person you enjoyed seeing could carry that forward.');

-- --------------------------------------------------------------------------
-- 6. Plus unlocked — set the tier server-side (guarded). Belt-and-suspenders:
--    also set the legacy is_premium flag + a far-future premium_until.
--    Upsert so it works whether or not the signup trigger already created the row.
-- --------------------------------------------------------------------------
INSERT INTO public.user_settings
  (user_id, subscription_tier, is_premium, premium_until, ai_tone,
   daily_insight_count, weekly_insight_count, group_insight_count, updated_at)
VALUES
  (:'demo_user'::uuid, 'plus', true, now() + interval '10 years', 'warm',
   0, 0, 0, now())
ON CONFLICT (user_id) DO UPDATE
  SET subscription_tier = 'plus',
      is_premium = true,
      premium_until = now() + interval '10 years',
      daily_insight_count = 0,
      weekly_insight_count = 0,
      group_insight_count = 0,
      updated_at = now();

-- Make PostgREST pick up any cached schema state immediately.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- Quick verification (run after commit):
--   SELECT subscription_tier, is_premium FROM public.user_settings WHERE user_id = :'demo_user'::uuid;
--   SELECT count(*) AS entries, count(photo_path) AS with_photos FROM public.entries WHERE user_id = :'demo_user'::uuid;
--   SELECT count(*) FROM public.daily_insights WHERE user_id = :'demo_user'::uuid;

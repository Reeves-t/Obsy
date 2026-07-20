-- Migration: Add Unpack (guided reflection) entry support
-- Adds:
--   1. entries.unpack_payload jsonb — the guided-reflection trail (original input,
--      clarifying questions/answers, themes, insight signals).
--   2. 'unpack' to the entries.source_type CHECK constraint.
--   3. user_settings.unpack_count — daily usage counter (Plus limit: 10/day),
--      wired into the shared check_and_reset_limits / increment_usage RPCs.
--
-- Written idempotently so it can be applied via the SQL editor if `db push`
-- is blocked by prod migration drift.

-- ============================================================================
-- 1. UNPACK PAYLOAD COLUMN
-- ============================================================================

ALTER TABLE public.entries
ADD COLUMN IF NOT EXISTS unpack_payload jsonb;

COMMENT ON COLUMN public.entries.unpack_payload IS 'Guided-reflection (Unpack) trail: original input, clarifying questions/answers, themes, insight signals. Present only for source_type = ''unpack''.';

-- ============================================================================
-- 2. EXTEND source_type CHECK CONSTRAINT TO INCLUDE 'unpack'
-- ============================================================================

-- The validate_entry_mood_trigger re-validates mood on any UPDATE; some legacy
-- rows have orphaned mood references that would block a backfill, so we disable
-- it around the (defensive) normalization, matching 20260512_add_shared_link_entries.sql.
ALTER TABLE public.entries DISABLE TRIGGER validate_entry_mood_trigger;

UPDATE public.entries
SET source_type = 'capture'
WHERE source_type IS NOT NULL
  AND source_type NOT IN ('capture', 'journal', 'voice', 'shared_link', 'unpack');

ALTER TABLE public.entries ENABLE TRIGGER validate_entry_mood_trigger;

ALTER TABLE public.entries
DROP CONSTRAINT IF EXISTS entries_source_type_check;

ALTER TABLE public.entries
ADD CONSTRAINT entries_source_type_check
CHECK (source_type IN ('capture', 'journal', 'voice', 'shared_link', 'unpack'));

-- ============================================================================
-- 3. DAILY USAGE COUNTER FOR UNPACK (Plus: 10/day, enforced in edge function)
-- ============================================================================

ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS unpack_count int DEFAULT 0;

COMMENT ON COLUMN public.user_settings.unpack_count IS 'Unpack reflections generated today. Reset daily by check_and_reset_limits.';

-- Re-create the shared daily-reset function to also zero unpack_count.
-- (Body copied from 20260615000002_mood_signal_interpretation_limits.sql + unpack.)
CREATE OR REPLACE FUNCTION public.check_and_reset_limits(user_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    user_reset_date date;
BEGIN
    SELECT last_reset_date INTO user_reset_date
    FROM public.user_settings
    WHERE user_id = user_uuid;

    IF user_reset_date < CURRENT_DATE THEN
        UPDATE public.user_settings
        SET
            daily_insight_count = 0,
            group_insight_count = 0,
            weekly_insight_count = 0,
            topic_pulse_count = 0,
            mood_signal_count = 0,
            unpack_count = 0,
            last_reset_date = CURRENT_DATE
        WHERE user_id = user_uuid;
    END IF;
END;
$$;

-- Re-create increment_usage to accept the 'unpack' feature.
CREATE OR REPLACE FUNCTION public.increment_usage(
    feature_name text
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    current_count int;
    col_name text;
BEGIN
    PERFORM public.check_and_reset_limits(auth.uid());

    IF feature_name = 'daily_insight' THEN
        col_name := 'daily_insight_count';
    ELSIF feature_name = 'group_insight' THEN
        col_name := 'group_insight_count';
    ELSIF feature_name = 'weekly_insight' THEN
        col_name := 'weekly_insight_count';
    ELSIF feature_name = 'topic_pulse' THEN
        col_name := 'topic_pulse_count';
    ELSIF feature_name = 'mood_signal' THEN
        col_name := 'mood_signal_count';
    ELSIF feature_name = 'unpack' THEN
        col_name := 'unpack_count';
    ELSE
        RAISE EXCEPTION 'Invalid feature name';
    END IF;

    EXECUTE format('UPDATE public.user_settings SET %I = %I + 1 WHERE user_id = $1 RETURNING %I', col_name, col_name, col_name)
    INTO current_count
    USING auth.uid();

    RETURN current_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_and_reset_limits(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_usage(text) TO authenticated;

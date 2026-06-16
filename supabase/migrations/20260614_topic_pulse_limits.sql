-- Migration: Topic Pulse daily limits
-- Adds a per-day usage counter for the DeepSeek-powered "Topic Pulse" engager and
-- wires it into the existing lazy daily-reset / increment functions.
-- Limits are enforced in the edge function (free: 1/day, plus: 5/day).
--
-- The check_and_reset_limits / increment_usage functions originated in
-- 20251217_vanguard_schema.sql; this migration re-creates them with the existing
-- behavior plus topic_pulse handling. The separate capture-limit functions
-- (increment_capture_count / check_and_reset_capture_limits) are untouched.

-- 1. New counter column.
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS topic_pulse_count int DEFAULT 0;

COMMENT ON COLUMN public.user_settings.topic_pulse_count IS 'Topic Pulse generations used today. Reset daily by check_and_reset_limits.';

-- 2. Reset function: include topic_pulse_count in the daily reset.
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

    -- If the last reset date is not today, reset counts and update date
    IF user_reset_date < CURRENT_DATE THEN
        UPDATE public.user_settings
        SET
            daily_insight_count = 0,
            group_insight_count = 0,
            weekly_insight_count = 0,
            topic_pulse_count = 0,
            last_reset_date = CURRENT_DATE
        WHERE user_id = user_uuid;
    END IF;
END;
$$;

-- 3. Increment function: support the 'topic_pulse' feature.
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
    -- First, ensure limits are reset if it's a new day
    PERFORM public.check_and_reset_limits(auth.uid());

    -- Determine which column to increment
    IF feature_name = 'daily_insight' THEN
        col_name := 'daily_insight_count';
    ELSIF feature_name = 'group_insight' THEN
        col_name := 'group_insight_count';
    ELSIF feature_name = 'weekly_insight' THEN
        col_name := 'weekly_insight_count';
    ELSIF feature_name = 'topic_pulse' THEN
        col_name := 'topic_pulse_count';
    ELSE
        RAISE EXCEPTION 'Invalid feature name';
    END IF;

    -- Dynamic SQL to increment the count
    EXECUTE format('UPDATE public.user_settings SET %I = %I + 1 WHERE user_id = $1 RETURNING %I', col_name, col_name, col_name)
    INTO current_count
    USING auth.uid();

    RETURN current_count;
END;
$$;

-- 4. Ensure authenticated users can execute the limit functions.
GRANT EXECUTE ON FUNCTION public.check_and_reset_limits(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_usage(text) TO authenticated;

-- Migration: Mood Connection Dial interpretation daily limits
-- Adds a separate daily counter for selected-mood connection interpretations.
-- Limits are enforced in the shared mood interpretation edge function
-- (free: 3/day, plus: 10/day).

ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS mood_connection_count int DEFAULT 0;

COMMENT ON COLUMN public.user_settings.mood_connection_count IS 'Mood Connection Dial interpretation refreshes used today. Reset daily by check_and_reset_limits.';

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
            mood_connection_count = 0,
            last_reset_date = CURRENT_DATE
        WHERE user_id = user_uuid;
    END IF;
END;
$$;

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
    ELSIF feature_name = 'mood_connection' THEN
        col_name := 'mood_connection_count';
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

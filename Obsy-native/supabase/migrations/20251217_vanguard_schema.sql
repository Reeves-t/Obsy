-- Migration: Vanguard Launch Strategy Schema
-- Description: Adds subscription tiers, usage counts, and system stats for scarcity tracking.

-- =============================================================================
-- 1. UPDATE USER_SETTINGS TABLE
-- =============================================================================

-- Add new columns for subscription and usage tracking
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS subscription_tier text DEFAULT 'free',
ADD COLUMN IF NOT EXISTS is_founder boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS daily_insight_count int DEFAULT 0,
ADD COLUMN IF NOT EXISTS group_insight_count int DEFAULT 0,
ADD COLUMN IF NOT EXISTS weekly_insight_count int DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_reset_date date DEFAULT CURRENT_DATE;

-- Add constraint for subscription tiers
ALTER TABLE public.user_settings
ADD CONSTRAINT check_subscription_tier 
CHECK (subscription_tier IN ('guest', 'free', 'founder', 'subscriber'));

-- =============================================================================
-- 2. SYSTEM_STATS TABLE (For Scarcity Tracking)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.system_stats (
    key text PRIMARY KEY,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.system_stats ENABLE ROW LEVEL SECURITY;

-- Allow everyone to read system stats (needed for the progress bar)
CREATE POLICY "Everyone can read system stats" ON public.system_stats
    FOR SELECT
    USING (true);

-- Only service role can update (we'll use a function for safe increments if needed later)
-- For MVP, we might manually update or use a secure function.

-- Insert initial founder count if not exists
INSERT INTO public.system_stats (key, value)
VALUES ('founder_count', '{"count": 0, "max": 1000}')
ON CONFLICT (key) DO NOTHING;

-- =============================================================================
-- 3. FUNCTIONS FOR LIMIT MANAGEMENT
-- =============================================================================

-- Function to check and reset daily limits
-- This is a "lazy" reset: it checks the date when the user tries to do something.
CREATE OR REPLACE FUNCTION public.check_and_reset_limits(user_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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
            last_reset_date = CURRENT_DATE
        WHERE user_id = user_uuid;
    END IF;
END;
$$;

-- Function to safely increment usage
-- Returns true if increment was successful (under limit), false otherwise.
-- Note: The actual limit check logic is better handled in application code or a more complex function.
-- This function just handles the increment and reset check.
CREATE OR REPLACE FUNCTION public.increment_usage(
    feature_name text
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
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

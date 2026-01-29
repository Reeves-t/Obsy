-- Migration: Add capture limit tracking columns to user_settings
-- Purpose: Track daily capture counts for tier-based limit enforcement
-- Date: 2026-01-29

-- =============================================================================
-- 1. ADD CAPTURE LIMIT TRACKING COLUMNS
-- =============================================================================

-- Track daily capture count for limit enforcement
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS daily_capture_count INTEGER DEFAULT 0;

-- Track when the capture count was last reset
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS capture_count_reset_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Add comments for clarity
COMMENT ON COLUMN public.user_settings.daily_capture_count IS 'Number of captures created today. Reset daily.';
COMMENT ON COLUMN public.user_settings.capture_count_reset_at IS 'Timestamp of last daily capture count reset.';

-- =============================================================================
-- 2. CREATE RESET FUNCTION FOR CAPTURE LIMITS
-- =============================================================================

-- Function to check and reset capture limits (similar to insight limits)
CREATE OR REPLACE FUNCTION public.check_and_reset_capture_limits(user_uuid UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    UPDATE public.user_settings
    SET 
        daily_capture_count = 0,
        capture_count_reset_at = NOW()
    WHERE user_id = user_uuid
    AND capture_count_reset_at < CURRENT_DATE;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.check_and_reset_capture_limits(UUID) TO authenticated;

-- =============================================================================
-- 3. CREATE INCREMENT FUNCTION FOR CAPTURE COUNT
-- =============================================================================

-- Function to increment capture count and return new value
CREATE OR REPLACE FUNCTION public.increment_capture_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    new_count INTEGER;
BEGIN
    -- First reset if needed
    PERFORM public.check_and_reset_capture_limits(auth.uid());
    
    -- Increment and return new count
    UPDATE public.user_settings
    SET daily_capture_count = daily_capture_count + 1
    WHERE user_id = auth.uid()
    RETURNING daily_capture_count INTO new_count;
    
    RETURN new_count;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.increment_capture_count() TO authenticated;


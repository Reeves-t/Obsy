-- Add month_phrase column to monthly_mood_summaries
-- This column stores a 2-word phrase capturing the month's emotional essence

ALTER TABLE public.monthly_mood_summaries 
ADD COLUMN IF NOT EXISTS month_phrase text;

-- Backfill existing rows with NULL (will be generated on next refresh)
-- No default value needed as generation will happen naturally


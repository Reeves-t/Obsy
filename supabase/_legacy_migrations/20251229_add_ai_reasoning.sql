-- Add ai_reasoning column to monthly_mood_summaries
-- This column stores the bullet-point explanation for the month phrase

ALTER TABLE public.monthly_mood_summaries 
ADD COLUMN IF NOT EXISTS ai_reasoning text;

-- Backfill existing rows with NULL (will be generated on next refresh)
-- No default value needed as generation will happen naturally


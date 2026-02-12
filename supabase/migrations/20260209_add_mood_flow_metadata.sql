-- Add mood flow metadata columns
-- Adds title, subtitle, and confidence to daily_mood_flows table

ALTER TABLE public.daily_mood_flows
ADD COLUMN IF NOT EXISTS title text,
ADD COLUMN IF NOT EXISTS subtitle text,
ADD COLUMN IF NOT EXISTS confidence int;

-- Create index for confidence queries (optional, for future analytics)
CREATE INDEX IF NOT EXISTS idx_daily_mood_flows_confidence ON public.daily_mood_flows(confidence) WHERE confidence IS NOT NULL;

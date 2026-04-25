-- Add gradient color columns to moods table for AI-assigned custom mood colors.
-- System moods use handcrafted gradients from presets.ts; custom moods will
-- now store their AI-generated gradient pair directly in the database.

ALTER TABLE public.moods
ADD COLUMN IF NOT EXISTS gradient_from text,
ADD COLUMN IF NOT EXISTS gradient_to text;

COMMENT ON COLUMN public.moods.gradient_from IS 'Lighter/brighter hex gradient stop (e.g. #FCC832). NULL for system moods (use presets).';
COMMENT ON COLUMN public.moods.gradient_to IS 'Deeper/darker hex gradient stop (e.g. #E8A820). NULL for system moods (use presets).';

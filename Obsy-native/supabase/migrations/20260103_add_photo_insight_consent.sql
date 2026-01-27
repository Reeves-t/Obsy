-- Migration: Add use_photo_for_insight to entries table
-- Description: Adds a boolean flag for per-capture photo insight consent.

ALTER TABLE public.entries 
ADD COLUMN IF NOT EXISTS use_photo_for_insight BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.entries.use_photo_for_insight IS 'Explicit user opt-in for including this capture photo in AI insights.';

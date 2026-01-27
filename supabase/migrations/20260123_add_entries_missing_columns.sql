-- Migration: Add missing columns to entries table
-- Purpose: Adds columns required by captureStore.ts and fixes use_photo_for_insight constraint
-- Columns: include_in_insights, captured_at, day_date, use_photo_for_insight (constraint fix)

-- ============================================================================
-- ADD MISSING COLUMNS
-- ============================================================================

-- Controls whether the capture is included in AI insights generation
ALTER TABLE public.entries
ADD COLUMN IF NOT EXISTS include_in_insights BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.entries.include_in_insights IS 'Controls whether this capture is included in AI insights generation';

-- Stores the precise capture timestamp (distinct from created_at which is the database insertion time)
ALTER TABLE public.entries
ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ NOT NULL DEFAULT now();

COMMENT ON COLUMN public.entries.captured_at IS 'Actual capture timestamp, may differ from created_at due to offline mode';

-- Stores the date portion for efficient day-based queries
ALTER TABLE public.entries
ADD COLUMN IF NOT EXISTS day_date DATE NOT NULL DEFAULT CURRENT_DATE;

COMMENT ON COLUMN public.entries.day_date IS 'Date portion extracted for efficient daily aggregations';

-- ============================================================================
-- FIX use_photo_for_insight CONSTRAINT
-- ============================================================================

-- First, update any NULL values to false for existing rows
UPDATE public.entries
SET use_photo_for_insight = false
WHERE use_photo_for_insight IS NULL;

-- Set the default value for future inserts
ALTER TABLE public.entries
ALTER COLUMN use_photo_for_insight SET DEFAULT false;

-- Add NOT NULL constraint now that all values are populated
ALTER TABLE public.entries
ALTER COLUMN use_photo_for_insight SET NOT NULL;

COMMENT ON COLUMN public.entries.use_photo_for_insight IS 'Explicit user consent for photo analysis in AI insights';


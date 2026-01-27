-- Migration: Update entries table with mood and insight fields
-- Date: 2026-01-26
-- Description: Adds columns to support ID-based moods, historical snapshots, and daily filtering.

-- 1. ADD COLUMNS
ALTER TABLE public.entries 
ADD COLUMN IF NOT EXISTS mood_name_snapshot text,
ADD COLUMN IF NOT EXISTS include_in_insights boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS use_photo_for_insight boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS captured_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
ADD COLUMN IF NOT EXISTS day_date date DEFAULT CURRENT_DATE;

-- 2. CREATE INDEX FOR DAILY FLOWS
CREATE INDEX IF NOT EXISTS entries_user_id_day_date_idx ON public.entries (user_id, day_date);

-- 3. BACKFILL EXISTING DATA
-- Populates the snapshot column with existing mood labels if they aren't IDs
UPDATE public.entries 
SET 
  mood_name_snapshot = COALESCE(mood, 'Neutral'),
  captured_at = created_at,
  day_date = created_at::date
WHERE mood_name_snapshot IS NULL;

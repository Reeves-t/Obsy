-- Migration: Add missing columns to monthly_mood_summaries
-- Purpose: Adds four columns that are used in services/monthlySummaries.ts but missing from the schema
-- Columns: month_to_date_summary, generated_through_date, source_stats, created_at

-- Stores the month-to-date AI-generated summary text
ALTER TABLE public.monthly_mood_summaries 
ADD COLUMN IF NOT EXISTS month_to_date_summary text;

-- Tracks the date through which the summary was generated (e.g., "2026-01-15")
ALTER TABLE public.monthly_mood_summaries 
ADD COLUMN IF NOT EXISTS generated_through_date text;

-- Stores the MonthSignals data structure (JSON) used for generation
ALTER TABLE public.monthly_mood_summaries 
ADD COLUMN IF NOT EXISTS source_stats jsonb;

-- Tracks when the record was first created
ALTER TABLE public.monthly_mood_summaries 
ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- Backfill notes:
-- - Existing rows will have NULL values for month_to_date_summary, generated_through_date, and source_stats
-- - Existing rows will have created_at set to the current timestamp (acceptable since this is a new tracking field)
-- - Values will be populated naturally on next summary generation/refresh


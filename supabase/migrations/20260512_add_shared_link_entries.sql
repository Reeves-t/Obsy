-- Migration: Add shared link entry support to entries table
-- Adds columns for link-based entries and extends source_type to include 'shared_link'

-- ============================================================================
-- ADD SHARED LINK COLUMNS
-- ============================================================================

ALTER TABLE public.entries
ADD COLUMN IF NOT EXISTS shared_link_url TEXT;

COMMENT ON COLUMN public.entries.shared_link_url IS 'Original URL for shared_link source_type entries';

ALTER TABLE public.entries
ADD COLUMN IF NOT EXISTS shared_link_platform TEXT;

COMMENT ON COLUMN public.entries.shared_link_platform IS 'Detected platform: TikTok, YouTube, Reddit, Spotify, Instagram, Web';

ALTER TABLE public.entries
ADD COLUMN IF NOT EXISTS shared_link_title TEXT;

COMMENT ON COLUMN public.entries.shared_link_title IS 'Title parsed from URL path or share payload (no full-page scraping)';

ALTER TABLE public.entries
ADD COLUMN IF NOT EXISTS shared_link_thumbnail_url TEXT;

COMMENT ON COLUMN public.entries.shared_link_thumbnail_url IS 'Optional thumbnail URL for shared link preview card';

-- ============================================================================
-- BACKFILL LEGACY source_type VALUES
-- ============================================================================

-- Older rows (from the original 20251218_world_lens migration) were inserted
-- with source_type = 'regular' before the column was recharacterized as
-- capture/journal/voice. Map any non-conforming value to 'capture' so the
-- CHECK constraint below can be added. NULL is left as-is (CHECK allows NULL).
--
-- The validate_entry_mood_trigger re-validates mood on any UPDATE; some
-- legacy rows have orphaned mood references that would block the backfill,
-- so we temporarily disable the trigger and re-enable it after.
ALTER TABLE public.entries DISABLE TRIGGER validate_entry_mood_trigger;

UPDATE public.entries
SET source_type = 'capture'
WHERE source_type IS NOT NULL
  AND source_type NOT IN ('capture', 'journal', 'voice', 'shared_link');

ALTER TABLE public.entries ENABLE TRIGGER validate_entry_mood_trigger;

-- ============================================================================
-- UPDATE source_type CHECK CONSTRAINT
-- ============================================================================

-- Drop old constraint if it exists, then recreate with shared_link included
ALTER TABLE public.entries
DROP CONSTRAINT IF EXISTS entries_source_type_check;

ALTER TABLE public.entries
ADD CONSTRAINT entries_source_type_check
CHECK (source_type IN ('capture', 'journal', 'voice', 'shared_link'));

-- ============================================================================
-- INDEX for fast filtering by source_type in Entries screen
-- ============================================================================

CREATE INDEX IF NOT EXISTS entries_source_type_idx
ON public.entries (user_id, source_type, created_at DESC);

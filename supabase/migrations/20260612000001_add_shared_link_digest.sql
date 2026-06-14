-- Migration: Add AI digest + media type to shared link entries
-- Stores a Gemini-generated content digest of a shared link (article/video/song),
-- plus the resolved media type. Backfilled title/thumbnail reuse existing columns
-- from 20260512_add_shared_link_entries.sql.

-- ============================================================================
-- ADD SHARED LINK DIGEST COLUMNS
-- ============================================================================

ALTER TABLE public.entries
ADD COLUMN IF NOT EXISTS shared_link_digest TEXT;

COMMENT ON COLUMN public.entries.shared_link_digest IS 'Gemini-generated 1-2 sentence content digest of the shared link (article summary / video summary / song themes+tone). For songs, derived from lyrics but never stores the verbatim lyrics. NULL when the link could not be digested (falls back to platform/title).';

ALTER TABLE public.entries
ADD COLUMN IF NOT EXISTS shared_link_media_type TEXT;

COMMENT ON COLUMN public.entries.shared_link_media_type IS 'Resolved media type for shared links: article | post | video | music | playlist | podcast | social | link';

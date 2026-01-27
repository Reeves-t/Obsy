-- Migration: Ensure Mood Data Integrity
-- Description: Backfill mood_name_snapshot, add constraints, and create validation infrastructure
-- Date: 2026-01-28

-- ============================================================================
-- SECTION A: Backfill mood_name_snapshot
-- ============================================================================
-- This section ensures all entries have a mood_name_snapshot value.
-- Priority: 1) Existing snapshot, 2) Mood name from moods table, 3) Mood ID as fallback

-- First, update entries that have a valid mood reference in the moods table
UPDATE public.entries e
SET mood_name_snapshot = m.name
FROM public.moods m
WHERE e.mood = m.id
  AND e.mood_name_snapshot IS NULL;

-- For entries with custom mood IDs that don't exist in moods table,
-- use the mood ID itself as the snapshot (preserves historical data)
UPDATE public.entries
SET mood_name_snapshot = COALESCE(
    mood_name_snapshot,
    CASE 
        WHEN mood LIKE 'custom_%' THEN 'Custom Mood'
        WHEN mood IS NOT NULL THEN INITCAP(mood)
        ELSE 'Neutral'
    END
)
WHERE mood_name_snapshot IS NULL;

-- ============================================================================
-- SECTION B: Add NOT NULL constraint to mood_name_snapshot
-- ============================================================================
-- After backfilling, ensure the column cannot be NULL going forward

-- Set default value for safety
ALTER TABLE public.entries 
ALTER COLUMN mood_name_snapshot SET DEFAULT 'Neutral';

-- Add NOT NULL constraint
ALTER TABLE public.entries 
ALTER COLUMN mood_name_snapshot SET NOT NULL;

-- Add column comment
COMMENT ON COLUMN public.entries.mood_name_snapshot IS 
'Snapshot of mood name at capture time. Preserved for historical accuracy even if mood is deleted.';

-- ============================================================================
-- SECTION C: Add validation function for mood references
-- ============================================================================
-- This function checks if a mood ID exists in the moods table

CREATE OR REPLACE FUNCTION public.validate_mood_reference(mood_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- NULL mood IDs are considered invalid
    IF mood_id IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Check if mood exists in moods table
    RETURN EXISTS (
        SELECT 1 FROM public.moods 
        WHERE id = mood_id 
        AND deleted_at IS NULL
    );
END;
$$;

COMMENT ON FUNCTION public.validate_mood_reference IS 
'Validates that a mood ID exists in the moods table. Returns false for NULL or non-existent IDs.';

-- ============================================================================
-- SECTION D: Add trigger for insert/update validation (hard validation)
-- ============================================================================
-- This trigger blocks inserts/updates with invalid mood references

CREATE OR REPLACE FUNCTION public.validate_entry_mood()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only validate if mood is provided
    IF NEW.mood IS NOT NULL THEN
        -- Check if mood reference is valid
        IF NOT public.validate_mood_reference(NEW.mood) THEN
            -- Raise exception to block the operation (hard validation)
            RAISE EXCEPTION 'Invalid mood reference: %. Mood does not exist or has been deleted.', NEW.mood
                USING HINT = 'Ensure the mood ID exists in the moods table and has not been soft-deleted.',
                      ERRCODE = 'foreign_key_violation';
        END IF;
    END IF;

    -- Ensure mood_name_snapshot is always populated
    IF NEW.mood_name_snapshot IS NULL OR NEW.mood_name_snapshot = '' THEN
        NEW.mood_name_snapshot := COALESCE(
            (SELECT name FROM public.moods WHERE id = NEW.mood LIMIT 1),
            CASE
                WHEN NEW.mood LIKE 'custom_%' THEN 'Custom Mood'
                WHEN NEW.mood IS NOT NULL THEN INITCAP(NEW.mood)
                ELSE 'Neutral'
            END
        );
    END IF;

    RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS validate_entry_mood_trigger ON public.entries;
CREATE TRIGGER validate_entry_mood_trigger
    BEFORE INSERT OR UPDATE ON public.entries
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_entry_mood();

COMMENT ON TRIGGER validate_entry_mood_trigger ON public.entries IS
'Validates mood references and ensures mood_name_snapshot is populated. Uses hard validation (exceptions block invalid operations).';

-- ============================================================================
-- SECTION E: Create indexes for mood lookups
-- ============================================================================

-- Index on mood column for faster validation queries
CREATE INDEX IF NOT EXISTS idx_entries_mood ON public.entries(mood);

-- Partial index for custom mood queries
CREATE INDEX IF NOT EXISTS idx_entries_custom_moods 
ON public.entries(mood) 
WHERE mood LIKE 'custom_%';

-- ============================================================================
-- SECTION F: Verification queries (run manually to verify migration)
-- ============================================================================
-- These are commented out but can be run to verify the migration worked

-- Check for any NULL mood_name_snapshot values (should return 0)
-- SELECT COUNT(*) FROM public.entries WHERE mood_name_snapshot IS NULL;

-- Check for orphaned mood references
-- SELECT e.id, e.mood, e.mood_name_snapshot 
-- FROM public.entries e 
-- LEFT JOIN public.moods m ON e.mood = m.id 
-- WHERE m.id IS NULL AND e.mood IS NOT NULL;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';


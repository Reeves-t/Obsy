-- Migration: Ensure Mood Validation Functions Exist
-- Description: Idempotent recreation of mood validation infrastructure
-- Date: 2026-01-29
-- Purpose: Fix error 42883 - function validate_mood_reference does not exist

-- Drop existing trigger to allow function recreation
DROP TRIGGER IF EXISTS validate_entry_mood_trigger ON public.entries;

-- Create or replace the mood reference validation function
CREATE OR REPLACE FUNCTION public.validate_mood_reference(mood_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF mood_id IS NULL THEN
        RETURN FALSE;
    END IF;
    
    RETURN EXISTS (
        SELECT 1 FROM public.moods 
        WHERE id = mood_id 
        AND deleted_at IS NULL
    );
END;
$$;

-- Create or replace the entry mood validation trigger function
CREATE OR REPLACE FUNCTION public.validate_entry_mood()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NEW.mood IS NOT NULL THEN
        IF NOT public.validate_mood_reference(NEW.mood) THEN
            RAISE EXCEPTION 'Invalid mood reference: %. Mood does not exist or has been deleted.', NEW.mood
                USING HINT = 'Ensure the mood ID exists in the moods table and has not been soft-deleted.',
                      ERRCODE = 'foreign_key_violation';
        END IF;
    END IF;

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

-- Recreate the trigger
CREATE TRIGGER validate_entry_mood_trigger
    BEFORE INSERT OR UPDATE ON public.entries
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_entry_mood();

-- Verification: Check for orphaned mood references
DO $$
DECLARE
    orphan_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO orphan_count
    FROM public.entries e
    LEFT JOIN public.moods m ON e.mood = m.id
    WHERE e.mood IS NOT NULL AND (m.id IS NULL OR m.deleted_at IS NOT NULL);

    IF orphan_count > 0 THEN
        RAISE WARNING 'Found % entries with orphaned mood references. Run 20260128_handle_orphaned_moods.sql to fix.', orphan_count;
    ELSE
        RAISE NOTICE 'All mood references are valid. Validation infrastructure ready.';
    END IF;
END $$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';


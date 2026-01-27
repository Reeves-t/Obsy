-- Add journal insight types to insights_archive table
-- This migration extends the existing CHECK constraint to include journal-specific insight types
-- Note: For fresh installations, the journal types are already included in 20251204_insights_archive.sql
-- This migration handles upgrading existing databases that have the old constraint

-- Only run if the table exists (for existing databases that need migration)
DO $$
BEGIN
    -- Check if the table exists and has the old constraint
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'insights_archive_type_check'
        AND table_name = 'insights_archive'
    ) THEN
        -- Drop the existing CHECK constraint on type column
        ALTER TABLE public.insights_archive DROP CONSTRAINT IF EXISTS insights_archive_type_check;

        -- Add new CHECK constraint with journal insight types
        ALTER TABLE public.insights_archive
        ADD CONSTRAINT insights_archive_type_check
        CHECK (type IN ('daily', 'weekly', 'monthly', 'album', 'tagging', 'journal_daily', 'journal_weekly', 'journal_monthly'));

        -- Update comment for documentation
        COMMENT ON COLUMN public.insights_archive.type IS 'Insight type: daily, weekly, monthly (photo-based), album, tagging, journal_daily, journal_weekly, journal_monthly (text-only journal insights)';
    END IF;
END $$;

-- Create composite index for efficient journal insight queries (safe to run multiple times)
CREATE INDEX IF NOT EXISTS insights_archive_user_type_created_idx
ON public.insights_archive(user_id, type, created_at DESC);


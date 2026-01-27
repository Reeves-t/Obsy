-- Migration: Handle Orphaned Mood References
-- Description: Identify and fix entries with invalid mood references
-- Date: 2026-01-28
-- Note: Run AFTER 20260128_ensure_mood_data_integrity.sql

-- ============================================================================
-- SECTION A: Identify orphaned entries
-- ============================================================================
-- Query to find all entries where mood does not exist in moods table

DO $$
DECLARE
    orphan_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO orphan_count
    FROM public.entries e
    LEFT JOIN public.moods m ON e.mood = m.id
    WHERE m.id IS NULL AND e.mood IS NOT NULL;
    
    RAISE NOTICE 'Found % entries with orphaned mood references', orphan_count;
END $$;

-- ============================================================================
-- SECTION B: Create fallback system moods for common orphaned IDs
-- ============================================================================
-- Insert any missing common mood IDs as system moods to preserve data integrity

INSERT INTO public.moods (id, name, type, energy_level)
SELECT DISTINCT 
    e.mood as id,
    INITCAP(e.mood) as name,
    'system' as type,
    'medium' as energy_level
FROM public.entries e
LEFT JOIN public.moods m ON e.mood = m.id
WHERE m.id IS NULL 
  AND e.mood IS NOT NULL
  AND e.mood NOT LIKE 'custom_%'
  AND LENGTH(e.mood) <= 50
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- SECTION C: Update orphaned custom moods using snapshots
-- ============================================================================
-- For custom mood IDs that don't exist, create new custom moods if we can
-- identify the user from the entry

INSERT INTO public.moods (id, name, type, user_id, energy_level)
SELECT DISTINCT ON (e.mood)
    e.mood as id,
    COALESCE(e.mood_name_snapshot, 'Custom Mood') as name,
    'custom' as type,
    e.user_id as user_id,
    'medium' as energy_level
FROM public.entries e
LEFT JOIN public.moods m ON e.mood = m.id
WHERE m.id IS NULL 
  AND e.mood IS NOT NULL
  AND e.mood LIKE 'custom_%'
  AND e.user_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- SECTION D: Final cleanup - handle remaining orphaned entries
-- ============================================================================
-- For any entries still without valid mood references:
-- 1. Preserve the original mood value in mood_name_snapshot (if not already set)
-- 2. Set mood to 'neutral' as a safe default

-- First, ensure mood_name_snapshot preserves the original value
UPDATE public.entries e
SET mood_name_snapshot = COALESCE(
    e.mood_name_snapshot,
    CASE 
        WHEN e.mood LIKE 'custom_%' THEN 'Custom Mood'
        WHEN e.mood IS NOT NULL THEN INITCAP(e.mood)
        ELSE 'Neutral'
    END
)
WHERE e.mood_name_snapshot IS NULL
  AND EXISTS (
      SELECT 1 FROM public.entries e2
      LEFT JOIN public.moods m ON e2.mood = m.id
      WHERE e2.id = e.id AND m.id IS NULL AND e2.mood IS NOT NULL
  );

-- Then set mood to neutral for truly orphaned entries
UPDATE public.entries e
SET mood = 'neutral'
FROM (
    SELECT e.id
    FROM public.entries e
    LEFT JOIN public.moods m ON e.mood = m.id
    WHERE m.id IS NULL AND e.mood IS NOT NULL
) orphaned
WHERE e.id = orphaned.id;

-- ============================================================================
-- SECTION E: Verification queries
-- ============================================================================
-- Run these manually to verify the migration succeeded

-- Count of entries with valid mood references (should match total entries with mood)
-- SELECT 
--     COUNT(*) as total_with_mood,
--     COUNT(m.id) as valid_references,
--     COUNT(*) - COUNT(m.id) as orphaned
-- FROM public.entries e
-- LEFT JOIN public.moods m ON e.mood = m.id
-- WHERE e.mood IS NOT NULL;

-- Distribution of mood types in entries
-- SELECT 
--     m.type,
--     COUNT(*) as entry_count
-- FROM public.entries e
-- JOIN public.moods m ON e.mood = m.id
-- GROUP BY m.type;

-- Entries with fallback moods (mood = 'neutral' but snapshot differs)
-- SELECT id, mood, mood_name_snapshot
-- FROM public.entries
-- WHERE mood = 'neutral' 
--   AND mood_name_snapshot != 'Neutral'
-- LIMIT 20;

-- Final verification: no orphaned entries should remain
DO $$
DECLARE
    remaining_orphans INTEGER;
BEGIN
    SELECT COUNT(*) INTO remaining_orphans
    FROM public.entries e
    LEFT JOIN public.moods m ON e.mood = m.id
    WHERE m.id IS NULL AND e.mood IS NOT NULL;
    
    IF remaining_orphans > 0 THEN
        RAISE WARNING 'Still have % orphaned entries after cleanup', remaining_orphans;
    ELSE
        RAISE NOTICE 'All mood references are now valid!';
    END IF;
END $$;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';


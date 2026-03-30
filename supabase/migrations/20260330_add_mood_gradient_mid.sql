-- Add gradient_mid column to moods table for the 3-stop color system.
-- Custom moods now store a primary → mid → secondary gradient triple.
-- Existing rows (gradient_from / gradient_to only) will have gradient_mid NULL;
-- theme.ts falls back to blending primary+secondary when mid is absent.

ALTER TABLE public.moods
ADD COLUMN IF NOT EXISTS gradient_mid text,
ADD COLUMN IF NOT EXISTS color_pool_id text;

COMMENT ON COLUMN public.moods.gradient_mid IS
    'Middle hex gradient stop for 3-tone orb rendering (e.g. #C49D84). '
    'NULL for legacy rows — theme.ts computes blend of gradient_from+gradient_to as fallback. '
    'NULL for system moods (use hardcoded presets in presets.ts).';

COMMENT ON COLUMN public.moods.color_pool_id IS
    'Which custom pool scheme was assigned (custom_pool_1…custom_pool_10). '
    'NULL for system moods and custom moods that overflowed the pool.';

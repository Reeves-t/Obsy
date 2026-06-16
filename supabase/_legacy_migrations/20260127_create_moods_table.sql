-- Moods Table Migration
-- Date: 2026-01-27
-- Purpose: Create centralized moods table as single source of truth for system and custom moods
-- Creates: public.moods table, RLS policies, indexes, and seeds 40 system moods

-- 1) Create moods table
CREATE TABLE IF NOT EXISTS public.moods (
    id text PRIMARY KEY,
    name text NOT NULL,
    type text NOT NULL CHECK (type IN ('system', 'custom')),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    deleted_at timestamptz
);

-- 2) Constraints
-- Ensure custom moods require user_id, system moods don't have one
ALTER TABLE public.moods DROP CONSTRAINT IF EXISTS moods_type_user_check;
ALTER TABLE public.moods ADD CONSTRAINT moods_type_user_check 
    CHECK (
        (type = 'system' AND user_id IS NULL) OR 
        (type = 'custom' AND user_id IS NOT NULL)
    );

-- Prevent duplicate custom mood names per user
ALTER TABLE public.moods DROP CONSTRAINT IF EXISTS moods_unique_user_name;
ALTER TABLE public.moods ADD CONSTRAINT moods_unique_user_name 
    UNIQUE (user_id, name);

-- 3) Indexes for performance
CREATE INDEX IF NOT EXISTS idx_moods_user_id ON public.moods(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_moods_type ON public.moods(type);
CREATE INDEX IF NOT EXISTS idx_moods_deleted_at ON public.moods(deleted_at);

-- 4) Row Level Security
ALTER TABLE public.moods ENABLE ROW LEVEL SECURITY;

-- Select policies
DROP POLICY IF EXISTS "Users can view system moods" ON public.moods;
CREATE POLICY "Users can view system moods" ON public.moods 
    FOR SELECT USING (type = 'system');

DROP POLICY IF EXISTS "Users can view their own custom moods" ON public.moods;
CREATE POLICY "Users can view their own custom moods" ON public.moods 
    FOR SELECT TO authenticated USING (type = 'custom' AND auth.uid() = user_id);

-- Insert policy
DROP POLICY IF EXISTS "Users can create their own custom moods" ON public.moods;
CREATE POLICY "Users can create their own custom moods" ON public.moods 
    FOR INSERT TO authenticated WITH CHECK (type = 'custom' AND auth.uid() = user_id);

-- Update policy
DROP POLICY IF EXISTS "Users can update their own custom moods" ON public.moods;
CREATE POLICY "Users can update their own custom moods" ON public.moods 
    FOR UPDATE TO authenticated USING (type = 'custom' AND auth.uid() = user_id) 
    WITH CHECK (type = 'custom' AND auth.uid() = user_id);

-- Delete policy
DROP POLICY IF EXISTS "Users can delete their own custom moods" ON public.moods;
CREATE POLICY "Users can delete their own custom moods" ON public.moods 
    FOR DELETE TO authenticated USING (type = 'custom' AND auth.uid() = user_id);

-- 5) Seed system moods (40 total)
-- Using ON CONFLICT to make migration idempotent
INSERT INTO public.moods (id, name, type, user_id) VALUES
    -- Low energy moods (13)
    ('calm', 'Calm', 'system', NULL),
    ('relaxed', 'Relaxed', 'system', NULL),
    ('peaceful', 'Peaceful', 'system', NULL),
    ('tired', 'Tired', 'system', NULL),
    ('drained', 'Drained', 'system', NULL),
    ('bored', 'Bored', 'system', NULL),
    ('reflective', 'Reflective', 'system', NULL),
    ('melancholy', 'Melancholy', 'system', NULL),
    ('nostalgic', 'Nostalgic', 'system', NULL),
    ('lonely', 'Lonely', 'system', NULL),
    ('depressed', 'Depressed', 'system', NULL),
    ('numb', 'Numb', 'system', NULL),
    ('safe', 'Safe', 'system', NULL),
    -- Medium energy moods (10)
    ('neutral', 'Neutral', 'system', NULL),
    ('focused', 'Focused', 'system', NULL),
    ('grateful', 'Grateful', 'system', NULL),
    ('hopeful', 'Hopeful', 'system', NULL),
    ('curious', 'Curious', 'system', NULL),
    ('scattered', 'Scattered', 'system', NULL),
    ('annoyed', 'Annoyed', 'system', NULL),
    ('unbothered', 'Unbothered', 'system', NULL),
    ('awkward', 'Awkward', 'system', NULL),
    ('tender', 'Tender', 'system', NULL),
    -- High energy moods (17)
    ('productive', 'Productive', 'system', NULL),
    ('creative', 'Creative', 'system', NULL),
    ('inspired', 'Inspired', 'system', NULL),
    ('confident', 'Confident', 'system', NULL),
    ('joyful', 'Joyful', 'system', NULL),
    ('social', 'Social', 'system', NULL),
    ('busy', 'Busy', 'system', NULL),
    ('restless', 'Restless', 'system', NULL),
    ('stressed', 'Stressed', 'system', NULL),
    ('overwhelmed', 'Overwhelmed', 'system', NULL),
    ('anxious', 'Anxious', 'system', NULL),
    ('angry', 'Angry', 'system', NULL),
    ('pressured', 'Pressured', 'system', NULL),
    ('enthusiastic', 'Enthusiastic', 'system', NULL),
    ('hyped', 'Hyped', 'system', NULL),
    ('manic', 'Manic', 'system', NULL),
    ('playful', 'Playful', 'system', NULL)
ON CONFLICT (id) DO NOTHING;

-- 6) Validation
-- Expected: 40 system moods after seeding
-- Verify with: SELECT COUNT(*) FROM public.moods WHERE type = 'system';

-- 7) Reload schema cache for PostgREST
NOTIFY pgrst, 'reload schema';


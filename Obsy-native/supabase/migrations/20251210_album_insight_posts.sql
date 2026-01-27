-- Album Insight Posts (Thought Clouds)
-- Stores posted album insights that are visible to all album members

-- =============================================================================
-- 1. CREATE ALBUM_INSIGHT_POSTS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.album_insight_posts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    album_id uuid REFERENCES public.albums(id) ON DELETE CASCADE NOT NULL,
    author_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    insight_text text NOT NULL,
    tone text,
    insight_type text DEFAULT 'album',
    source_insight_id uuid,
    generated_at timestamp with time zone NOT NULL,
    posted_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add FK to profiles for Supabase auto-join capability
ALTER TABLE public.album_insight_posts
    ADD CONSTRAINT album_insight_posts_author_id_profiles_fkey
    FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- =============================================================================
-- 2. CREATE INDEXES
-- =============================================================================
-- Index for efficient retrieval of posts by album, ordered by posted_at
CREATE INDEX IF NOT EXISTS idx_album_insight_posts_album_posted 
    ON public.album_insight_posts(album_id, posted_at DESC);

-- Index for filtering by author
CREATE INDEX IF NOT EXISTS idx_album_insight_posts_author 
    ON public.album_insight_posts(author_id);

-- =============================================================================
-- 3. ENABLE ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE public.album_insight_posts ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 4. RLS POLICIES
-- =============================================================================

-- SELECT: Allow if requesting user is a member of the album
CREATE POLICY "Enable read access for album members" ON public.album_insight_posts
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.album_members
            WHERE album_members.album_id = album_insight_posts.album_id
            AND album_members.user_id = auth.uid()
        )
    );

-- INSERT: Allow if author_id = auth.uid() AND user is a member of the album
CREATE POLICY "Enable insert access for album members" ON public.album_insight_posts
    FOR INSERT
    WITH CHECK (
        author_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.album_members
            WHERE album_members.album_id = album_insight_posts.album_id
            AND album_members.user_id = auth.uid()
        )
    );

-- UPDATE: Allow author to update their own posts
CREATE POLICY "Enable update access for post author" ON public.album_insight_posts
    FOR UPDATE
    USING (author_id = auth.uid())
    WITH CHECK (author_id = auth.uid());

-- DELETE: Allow author to delete their own posts
CREATE POLICY "Enable delete access for post author" ON public.album_insight_posts
    FOR DELETE
    USING (author_id = auth.uid());

-- =============================================================================
-- 5. TRIGGER FOR UPDATED_AT
-- =============================================================================
CREATE OR REPLACE FUNCTION public.update_album_insight_posts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_album_insight_posts_updated_at ON public.album_insight_posts;
CREATE TRIGGER update_album_insight_posts_updated_at
    BEFORE UPDATE ON public.album_insight_posts
    FOR EACH ROW EXECUTE PROCEDURE public.update_album_insight_posts_updated_at();


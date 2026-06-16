-- Fix infinite recursion in album_members policies and optimize others
-- The key fix is adding SET search_path to bypass RLS in the SECURITY DEFINER function

-- 1. Drop and recreate the secure function with proper search_path to bypass RLS
DROP FUNCTION IF EXISTS public.is_album_member(uuid);
CREATE OR REPLACE FUNCTION public.is_album_member(_album_id uuid)
RETURNS boolean AS $$
BEGIN
  -- This function runs with definer's privileges and bypasses RLS
  -- by directly querying the table with SET search_path
  RETURN EXISTS (
    SELECT 1
    FROM public.album_members
    WHERE album_id = _album_id
    AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.is_album_member(uuid) TO authenticated;

-- 2. Update album_members policies
-- For SELECT: user can see their own membership OR any membership in albums they belong to
DROP POLICY IF EXISTS "Enable read access for album members" ON public.album_members;
CREATE POLICY "Enable read access for album members" ON public.album_members
    FOR SELECT
    USING (
        user_id = auth.uid()
        OR
        public.is_album_member(album_id)
    );

-- For INSERT: Simplified logic to avoid recursion
-- - Album creator can add anyone (including themselves)
-- - Existing album members can add new members
DROP POLICY IF EXISTS "Enable insert access for album members" ON public.album_members;
CREATE POLICY "Enable insert access for album members" ON public.album_members
    FOR INSERT
    WITH CHECK (
        -- Check if user is the album creator (direct query, no recursion)
        EXISTS (
            SELECT 1 FROM public.albums
            WHERE id = album_id
            AND created_by = auth.uid()
        )
        OR
        -- Check if user is already a member (uses SECURITY DEFINER function)
        public.is_album_member(album_id)
    );

-- 3. Update albums policies
-- Allow both creators AND members to see albums
DROP POLICY IF EXISTS "Enable read access for album members" ON public.albums;
CREATE POLICY "Enable read access for album members" ON public.albums
    FOR SELECT
    USING (
        created_by = auth.uid()
        OR
        public.is_album_member(id)
    );

-- 4. Update album_entries policies
DROP POLICY IF EXISTS "Enable read access for album members" ON public.album_entries;
DROP POLICY IF EXISTS "Enable insert access for album members" ON public.album_entries;

CREATE POLICY "Enable read access for album members" ON public.album_entries
    FOR SELECT
    USING (
        public.is_album_member(album_id)
    );

CREATE POLICY "Enable insert access for album members" ON public.album_entries
    FOR INSERT
    WITH CHECK (
        public.is_album_member(album_id)
    );

-- 5. Update album_daily_insights policies
DROP POLICY IF EXISTS "Enable read access for album members" ON public.album_daily_insights;
DROP POLICY IF EXISTS "Enable insert access for album members" ON public.album_daily_insights;

CREATE POLICY "Enable read access for album members" ON public.album_daily_insights
    FOR SELECT
    USING (
        public.is_album_member(album_id)
    );

CREATE POLICY "Enable insert access for album members" ON public.album_daily_insights
    FOR INSERT
    WITH CHECK (
        public.is_album_member(album_id)
    );

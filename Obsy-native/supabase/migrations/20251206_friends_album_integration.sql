-- Friends + Albums Integration Migration
-- This migration integrates the friends system with albums for discovery and sharing

-- =============================================================================
-- 1. HELPER FUNCTION: Check if a user is a friend
-- =============================================================================
-- Uses SECURITY DEFINER to bypass RLS when checking friendship status
CREATE OR REPLACE FUNCTION public.is_friend_of(check_user_id uuid)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.friends
        WHERE user_id = auth.uid()
        AND friend_id = check_user_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.is_friend_of(uuid) TO authenticated;

-- Add comment explaining the function
COMMENT ON FUNCTION public.is_friend_of(uuid) IS 
'Checks if the authenticated user has a friendship with the specified user. Returns true if they are friends.';

-- =============================================================================
-- 2. UPDATE ALBUMS POLICIES: Allow friends to see albums
-- =============================================================================
-- Friends can discover each other's albums (but cannot access content without membership)
DROP POLICY IF EXISTS "Friends can view each others albums" ON public.albums;
CREATE POLICY "Friends can view each others albums" ON public.albums
    FOR SELECT
    USING (
        public.is_friend_of(created_by)
    );

-- Add comment explaining the policy
COMMENT ON POLICY "Friends can view each others albums" ON public.albums IS
'Friends can see albums created by their friends. This enables album discovery. To view actual content (entries/photos), they must be added as album members.';

-- =============================================================================
-- 3. UPDATE ALBUM_MEMBERS POLICIES: Allow friends to see memberships
-- =============================================================================
-- Friends can see who is in albums created by friends
DROP POLICY IF EXISTS "Friends can view album memberships" ON public.album_members;
CREATE POLICY "Friends can view album memberships" ON public.album_members
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.albums a
            WHERE a.id = album_members.album_id
            AND public.is_friend_of(a.created_by)
        )
    );

-- =============================================================================
-- 4. UPDATE ENTRIES POLICIES: Allow album members to view shared entries
-- =============================================================================
-- Album members can view entries that are linked to albums they belong to
DROP POLICY IF EXISTS "Album members can view shared entries" ON public.entries;
CREATE POLICY "Album members can view shared entries" ON public.entries
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.album_entries ae
            INNER JOIN public.album_members am ON am.album_id = ae.album_id
            WHERE ae.entry_id = entries.id
            AND am.user_id = auth.uid()
        )
    );

-- Add comment explaining the policy
COMMENT ON POLICY "Album members can view shared entries" ON public.entries IS
'Users can view entries that have been added to albums they are members of. This works in conjunction with the storage policy in 20251204_fix_album_storage_access.sql to enable viewing of shared photos.';

-- =============================================================================
-- 5. ADD DELETE POLICY FOR ALBUMS: Only creator can delete
-- =============================================================================
DROP POLICY IF EXISTS "Album creator can delete" ON public.albums;
CREATE POLICY "Album creator can delete" ON public.albums
    FOR DELETE
    USING (auth.uid() = created_by);

-- =============================================================================
-- 6. ADD UPDATE POLICY FOR ALBUMS: Only creator can update
-- =============================================================================
DROP POLICY IF EXISTS "Album creator can update" ON public.albums;
CREATE POLICY "Album creator can update" ON public.albums
    FOR UPDATE
    USING (auth.uid() = created_by)
    WITH CHECK (auth.uid() = created_by);

-- =============================================================================
-- DOCUMENTATION
-- =============================================================================
-- 
-- Access Model Summary:
-- 
-- 1. FRIENDSHIP enables DISCOVERY:
--    - Friends can see each other's albums (name, metadata)
--    - Friends can see who is in each other's albums
-- 
-- 2. ALBUM MEMBERSHIP enables ACCESS:
--    - Only album members can view the actual entries/photos in an album
--    - Album creator can add friends as members
--    - Members can add entries to shared albums
-- 
-- This creates a clear separation:
-- - Friendship = Discovery (see that albums exist)
-- - Membership = Access (view actual content)


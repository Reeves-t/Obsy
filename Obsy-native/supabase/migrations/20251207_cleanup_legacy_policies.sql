-- =============================================================================
-- CLEANUP MIGRATION: Remove legacy and conflicting RLS policies
-- =============================================================================
-- This migration cleans up duplicate/legacy policies that may conflict with
-- the intended access control model after applying prior migrations.

-- =============================================================================
-- 1. ALBUMS TABLE: Clean up duplicate SELECT policies
-- =============================================================================
-- Intended policies:
--   - "Enable read access for album members" (creator OR member via is_album_member)
--   - "Friends can view each others albums" (discovery via is_friend_of)
-- Legacy policy to remove:
--   - "Albums: select for creator or member" (uses inline subquery instead of helper)

DROP POLICY IF EXISTS "Albums: select for creator or member" ON public.albums;

-- Also ensure no duplicate DELETE or INSERT policies exist
DROP POLICY IF EXISTS "Albums: delete" ON public.albums;
DROP POLICY IF EXISTS "Albums: insert" ON public.albums;

-- =============================================================================
-- 2. ENTRIES TABLE: Clean up overly permissive legacy policies
-- =============================================================================
-- Intended policies:
--   - "Entries select by owner" (owner can see their own entries)
--   - "Album members can view shared entries" (album members can see shared entries)
-- 
-- Legacy policies to remove (overly permissive from early development):
--   - "Enable delete for all users" (DANGEROUS: allows anyone to delete any entry)
--   - "Enable insert for all users" (DANGEROUS: allows anyone to insert)
--   - "Enable read access for all users" (DANGEROUS: exposes all entries to everyone)
--   - "Enable update for all users" (DANGEROUS: allows anyone to update any entry)
--   - "Users manage their own entries" (duplicate of owner-based policies)

DROP POLICY IF EXISTS "Enable delete for all users" ON public.entries;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.entries;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.entries;
DROP POLICY IF EXISTS "Enable update for all users" ON public.entries;
DROP POLICY IF EXISTS "Users manage their own entries" ON public.entries;

-- =============================================================================
-- 3. VERIFY FINAL POLICY STATE
-- =============================================================================
-- After this migration, the expected policies are:
--
-- albums:
--   SELECT: "Enable read access for album members" (creator OR member)
--   SELECT: "Friends can view each others albums" (discovery)
--   INSERT: "Enable insert access for authenticated users" (anyone authenticated)
--   UPDATE: "Album creator can update" (creator only)
--   DELETE: "Album creator can delete" (creator only)
--
-- entries:
--   SELECT: "Entries select by owner" (owner only)
--   SELECT: "Album members can view shared entries" (album members via album_entries)
--   INSERT: "Entries insert by owner" (owner only)
--   UPDATE: "Entries update by owner" (owner only)
--   DELETE: "Entries delete by owner" (owner only)
--
-- Note on shared entries visibility:
-- The "Album members can view shared entries" policy allows album members to see
-- entries that have been explicitly added to albums via album_entries. This includes
-- all fields: mood, note, ai_summary, photo_path, tags. If narrower exposure is needed,
-- consider creating a view or updating frontend to filter displayed fields.

-- Reload schema cache
NOTIFY pgrst, 'reload schema';


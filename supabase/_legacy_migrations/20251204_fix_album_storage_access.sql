-- Fix storage access for album members
-- This migration allows album members to read photos that are shared in their albums

-- 1. Create a helper function to check if an entry is in any album the user is a member of
-- Uses SECURITY DEFINER to bypass RLS when checking album membership
CREATE OR REPLACE FUNCTION public.is_entry_in_user_album(_entry_owner_id text, _photo_path text)
RETURNS boolean AS $$
BEGIN
  -- Check if there's an entry with this photo_path owned by _entry_owner_id
  -- that is linked to an album the current user is a member of
  RETURN EXISTS (
    SELECT 1
    FROM public.entries e
    INNER JOIN public.album_entries ae ON ae.entry_id = e.id
    INNER JOIN public.album_members am ON am.album_id = ae.album_id
    WHERE e.user_id = _entry_owner_id::uuid
    AND e.photo_path = _photo_path
    AND am.user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.is_entry_in_user_album(text, text) TO authenticated;

-- 2. Add new storage policy to allow album members to read shared entries
-- This policy allows users to read photos from the 'entries' bucket if:
-- - The photo is in an entry that belongs to an album they are a member of
DROP POLICY IF EXISTS "Album members can read shared entries" ON storage.objects;
CREATE POLICY "Album members can read shared entries"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'entries' AND
  public.is_entry_in_user_album(
    (storage.foldername(name))[1], -- Extract user_id from path (first folder)
    name -- Full path to the file
  )
);

-- Note: The existing policy "Authenticated users can read entries" still allows
-- users to read their own entries. This new policy extends that to allow
-- reading entries shared in albums the user is a member of.


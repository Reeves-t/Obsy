-- OBS-10 (audit OBS-7): fix is_entry_in_user_album arity mismatch.
--
-- public.is_entry_in_user_album is defined with TWO args
-- (_entry_owner_id text, _photo_path text) in 20251204_fix_album_storage_access.sql,
-- but 20251205_fix_album_creator_membership.sql recreated the
-- "Album members can read shared entries" storage policy calling it with only
-- ONE argument. That policy fails to resolve the function (wrong arity), breaking
-- album-shared photo reads. This restores the correct two-argument call while
-- keeping the owner-OR-album-member read logic.

DROP POLICY IF EXISTS "Album members can read shared entries" ON storage.objects;

CREATE POLICY "Album members can read shared entries"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'entries'
  AND (
    -- Owner can always read their own entry objects.
    (storage.foldername(name))[1] = auth.uid()::text
    OR
    -- Album members/creators can read objects shared in their albums.
    public.is_entry_in_user_album(
      (storage.foldername(name))[1], -- _entry_owner_id: first path segment
      name                           -- _photo_path: full object path
    )
  )
);

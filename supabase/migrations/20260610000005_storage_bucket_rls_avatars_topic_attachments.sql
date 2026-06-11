-- OBS-15 (parent OBS-10 / audit OBS-7): codify storage-bucket RLS for the
-- `avatars` and `topic-attachments` buckets.
--
-- Both buckets were created outside source control (Supabase dashboard), so
-- their RLS/privacy state was unverifiable from migrations — the same gap that
-- 20260610_enable_topic_rls.sql closed for the topics tables. This migration
-- makes the intended state explicit and reproducible.
--
--   avatars            -> PUBLIC read. Avatars are rendered cross-user in the
--                         friends list, album member panels and invite previews
--                         via supabase.storage.from('avatars').getPublicUrl(...)
--                         e.g. app/(tabs)/profile.tsx:364, app/invite.tsx:51,
--                         components/albums/PeoplePanel.tsx:167,
--                         components/albums/CreateAlbumModal.tsx:181,
--                         app/albums/friends/index.tsx:70.
--                         Writes are owner-scoped: the upload path layout is
--                         `<uid>/avatar.<ext>` (app/(tabs)/profile.tsx:408), so
--                         (storage.foldername(name))[1] is the owner uid.
--                         Avatars are deliberately shareable identity data, so
--                         public read is intended and is NOT the data-safety
--                         concern that motivated the voice-notes bucket flip.
--
--   topic-attachments  -> PRIVATE. The client never builds a public URL; it
--                         reads strictly via createSignedUrl
--                         (services/topicAttachments.ts:181) and uploads to
--                         `<uid>/<topic_id>/<attachment_id>.<ext>`
--                         (services/topicAttachments.ts:128). Every operation
--                         is owner-scoped on the first path segment.
--
-- Idempotent: bucket rows are upserted to the intended `public` flag and every
-- policy is DROP ... IF EXISTS before CREATE, so this is safe to (re)apply
-- whether or not the buckets/policies already exist.

-- ============================================================================
-- avatars: public-read, owner-scoped writes
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Public read (cross-user avatar display via getPublicUrl).
DROP POLICY IF EXISTS "Avatars are publicly readable" ON storage.objects;
CREATE POLICY "Avatars are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- Owner-scoped write/update/delete.
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================================================
-- topic-attachments: private, fully owner-scoped
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('topic-attachments', 'topic-attachments', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "Users can read their own topic attachments" ON storage.objects;
CREATE POLICY "Users can read their own topic attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'topic-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can upload their own topic attachments" ON storage.objects;
CREATE POLICY "Users can upload their own topic attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'topic-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can update their own topic attachments" ON storage.objects;
CREATE POLICY "Users can update their own topic attachments"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'topic-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
    bucket_id = 'topic-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can delete their own topic attachments" ON storage.objects;
CREATE POLICY "Users can delete their own topic attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'topic-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

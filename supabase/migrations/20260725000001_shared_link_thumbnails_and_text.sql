-- Shared-link enrichment: re-hosted thumbnails + resolved author/caption text.
--
-- WHY RE-HOST: TikTok and Meta serve thumbnails from signed CDN URLs carrying an
-- `x-expires` param that lapses within days (verified: a TikTok oEmbed
-- thumbnail_url expires ~72h out). Persisting those URLs verbatim means every
-- social thumbnail in a user's journal turns into a broken image within a week.
-- YouTube and Spotify thumbnails do not expire, which is why only those two
-- have looked correct up to now. `digest-shared-link` now downloads the resolved
-- thumbnail and stores it in the `link-thumbnails` bucket, writing the storage
-- path here instead of the foreign URL.
--
-- `shared_link_thumbnail_url` is deliberately KEPT: existing rows still hold
-- usable non-expiring URLs (YouTube/Spotify), and it remains the fallback when
-- a re-host attempt fails. The client prefers the path and falls back to the URL.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, bucket upsert, DROP POLICY IF EXISTS
-- before each CREATE. Safe to (re)apply.

-- ============================================================================
-- ENTRY COLUMNS
-- ============================================================================

ALTER TABLE public.entries
ADD COLUMN IF NOT EXISTS shared_link_thumbnail_path TEXT;

COMMENT ON COLUMN public.entries.shared_link_thumbnail_path IS
'Storage path in the private `link-thumbnails` bucket (<user_id>/<entry_id>.jpg) for the re-hosted preview image. Preferred over shared_link_thumbnail_url, which may point at an expiring signed CDN URL. NULL when no thumbnail resolved or the re-host failed.';

ALTER TABLE public.entries
ADD COLUMN IF NOT EXISTS shared_link_author TEXT;

COMMENT ON COLUMN public.entries.shared_link_author IS
'Resolved author/creator of the shared link: @handle, channel, artist, or u/redditor. NULL when not resolvable.';

ALTER TABLE public.entries
ADD COLUMN IF NOT EXISTS shared_link_text TEXT;

COMMENT ON COLUMN public.entries.shared_link_text IS
'The post''s own words — TikTok/Instagram caption, tweet body, or Reddit selftext (capped at 500 chars on write). Feeds the Gemini digest for social posts, whose pages cannot be fetched, and backs the text-card render for platforms with no thumbnail (X, text posts).';

-- ============================================================================
-- link-thumbnails BUCKET: private, fully owner-scoped
-- ============================================================================
-- Path layout is `<uid>/<entry_id>.jpg`, so (storage.foldername(name))[1] is the
-- owner uid — matching the topic-attachments convention codified in
-- 20260610000005_storage_bucket_rls_avatars_topic_attachments.sql.
--
-- PRIVATE because these images mirror content a user chose to save privately;
-- the client reads them via createSignedUrl, never getPublicUrl.

INSERT INTO storage.buckets (id, name, public)
VALUES ('link-thumbnails', 'link-thumbnails', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "Users can read their own link thumbnails" ON storage.objects;
CREATE POLICY "Users can read their own link thumbnails"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'link-thumbnails'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can upload their own link thumbnails" ON storage.objects;
CREATE POLICY "Users can upload their own link thumbnails"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'link-thumbnails'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can update their own link thumbnails" ON storage.objects;
CREATE POLICY "Users can update their own link thumbnails"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'link-thumbnails'
    AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
    bucket_id = 'link-thumbnails'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can delete their own link thumbnails" ON storage.objects;
CREATE POLICY "Users can delete their own link thumbnails"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'link-thumbnails'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Reload PostgREST schema cache so the new columns are queryable immediately.
NOTIFY pgrst, 'reload schema';

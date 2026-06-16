-- OBS-20 storage hardening (2026-06-16): make the `entries` bucket PRIVATE.
-- It holds journal photos but was PUBLIC, so objects were readable via the
-- unauthenticated CDN URL, bypassing RLS. The app now reads entry photos via
-- short-lived signed URLs (services/storage.ts getEntryImageUrls); owner-scoped
-- read policies already exist on storage.objects for bucket_id = 'entries'.
--
-- ORDERING: ship the app build carrying the signed-URL change before (or with)
-- this flip — older builds used getPublicUrl and will show broken cloud photos
-- until updated.

update storage.buckets set public = false where id = 'entries';

-- Self-verify: abort if the bucket is somehow still public.
do $$
begin
  if exists (select 1 from storage.buckets where id = 'entries' and public) then
    raise exception 'entries bucket is still public';
  end if;
end $$;

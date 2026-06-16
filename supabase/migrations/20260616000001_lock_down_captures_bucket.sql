-- OBS-20 storage hardening (2026-06-16): the `captures` bucket was PUBLIC and had an
-- anonymous INSERT policy ("Anon Upload") plus a public SELECT policy ("Public
-- Access"), i.e. anyone — even unauthenticated — could upload to and read from it.
-- The app does not use this bucket (capture media lives in `entries`), so this is
-- pure exposure. Make it private and drop the open policies.

update storage.buckets set public = false where id = 'captures';

drop policy if exists "Anon Upload" on storage.objects;
drop policy if exists "Public Access" on storage.objects;

-- Self-verify: abort the migration if anything is still open.
do $$
begin
  if exists (select 1 from storage.buckets where id = 'captures' and public) then
    raise exception 'captures bucket is still public';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname in ('Anon Upload', 'Public Access')
  ) then
    raise exception 'open captures policies still present';
  end if;
end $$;

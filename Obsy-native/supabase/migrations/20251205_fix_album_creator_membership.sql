-- Fix: Album creators should be able to access album_entries even if not in album_members
-- Also: Backfill album_members for existing albums where creator is missing

-- 1. Create a helper function to check if user is album creator
CREATE OR REPLACE FUNCTION public.is_album_creator(_album_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.albums
    WHERE id = _album_id
    AND created_by = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.is_album_creator(uuid) TO authenticated;

-- 2. Update album_entries policies to include creator check
DROP POLICY IF EXISTS "Enable read access for album members" ON public.album_entries;
CREATE POLICY "Enable read access for album members" ON public.album_entries
    FOR SELECT
    USING (
        public.is_album_creator(album_id)
        OR
        public.is_album_member(album_id)
    );

DROP POLICY IF EXISTS "Enable insert access for album members" ON public.album_entries;
CREATE POLICY "Enable insert access for album members" ON public.album_entries
    FOR INSERT
    WITH CHECK (
        public.is_album_creator(album_id)
        OR
        public.is_album_member(album_id)
    );

-- 3. Update album_daily_insights policies to include creator check
DROP POLICY IF EXISTS "Enable read access for album members" ON public.album_daily_insights;
CREATE POLICY "Enable read access for album members" ON public.album_daily_insights
    FOR SELECT
    USING (
        public.is_album_creator(album_id)
        OR
        public.is_album_member(album_id)
    );

DROP POLICY IF EXISTS "Enable insert access for album members" ON public.album_daily_insights;
CREATE POLICY "Enable insert access for album members" ON public.album_daily_insights
    FOR INSERT
    WITH CHECK (
        public.is_album_creator(album_id)
        OR
        public.is_album_member(album_id)
    );

-- 4. Backfill: Add creators to album_members for any albums where they're missing
INSERT INTO public.album_members (album_id, user_id)
SELECT a.id, a.created_by
FROM public.albums a
WHERE NOT EXISTS (
    SELECT 1 FROM public.album_members am
    WHERE am.album_id = a.id AND am.user_id = a.created_by
)
ON CONFLICT DO NOTHING;

-- 5. Update the storage policy to also check for album creator
DROP POLICY IF EXISTS "Album members can read shared entries" ON storage.objects;
CREATE POLICY "Album members can read shared entries" ON storage.objects
    FOR SELECT
    USING (
        bucket_id = 'entries'
        AND (
            -- Owner can always read their own entries
            (storage.foldername(name))[1] = auth.uid()::text
            OR
            -- Album members/creators can read entries shared in their albums
            public.is_entry_in_user_album(
                CASE 
                    WHEN array_length(regexp_split_to_array(name, '/'), 1) >= 2 
                    THEN (regexp_split_to_array(name, '/'))[2]::uuid
                    ELSE NULL
                END
            )
        )
    );


-- 1. Create Albums Table
CREATE TABLE IF NOT EXISTS public.albums (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    created_by uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- 2. Create Album Members Table
CREATE TABLE IF NOT EXISTS public.album_members (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    album_id uuid REFERENCES public.albums(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    joined_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    UNIQUE(album_id, user_id)
);

-- 3. Link Entries to Albums (Many-to-Many)
-- Note: referencing 'entries' table instead of 'captures'
CREATE TABLE IF NOT EXISTS public.album_entries (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    album_id uuid REFERENCES public.albums(id) ON DELETE CASCADE,
    entry_id uuid REFERENCES public.entries(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- 4. Store the Daily Insight (Per User, Per Album, Per Day)
CREATE TABLE IF NOT EXISTS public.album_daily_insights (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    album_id uuid REFERENCES public.albums(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE, -- The viewer who generated it
    insight_date date NOT NULL, -- e.g., '2025-12-04'
    narrative_text text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    UNIQUE(album_id, user_id, insight_date) -- Prevent duplicate generations per day
);

-- Enable RLS
ALTER TABLE public.albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.album_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.album_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.album_daily_insights ENABLE ROW LEVEL SECURITY;

-- Policies for albums
CREATE POLICY "Enable read access for album members" ON public.albums
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.album_members
            WHERE album_members.album_id = albums.id
            AND album_members.user_id = auth.uid()
        )
    );

CREATE POLICY "Enable insert access for authenticated users" ON public.albums
    FOR INSERT
    WITH CHECK (auth.uid() = created_by);

-- Policies for album_members
CREATE POLICY "Enable read access for album members" ON public.album_members
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.album_members am
            WHERE am.album_id = album_members.album_id
            AND am.user_id = auth.uid()
        )
    );

CREATE POLICY "Enable insert access for album members" ON public.album_members
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.album_members am
            WHERE am.album_id = album_members.album_id
            AND am.user_id = auth.uid()
        )
        OR 
        -- Allow creator to add themselves
        (user_id = auth.uid())
    );

-- Policies for album_entries
CREATE POLICY "Enable read access for album members" ON public.album_entries
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.album_members
            WHERE album_members.album_id = album_entries.album_id
            AND album_members.user_id = auth.uid()
        )
    );

CREATE POLICY "Enable insert access for album members" ON public.album_entries
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.album_members
            WHERE album_members.album_id = album_entries.album_id
            AND album_members.user_id = auth.uid()
        )
    );

-- Policies for album_daily_insights
CREATE POLICY "Enable read access for album members" ON public.album_daily_insights
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.album_members
            WHERE album_members.album_id = album_daily_insights.album_id
            AND album_members.user_id = auth.uid()
        )
    );

CREATE POLICY "Enable insert access for album members" ON public.album_daily_insights
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.album_members
            WHERE album_members.album_id = album_daily_insights.album_id
            AND album_members.user_id = auth.uid()
        )
    );

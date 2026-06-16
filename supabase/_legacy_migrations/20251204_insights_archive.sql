-- Create insights_archive table
-- Includes journal insight types: journal_daily, journal_weekly, journal_monthly
CREATE TABLE IF NOT EXISTS public.insights_archive (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    type text NOT NULL CHECK (type IN ('daily', 'weekly', 'monthly', 'album', 'tagging', 'journal_daily', 'journal_weekly', 'journal_monthly')),
    title text NOT NULL,
    summary text NOT NULL,
    body text NOT NULL,
    date_scope text NOT NULL,
    album_id uuid REFERENCES public.albums(id) ON DELETE SET NULL,
    tag_group_id uuid, -- No FK for now as tags might not be in a table with UUIDs or might be loose
    related_capture_ids uuid[] DEFAULT '{}',
    tone text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add comment for documentation
COMMENT ON COLUMN public.insights_archive.type IS 'Insight type: daily, weekly, monthly (photo-based), album, tagging, journal_daily, journal_weekly, journal_monthly (text-only journal insights)';

-- Enable RLS
ALTER TABLE public.insights_archive ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own archives" ON public.insights_archive
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own archives" ON public.insights_archive
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own archives" ON public.insights_archive
    FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own archives" ON public.insights_archive
    FOR DELETE
    USING (auth.uid() = user_id);

-- Create index for faster querying by user and type
CREATE INDEX IF NOT EXISTS insights_archive_user_id_idx ON public.insights_archive(user_id);
CREATE INDEX IF NOT EXISTS insights_archive_type_idx ON public.insights_archive(type);
CREATE INDEX IF NOT EXISTS insights_archive_created_at_idx ON public.insights_archive(created_at DESC);

-- Create composite index for efficient journal insight queries
CREATE INDEX IF NOT EXISTS insights_archive_user_type_created_idx
ON public.insights_archive(user_id, type, created_at DESC);

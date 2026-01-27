-- Add tags array for archiving organization
ALTER TABLE public.insights_archive
ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

-- Add saved_at timestamp (when user explicitly saved)
ALTER TABLE public.insights_archive
ADD COLUMN IF NOT EXISTS saved_at timestamp with time zone DEFAULT timezone('utc'::text, now());

-- Index for tag queries
CREATE INDEX IF NOT EXISTS insights_archive_tags_idx 
  ON public.insights_archive USING GIN(tags);

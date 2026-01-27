-- Add soft delete column for recycle bin support
ALTER TABLE public.insights_archive
ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone DEFAULT NULL;

-- Index for efficient recycle bin queries and filtering
CREATE INDEX IF NOT EXISTS insights_archive_deleted_at_idx 
  ON public.insights_archive(deleted_at) 
  WHERE deleted_at IS NOT NULL;

-- Index for main archive queries (filtering out deleted items)
CREATE INDEX IF NOT EXISTS insights_archive_active_idx 
  ON public.insights_archive(user_id, created_at) 
  WHERE deleted_at IS NULL;

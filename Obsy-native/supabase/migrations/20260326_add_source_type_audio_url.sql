-- Add source_type to distinguish capture / journal / voice entries
ALTER TABLE entries ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'capture';

-- Add audio_url for voice note recordings stored in Supabase Storage
ALTER TABLE entries ADD COLUMN IF NOT EXISTS audio_url TEXT;

-- All existing entries default to 'capture' — no backfill needed

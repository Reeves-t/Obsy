-- App-wide AI free mode toggle
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS ai_free_mode boolean DEFAULT false;

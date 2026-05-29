-- Pattern Keywords: structured emotional themes per user.
-- Singleton row per user, upserted on each generation.

CREATE TABLE IF NOT EXISTS public.pattern_keywords (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    payload jsonb NOT NULL,
    eligible_capture_count integer NOT NULL DEFAULT 0,
    generation_number integer NOT NULL DEFAULT 1,
    last_emerging_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT pattern_keywords_user_unique UNIQUE (user_id)
);

ALTER TABLE public.pattern_keywords ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pattern_keywords' AND policyname = 'Users can read own pattern keywords') THEN
        CREATE POLICY "Users can read own pattern keywords"
            ON public.pattern_keywords FOR SELECT
            USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pattern_keywords' AND policyname = 'Users can insert own pattern keywords') THEN
        CREATE POLICY "Users can insert own pattern keywords"
            ON public.pattern_keywords FOR INSERT
            WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pattern_keywords' AND policyname = 'Users can update own pattern keywords') THEN
        CREATE POLICY "Users can update own pattern keywords"
            ON public.pattern_keywords FOR UPDATE
            USING (auth.uid() = user_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pattern_keywords_user_id ON public.pattern_keywords(user_id);

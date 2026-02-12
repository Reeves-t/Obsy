-- Observed Patterns: lifelong pattern reflection that updates every +5 eligible captures
-- Singleton row per user, upserted on each generation

CREATE TABLE IF NOT EXISTS public.observed_patterns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    pattern_text text NOT NULL,
    eligible_capture_count integer NOT NULL DEFAULT 0,
    generation_number integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT observed_patterns_user_unique UNIQUE (user_id)
);

-- RLS
ALTER TABLE public.observed_patterns ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'observed_patterns' AND policyname = 'Users can read own observed patterns') THEN
        CREATE POLICY "Users can read own observed patterns"
            ON public.observed_patterns FOR SELECT
            USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'observed_patterns' AND policyname = 'Users can insert own observed patterns') THEN
        CREATE POLICY "Users can insert own observed patterns"
            ON public.observed_patterns FOR INSERT
            WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'observed_patterns' AND policyname = 'Users can update own observed patterns') THEN
        CREATE POLICY "Users can update own observed patterns"
            ON public.observed_patterns FOR UPDATE
            USING (auth.uid() = user_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_observed_patterns_user_id ON public.observed_patterns(user_id);

-- Recommendations: free-text feature requests / wishes submitted from Settings.
-- One row per submission. Insert + read are owner-scoped; reviewing all submissions
-- happens via the service role (dashboard), which bypasses RLS.

CREATE TABLE IF NOT EXISTS public.recommendations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    message text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'recommendations' AND policyname = 'Users can insert own recommendations') THEN
        CREATE POLICY "Users can insert own recommendations"
            ON public.recommendations FOR INSERT
            TO authenticated
            WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'recommendations' AND policyname = 'Users can read own recommendations') THEN
        CREATE POLICY "Users can read own recommendations"
            ON public.recommendations FOR SELECT
            TO authenticated
            USING (auth.uid() = user_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_recommendations_user_id ON public.recommendations(user_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_created_at ON public.recommendations(created_at DESC);

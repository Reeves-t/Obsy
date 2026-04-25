CREATE TABLE IF NOT EXISTS public.ai_provider_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id text NOT NULL,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    feature text NOT NULL,
    task text NOT NULL,
    provider text NOT NULL,
    model text NOT NULL,
    attempt_index integer NOT NULL CHECK (attempt_index > 0),
    is_fallback boolean NOT NULL DEFAULT false,
    fallback_from text,
    status text NOT NULL CHECK (status IN ('success', 'error')),
    error_stage text,
    error_message text,
    http_status integer,
    latency_ms integer,
    input_mode text NOT NULL DEFAULT 'text',
    prompt_version text,
    request_payload jsonb,
    response_payload jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_provider_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'ai_provider_runs'
          AND policyname = 'Users can read own ai provider runs'
    ) THEN
        CREATE POLICY "Users can read own ai provider runs"
            ON public.ai_provider_runs
            FOR SELECT
            USING (auth.uid() = user_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ai_provider_runs_request_id
    ON public.ai_provider_runs (request_id);

CREATE INDEX IF NOT EXISTS idx_ai_provider_runs_user_created_at
    ON public.ai_provider_runs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_provider_runs_feature_created_at
    ON public.ai_provider_runs (feature, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_provider_runs_provider_created_at
    ON public.ai_provider_runs (provider, created_at DESC);

COMMENT ON TABLE public.ai_provider_runs IS 'Per-attempt AI provider execution log for primary and fallback model routing.';

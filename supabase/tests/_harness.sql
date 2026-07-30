-- Minimal stand-in for the Supabase surfaces the migration depends on.
-- Roles are cluster-wide, so they survive a DROP DATABASE between runs.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;

-- Mirrors Supabase's default privileges so the migration's REVOKEs are meaningful.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE auth.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text
);

-- auth.uid() reads a session GUC so tests can switch identity.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('test.uid', true), '')::uuid;
$$;

-- ── Slices of the real Obsy schema the migration touches ────────────────────

CREATE TABLE public.user_settings (
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    ai_tone text DEFAULT 'neutral',
    is_premium boolean DEFAULT false,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    note text,
    mood_id uuid,
    mood_name_snapshot text,
    source_type text CHECK (source_type IN ('capture','journal','voice','shared_link')),
    shared_link_url text,
    shared_link_platform text,
    shared_link_title text,
    shared_link_thumbnail_url text,
    shared_link_digest text,
    shared_link_media_type text,
    created_at timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX entries_source_type_idx ON public.entries (user_id, source_type, created_at DESC);

CREATE TABLE public.friends (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    friend_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE(user_id, friend_id)
);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
-- Supabase grants these; needed for a direct `auth.uid()` call in test queries.
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;

-- Base schema migration for Obsy
-- Creates the fundamental tables that other migrations depend on

-- =============================================================================
-- 1. PROFILES TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    full_name text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies: Users can read all profiles (for friend discovery), but only update their own
CREATE POLICY "Users can view all profiles" ON public.profiles
    FOR SELECT
    USING (true);

CREATE POLICY "Users can update their own profile" ON public.profiles
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON public.profiles
    FOR INSERT
    WITH CHECK (auth.uid() = id);

-- =============================================================================
-- 2. ENTRIES TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.entries (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    mood text,
    note text,
    ai_summary text,
    photo_path text,
    tags text[],
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on entries
ALTER TABLE public.entries ENABLE ROW LEVEL SECURITY;

-- Entries policies: Users can only CRUD their own entries
CREATE POLICY "Entries select by owner" ON public.entries
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Entries insert by owner" ON public.entries
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Entries update by owner" ON public.entries
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Entries delete by owner" ON public.entries
    FOR DELETE
    USING (auth.uid() = user_id);

-- =============================================================================
-- 3. USER_SETTINGS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.user_settings (
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    ai_tone text DEFAULT 'neutral',
    ai_auto_daily_insights boolean DEFAULT true,
    ai_use_journal_in_insights boolean DEFAULT true,
    ai_per_photo_captions boolean DEFAULT true,
    is_premium boolean DEFAULT false,
    premium_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on user_settings
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- User settings policies: Users can only access their own settings
CREATE POLICY "User settings select by owner" ON public.user_settings
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "User settings upsert by owner" ON public.user_settings
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- 4. DAILY_INSIGHTS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.daily_insights (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    insight_date date NOT NULL,
    narrative_text text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, insight_date)
);

-- Enable RLS on daily_insights
ALTER TABLE public.daily_insights ENABLE ROW LEVEL SECURITY;

-- Daily insights policies
CREATE POLICY "Insights select by owner" ON public.daily_insights
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Insights insert by owner" ON public.daily_insights
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Insights update by owner" ON public.daily_insights
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Insights delete by owner" ON public.daily_insights
    FOR DELETE
    USING (auth.uid() = user_id);

-- =============================================================================
-- 5. TRIGGER: Auto-create profile and settings on user signup
-- =============================================================================
-- This function creates both a profiles row (identity) and user_settings row (preferences)
-- when a new user signs up.
--
-- IMPORTANT: The `friend_code` column is NOT set here because it uses a column DEFAULT
-- that calls `generate_friend_code()`. This ensures the friend_code generation logic
-- remains in one place. If you modify this trigger, do NOT manually set friend_code
-- as that could create invalid or duplicate codes.
--
-- Auth metadata keys used:
-- - raw_user_meta_data->>'full_name': User's display name from OAuth or signup form
-- - raw_user_meta_data->>'avatar_url': User's avatar URL from OAuth provider
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    -- Create profile (identity data)
    -- Note: friend_code is handled via column DEFAULT (see 20251205_add_friend_code.sql)
    INSERT INTO public.profiles (id, full_name, avatar_url)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
        new.raw_user_meta_data->>'avatar_url'
    );

    -- Create user settings (preferences)
    INSERT INTO public.user_settings (user_id, ai_tone, ai_auto_daily_insights, ai_use_journal_in_insights)
    VALUES (new.id, 'neutral', true, true);

    RETURN new;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- =============================================================================
-- 6. STORAGE: Create entries bucket for photo storage
-- =============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('entries', 'entries', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for entries bucket
-- Users can read their own entries
CREATE POLICY "Authenticated users can read own entries"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'entries' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Users can insert their own entries
CREATE POLICY "Authenticated users can insert own entries"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'entries' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Users can update their own entries
CREATE POLICY "Authenticated users can update own entries"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'entries' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Users can delete their own entries
CREATE POLICY "Authenticated users can delete own entries"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'entries' AND auth.uid()::text = (storage.foldername(name))[1]);


-- Custom AI Tones MVP Migration (Refined with Supabase AI recommendations)

-- 0) Enable btree_gist extension (needed for the exclusion constraint)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1) Create custom_ai_tones table
CREATE TABLE IF NOT EXISTS public.custom_ai_tones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name text NOT NULL,
    prompt text NOT NULL,
    is_default boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- 2) Constraints
ALTER TABLE public.custom_ai_tones DROP CONSTRAINT IF EXISTS name_length;
ALTER TABLE public.custom_ai_tones ADD CONSTRAINT name_length CHECK (char_length(name) <= 50);

ALTER TABLE public.custom_ai_tones DROP CONSTRAINT IF EXISTS prompt_length;
ALTER TABLE public.custom_ai_tones ADD CONSTRAINT prompt_length CHECK (char_length(prompt) <= 250);

-- Ensure only one default per user
ALTER TABLE public.custom_ai_tones DROP CONSTRAINT IF EXISTS one_default_per_user;
ALTER TABLE public.custom_ai_tones ADD CONSTRAINT one_default_per_user 
    EXCLUDE USING gist (user_id WITH =, is_default WITH =) 
    WHERE (is_default) 
    DEFERRABLE INITIALLY IMMEDIATE;

-- 3) Helpful indexes for RLS and lookups
CREATE INDEX IF NOT EXISTS custom_ai_tones_user_id_idx ON public.custom_ai_tones(user_id);
CREATE INDEX IF NOT EXISTS custom_ai_tones_user_id_is_default_idx ON public.custom_ai_tones(user_id, is_default);

-- 4) Row Level Security
ALTER TABLE public.custom_ai_tones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Custom tones select by owner" ON public.custom_ai_tones;
CREATE POLICY "Custom tones select by owner" ON public.custom_ai_tones 
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Custom tones insert by owner" ON public.custom_ai_tones;
CREATE POLICY "Custom tones insert by owner" ON public.custom_ai_tones 
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Custom tones update by owner" ON public.custom_ai_tones;
CREATE POLICY "Custom tones update by owner" ON public.custom_ai_tones 
    FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Custom tones delete by owner" ON public.custom_ai_tones;
CREATE POLICY "Custom tones delete by owner" ON public.custom_ai_tones 
    FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 5) Limit enforcement function
CREATE OR REPLACE FUNCTION public.check_custom_tone_limit() 
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public, auth 
AS $$ 
DECLARE 
    tone_count integer; 
    user_tier text; 
    max_tones integer; 
BEGIN 
    -- Fetch current subscription tier 
    SELECT subscription_tier INTO user_tier 
    FROM public.user_settings WHERE user_id = NEW.user_id;

    IF user_tier IN ('founder', 'subscriber') THEN 
        max_tones := 5; 
    ELSE 
        max_tones := 1; 
    END IF;

    SELECT COUNT(*) INTO tone_count 
    FROM public.custom_ai_tones WHERE user_id = NEW.user_id;

    IF tone_count >= max_tones THEN 
        RAISE EXCEPTION 'Custom tone limit reached for user % (max %)', NEW.user_id, max_tones 
        USING ERRCODE = 'check_violation'; 
    END IF;

    RETURN NEW; 
END; 
$$;

-- 6) Trigger for limit
DROP TRIGGER IF EXISTS enforce_custom_tone_limit ON public.custom_ai_tones;
CREATE TRIGGER enforce_custom_tone_limit 
    BEFORE INSERT ON public.custom_ai_tones 
    FOR EACH ROW EXECUTE FUNCTION public.check_custom_tone_limit();

-- 7) Keep updated_at fresh
CREATE OR REPLACE FUNCTION public.update_updated_at_column() 
RETURNS trigger 
LANGUAGE plpgsql 
AS $$ 
BEGIN 
    NEW.updated_at := timezone('utc', now()); 
    RETURN NEW; 
END; 
$$;

DROP TRIGGER IF EXISTS set_custom_ai_tones_updated_at ON public.custom_ai_tones;
CREATE TRIGGER set_custom_ai_tones_updated_at 
    BEFORE UPDATE ON public.custom_ai_tones 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8) Add selected_custom_tone_id for user_settings
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS selected_custom_tone_id uuid REFERENCES public.custom_ai_tones(id) ON DELETE SET NULL;

-- 9) Ownership validation via Trigger (Postgres doesn't support subqueries in CHECK constraints)
CREATE OR REPLACE FUNCTION public.check_selected_tone_ownership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF NEW.selected_custom_tone_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.custom_ai_tones
            WHERE id = NEW.selected_custom_tone_id AND user_id = NEW.user_id
        ) THEN
            RAISE EXCEPTION 'Selected custom tone % does not belong to user %', NEW.selected_custom_tone_id, NEW.user_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_selected_tone_ownership ON public.user_settings;
CREATE TRIGGER validate_selected_tone_ownership
    BEFORE INSERT OR UPDATE ON public.user_settings
    FOR EACH ROW EXECUTE FUNCTION public.check_selected_tone_ownership();

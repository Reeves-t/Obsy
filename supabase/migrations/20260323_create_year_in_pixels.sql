-- Year in Pixels cloud sync
-- Stores pixel colors, strokes, and legend per user per year.
-- One row per user per year, pixels/legend stored as JSONB.

CREATE TABLE IF NOT EXISTS public.year_in_pixels (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    year integer NOT NULL,
    pixels jsonb NOT NULL DEFAULT '{}',
    legend jsonb NOT NULL DEFAULT '[]',
    updated_at timestamptz DEFAULT now(),
    UNIQUE (user_id, year)
);

ALTER TABLE public.year_in_pixels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own year_in_pixels"
    ON public.year_in_pixels
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.year_in_pixels IS 'Year in Pixels data synced per user per year.';

-- Persist per-entry orb surface effect parameters for Moodverse rendering.
ALTER TABLE public.entries
ADD COLUMN IF NOT EXISTS orb_effect jsonb;

COMMENT ON COLUMN public.entries.orb_effect IS
'Persisted randomized orb surface effect (grain/splash/streak) and params for deterministic rendering.';

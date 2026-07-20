-- Profile Context: free-text user background injected as an additive context
-- block into narrative insight prompts. Lives in user_settings (row-scoped
-- RLS, private to the user) rather than profiles, which is friend-readable
-- via the relationship-scoped SELECT policy.
ALTER TABLE public.user_settings
    ADD COLUMN IF NOT EXISTS profile_context text;

ALTER TABLE public.user_settings
    DROP CONSTRAINT IF EXISTS user_settings_profile_context_len;
ALTER TABLE public.user_settings
    ADD CONSTRAINT user_settings_profile_context_len
    CHECK (profile_context IS NULL OR char_length(profile_context) <= 600);

COMMENT ON COLUMN public.user_settings.profile_context IS
    'User-authored background (max 600 chars) added as additive context to narrative insight prompts. Never shared with friends.';

-- Allow a shared link to be saved with no mood.
--
-- The share-sheet capture flow saves in ~2 seconds and defers the mood to a
-- later reflection step: requiring someone to pick a feeling mid-scroll is what
-- stops the save from happening at all. Every other entry type still requires
-- a mood, and a shared link acquires one as soon as the user reflects on it.
--
-- `entries.mood` is already nullable, so nothing is being relaxed here — this
-- migration adds the guard that keeps the relaxation scoped to shared links,
-- and documents the invariant the client depends on.
--
-- NOTE ON mood_name_snapshot: it is NOT NULL with a DEFAULT of 'Neutral', and
-- validate_entry_mood() fills it with 'Neutral' whenever it arrives NULL. So an
-- unreflected entry reads mood = NULL, mood_name_snapshot = 'Neutral'. Queries
-- and client code must therefore branch on `mood`, never on the snapshot, to
-- decide whether an entry carries a mood. `isUnreflected()` in
-- Obsy-native/types/capture.ts is the client-side counterpart.

-- ============================================================================
-- CHECK CONSTRAINT: moodless entries must be shared links
-- ============================================================================
-- Added NOT VALID deliberately. Legacy rows predating the mood_id migrations
-- may carry a NULL mood with another source_type; validating against them would
-- fail this migration for data we are not trying to fix here. NOT VALID still
-- enforces the rule on every INSERT and UPDATE from now on, which is the point.
-- To adopt it fully later, clean up the offenders and run:
--   ALTER TABLE public.entries VALIDATE CONSTRAINT entries_mood_required_unless_shared_link;

ALTER TABLE public.entries
DROP CONSTRAINT IF EXISTS entries_mood_required_unless_shared_link;

ALTER TABLE public.entries
ADD CONSTRAINT entries_mood_required_unless_shared_link
CHECK (mood IS NOT NULL OR source_type = 'shared_link')
NOT VALID;

COMMENT ON CONSTRAINT entries_mood_required_unless_shared_link ON public.entries IS
'A mood is required for every entry except a shared link, which may be saved from the share sheet and reflected on later. NOT VALID: enforced on new writes only, so pre-existing rows with a NULL mood are left alone.';

-- ============================================================================
-- INDEX: the reflection inbox reads "my unreflected saves, newest first"
-- ============================================================================
-- Partial index — it only covers the rows the inbox asks for, so it stays tiny
-- and shrinks as the user reflects on their backlog.

CREATE INDEX IF NOT EXISTS entries_unreflected_links_idx
ON public.entries (user_id, created_at DESC)
WHERE source_type = 'shared_link' AND mood IS NULL;

NOTIFY pgrst, 'reload schema';

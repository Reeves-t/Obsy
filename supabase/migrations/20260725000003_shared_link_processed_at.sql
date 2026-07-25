-- Shared Links inbox: separate "processed" from "has a mood".
--
-- Saving is frictionless; processing is intentional. Those are two different
-- moments, and until now the queue inferred the second from the first: an entry
-- was "waiting" precisely when it had no mood. That conflation breaks the
-- moment a user wants to simply KEEP something — acknowledge it, file it, move
-- on — without attaching a feeling to it. Under the old rule such an entry
-- would sit in the queue forever, because it never gained a mood.
--
-- So the inbox now tracks its own state:
--
--   processed_at IS NULL  → still in the queue, awaiting a decision
--   processed_at IS NOT NULL → decided: kept, or reflected on (mood attached)
--   discarded → the row is deleted outright; there is no tombstone
--
-- This is deliberately independent of `mood`. A kept-but-moodless entry leaves
-- the queue and still stays out of every mood aggregate, which is exactly the
-- behaviour we want — see withMood() in Obsy-native/types/capture.ts.

ALTER TABLE public.entries
ADD COLUMN IF NOT EXISTS shared_link_processed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.entries.shared_link_processed_at IS
'When the user made a decision about a shared link in the inbox — kept it, or reflected on it. NULL means it is still queued. Independent of `mood`: an entry can be processed without ever gaining a mood, and such an entry remains excluded from mood aggregation.';

-- ============================================================================
-- BACKFILL: links that already carry a mood were, in effect, already processed
-- ============================================================================
-- Anything saved before the inbox existed went through the old flow, which
-- required a mood at save time. Those are decided; they should not appear in
-- the queue as a surprise backlog on first launch.
--
-- validate_entry_mood_trigger re-validates mood on UPDATE and some legacy rows
-- carry orphaned mood references that would block the backfill, so it is
-- disabled for the duration — the same guard 20260512_add_shared_link_entries
-- uses for exactly this reason.

ALTER TABLE public.entries DISABLE TRIGGER validate_entry_mood_trigger;

UPDATE public.entries
SET shared_link_processed_at = COALESCE(captured_at, created_at)
WHERE source_type = 'shared_link'
  AND mood IS NOT NULL
  AND shared_link_processed_at IS NULL;

ALTER TABLE public.entries ENABLE TRIGGER validate_entry_mood_trigger;

-- ============================================================================
-- INDEX: the inbox reads "my queued links, newest first"
-- ============================================================================
-- Replaces entries_unreflected_links_idx from 20260725000002, which keyed off
-- `mood IS NULL` — the wrong predicate now that processing is its own state.

DROP INDEX IF EXISTS entries_unreflected_links_idx;

CREATE INDEX IF NOT EXISTS entries_queued_links_idx
ON public.entries (user_id, created_at DESC)
WHERE source_type = 'shared_link' AND shared_link_processed_at IS NULL;

NOTIFY pgrst, 'reload schema';

-- OBS-15 (parent OBS-10 / audit OBS-7): make the voice-notes bucket PRIVATE.
--
-- 20260326_voice_notes_storage_policy.sql created this bucket as public=true
-- (line 3) with a `TO anon` public SELECT policy ("Public read for voice notes",
-- lines 24-28). Voice notes are sensitive personal audio and must NOT be
-- world-readable by URL.
--
-- Why this is safe now (no code path depends on public/anon read):
--   * Transcription: transcribe-voice-note downloads server-side via the service
--     role using an ownership-checked storagePath (commit 98461a3) — never a
--     public URL.
--   * Saved-entry playback: app/capture/[id].tsx and
--     components/entries/EntryGridTile.tsx now mint a short-lived signed URL via
--     services/voiceNotes.ts#getVoicePlaybackUrl instead of using a public URL.
--   * Review-screen playback (app/voice/index.tsx) plays the LOCAL recording
--     file, so it needs no remote URL at all.
-- The owner-scoped SELECT policy "Users can read their own voice notes"
-- (20260326_voice_notes_storage_policy.sql, lines 16-22) remains and is what
-- authorises owners to createSignedUrl for their own objects.
--
-- Idempotent: safe to (re)apply regardless of the bucket's current state.

-- Flip the bucket to private (and create it private on a fresh DB, defensively).
INSERT INTO storage.buckets (id, name, public)
VALUES ('voice-notes', 'voice-notes', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Drop the public anon read policy created by 20260326_voice_notes_storage_policy.sql.
DROP POLICY IF EXISTS "Public read for voice notes" ON storage.objects;

import { supabase } from '@/lib/supabase';

// The voice-notes bucket is PRIVATE (see
// supabase/migrations/20260610_voice_notes_private_bucket.sql). Playback must
// therefore go through a short-lived signed URL minted with the owner's JWT —
// the "Users can read their own voice notes" policy
// (supabase/migrations/20260326_voice_notes_storage_policy.sql) authorises it.
const VOICE_BUCKET = 'voice-notes';
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour — ample for a playback session.

/**
 * Resolve a persisted voice-note `audio_url` to a playable signed URL.
 *
 * Handles both formats:
 *  - new rows store the bare storage path (`<uid>/<file>.m4a`);
 *  - legacy rows stored a full public URL from getPublicUrl() — we extract the
 *    object path and re-sign it so old entries keep playing after the bucket
 *    was flipped to private.
 *
 * Returns null if the URL can't be resolved (caller should no-op playback).
 */
export async function getVoicePlaybackUrl(
    audioUrl: string | null | undefined,
): Promise<string | null> {
    const path = toStoragePath(audioUrl);
    if (!path) return null;

    const { data, error } = await supabase.storage
        .from(VOICE_BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

    if (error || !data?.signedUrl) {
        console.warn('[voiceNotes] signed url error:', error?.message);
        return null;
    }
    return data.signedUrl;
}

/** Normalise an `audio_url` (bare path or legacy public URL) to a storage path. */
function toStoragePath(audioUrl: string | null | undefined): string | null {
    if (!audioUrl) return null;

    // New format: already a bare storage path.
    if (!/^https?:\/\//i.test(audioUrl)) {
        return audioUrl.replace(/^\/+/, '') || null;
    }

    // Legacy format: .../object/public/voice-notes/<path>?<query> -> <path>.
    const marker = `/${VOICE_BUCKET}/`;
    const idx = audioUrl.indexOf(marker);
    if (idx === -1) return null;
    let p = audioUrl.slice(idx + marker.length);
    const q = p.indexOf('?');
    if (q !== -1) p = p.slice(0, q);
    try {
        p = decodeURIComponent(p);
    } catch {
        // leave as-is if it isn't valid percent-encoding
    }
    return p || null;
}

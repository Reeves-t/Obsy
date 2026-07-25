import type { OrbEffect } from '@/lib/moods/orbEffects';

/**
 * Represents a captured moment/entry in the app.
 * Each capture has an associated mood with historical preservation via mood_name_snapshot.
 */
export type Capture = {
    /** Unique identifier for the capture */
    id: string;

    /** User ID of the capture owner, null for guest captures */
    user_id: string | null;

    /** ISO timestamp when the capture was created */
    created_at: string;

    /**
     * @deprecated Use mood_id instead. This field stored the mood name string.
     * Will be removed in a future version. Kept for backward compatibility.
     */
    mood?: string;

    /**
     * Mood ID reference (system mood ID or custom_uuid format).
     * References the moods table.
     *
     * NULL only for shared links saved straight from the share sheet, which
     * deliberately defer the mood to the reflection step — asking someone to
     * pick a feeling mid-scroll is what stops the save from happening at all.
     * Such an entry is excluded from every mood-based aggregate (see `withMood`)
     * for as long as it has no mood — including after it leaves the inbox, since
     * "kept" is a valid decision that attaches no feeling.
     */
    mood_id: string | null;

    /**
     * Snapshot of mood name at capture time.
     * Preserved for historical accuracy even if the mood is later deleted.
     * This is the primary source for displaying mood names in the UI.
     *
     * NOT NULL in the database, where a trigger defaults it to 'Neutral' — so
     * for an unreflected entry this reads 'Neutral' while `mood_id` is null.
     * Always branch on `mood_id`, never on this field, to detect "has a mood".
     */
    mood_name_snapshot: string;

    /** Optional note/journal entry text */
    note: string | null;

    /** Image URI (local file path or remote URL) */
    image_url: string;

    /** Supabase storage path for cloud-stored images */
    image_path?: string | null;

    /** Array of tag strings associated with the capture */
    tags: string[];

    /** Whether to include this capture in insights/analytics */
    includeInInsights: boolean;

    /** Challenge ID if this capture was for a challenge */
    challengeId?: string;

    /** Challenge template ID if applicable */
    challengeTemplateId?: string;

    /** AI-generated note/reflection for this capture */
    obsy_note?: string | null;

    /** Whether to use the photo for AI insight generation */
    usePhotoForInsight: boolean;

    /** How the entry was created: photo capture, journal-only, voice note, or shared link */
    source_type?: 'capture' | 'journal' | 'voice' | 'shared_link';

    /** Supabase Storage URL of the voice recording (voice entries only) */
    audio_url?: string | null;

    /** Original URL for shared_link entries */
    shared_link_url?: string | null;

    /** Detected platform (TikTok, YouTube, Reddit, Spotify, Instagram, Web) */
    shared_link_platform?: string | null;

    /** Title parsed from URL metadata or share payload */
    shared_link_title?: string | null;

    /**
     * Thumbnail URL for shared link preview (if available).
     * For TikTok/Meta links this is a signed CDN URL that expires within days —
     * prefer `shared_link_thumbnail_path`, which points at our own re-hosted copy.
     */
    shared_link_thumbnail_url?: string | null;

    /** Storage path of the re-hosted thumbnail in the private `link-thumbnails` bucket. */
    shared_link_thumbnail_path?: string | null;

    /** Resolved author: @handle, channel, artist, or u/redditor. */
    shared_link_author?: string | null;

    /** The post's own words — caption, tweet body, or Reddit selftext (max 500 chars). */
    shared_link_text?: string | null;

    /**
     * When the user decided what to do with this link in the inbox — kept it, or
     * reflected on it. NULL means it is still queued.
     *
     * Independent of `mood_id`: keeping something without attaching a feeling is
     * a valid decision, and such an entry leaves the queue while still staying
     * out of mood aggregation.
     */
    shared_link_processed_at?: string | null;

    /** Gemini-generated content digest of the shared link (article/video/song themes). Null until digested / if not digestible. */
    shared_link_digest?: string | null;

    /** Resolved media type for shared links: article | post | video | music | playlist | podcast | social | link */
    shared_link_media_type?: string | null;

    /** Persisted randomized orb surface effect parameters */
    orb_effect?: OrbEffect | null;
};

/**
 * A shared link still sitting in the inbox, awaiting a decision.
 *
 * Note this is NOT "has no mood". Keeping a link without attaching a feeling is
 * a legitimate decision, and such an entry leaves the queue while remaining
 * excluded from mood aggregation — see `withMood`. Conflating the two would
 * strand every kept-but-moodless link in the queue forever.
 */
export function isPendingSharedLink(
    capture: Pick<Capture, 'source_type' | 'shared_link_processed_at'>,
): boolean {
    return capture.source_type === 'shared_link' && !capture.shared_link_processed_at;
}

/** A capture known to carry a mood — safe to aggregate on. */
export type CaptureWithMood = Capture & { mood_id: string };

/**
 * Captures that carry a mood, and so can take part in mood aggregation.
 * Every insight/statistics path filters through this first: an unreflected
 * save would otherwise land in the data as a phantom 'Neutral' (the database
 * trigger's default snapshot) and quietly skew the user's mood history.
 */
export function withMood(captures: Capture[]): CaptureWithMood[] {
    return captures.filter((c): c is CaptureWithMood => !!c.mood_id);
}

/**
 * Type guard to validate that a Capture object has all required mood fields.
 * Use this to validate captures at runtime before processing.
 *
 * @param capture - Partial capture object to validate
 * @returns True if the capture has valid mood_id and mood_name_snapshot
 */
export function isCaptureValid(capture: Partial<Capture>): capture is Capture {
    return !!(
        capture.id &&
        capture.mood_id &&
        typeof capture.mood_id === 'string' &&
        capture.mood_id.length > 0 &&
        capture.mood_name_snapshot &&
        typeof capture.mood_name_snapshot === 'string' &&
        capture.mood_name_snapshot.length > 0
    );
}

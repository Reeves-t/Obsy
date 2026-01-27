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
     * References the moods table. Required for all captures.
     */
    mood_id: string;

    /**
     * Snapshot of mood name at capture time.
     * Preserved for historical accuracy even if the mood is later deleted.
     * This is the primary source for displaying mood names in the UI.
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
};

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

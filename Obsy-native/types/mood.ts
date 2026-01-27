export interface Mood {
    id: string;                          // Unique ID (e.g., "calm" for system, "custom_abc123" for custom)
    name: string;                        // Display name (e.g., "Calm", "Determined")
    type: 'system' | 'custom';           // Source type
    user_id?: string;                    // Only for custom moods
    created_at: string;                  // ISO timestamp
    deleted_at?: string;                 // Soft delete timestamp
}

export interface MoodSnapshot {
    mood_id: string;
    mood_name: string;                   // Preserved for history even if mood is renamed/deleted
}

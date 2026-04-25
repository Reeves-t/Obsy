export interface Mood {
    id: string;                          // Unique ID (e.g., "calm" for system, "custom_abc123" for custom)
    name: string;                        // Display name (e.g., "Calm", "Determined")
    type: 'system' | 'custom';           // Source type
    user_id?: string;                    // Only for custom moods
    created_at: string;                  // ISO timestamp
    deleted_at?: string;                 // Soft delete timestamp
    color_pool_id?: string;              // Which custom pool scheme was assigned (custom_pool_1…10)
    gradient_from?: string;              // Primary gradient stop (hex, center color)
    gradient_mid?: string;               // Mid gradient stop (hex, transition color)
    gradient_to?: string;                // Secondary gradient stop (hex, edge color)
}

export interface MoodSnapshot {
    mood_id: string;
    mood_name: string;                   // Preserved for history even if mood is renamed/deleted
}

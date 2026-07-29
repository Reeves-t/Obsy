/**
 * Notification type registry.
 *
 * Single source of truth for what Obsy can send, what each type is called in
 * the UI, and which `user_settings` column gates it. The server-side sender
 * mirrors these ids — see `supabase/functions/_shared/push.ts`. Adding a type
 * means adding it here, adding its column in a migration, and handling it in
 * the sender; nothing else needs to know.
 */

export type NotificationType =
    | 'daily_reminder'
    | 'streak'
    | 'monthly_insight'
    | 'shared_link_pending';

export interface NotificationTypeMeta {
    id: NotificationType;
    /** Row title in Settings. */
    label: string;
    /** Row subtitle — says plainly what will arrive and when. */
    description: string;
    /** Boolean column on `user_settings` gating this type. */
    settingsColumn: string;
    /**
     * False while the feature that triggers this type does not exist yet. The
     * type stays registered so preferences and the server path are ready, but
     * Settings does not offer a toggle for something that can never fire.
     */
    available: boolean;
}

export const NOTIFICATION_TYPES: Record<NotificationType, NotificationTypeMeta> = {
    daily_reminder: {
        id: 'daily_reminder',
        label: 'Daily reminder',
        description: 'A nudge at your chosen time if you have not logged that day.',
        settingsColumn: 'notify_daily_reminder',
        available: true,
    },
    streak: {
        id: 'streak',
        label: 'Streaks and milestones',
        description: 'When you reach a streak or a milestone worth noticing.',
        settingsColumn: 'notify_streak',
        available: true,
    },
    monthly_insight: {
        id: 'monthly_insight',
        label: 'Monthly insight ready',
        description: 'Once a month has enough entries for its insight to be generated.',
        settingsColumn: 'notify_monthly_insight',
        available: true,
    },
    shared_link_pending: {
        id: 'shared_link_pending',
        label: 'Shared links waiting',
        description: 'When links you quick-shared are still waiting to become entries.',
        settingsColumn: 'notify_shared_link_pending',
        // Turns on with the share-inbox feature. See services/pushNotifications.ts
        // → notifySharedLinksPending() for the integration point.
        available: false,
    },
};

/** Types the user can currently toggle, in the order Settings lists them. */
export const AVAILABLE_NOTIFICATION_TYPES: NotificationTypeMeta[] = [
    NOTIFICATION_TYPES.daily_reminder,
    NOTIFICATION_TYPES.streak,
    NOTIFICATION_TYPES.monthly_insight,
    NOTIFICATION_TYPES.shared_link_pending,
].filter((t) => t.available);

/** Default local time for the daily reminder, matching the migration default. */
export const DEFAULT_REMINDER_TIME = '20:00';
export const DEFAULT_QUIET_HOURS_START = '22:00';
export const DEFAULT_QUIET_HOURS_END = '08:00';

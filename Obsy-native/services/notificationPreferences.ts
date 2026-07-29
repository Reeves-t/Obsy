import { supabase } from '@/lib/supabase';
import {
    DEFAULT_QUIET_HOURS_END,
    DEFAULT_QUIET_HOURS_START,
    DEFAULT_REMINDER_TIME,
} from '@/constants/notifications';

/**
 * Notification delivery preferences.
 *
 * These live on `user_settings` rather than on the device because the server
 * decides what to send. A device-local preference would be invisible to the
 * scheduled senders, which run whether or not the app is open.
 *
 * Signed-out users have no row and no push token, so notifications are a
 * signed-in feature; callers should route guests to sign-up rather than
 * showing controls that cannot take effect.
 */

export interface NotificationPreferences {
    notificationsEnabled: boolean;
    dailyReminder: boolean;
    streak: boolean;
    monthlyInsight: boolean;
    sharedLinkPending: boolean;
    /** Local wall-clock "HH:MM". */
    dailyReminderTime: string;
    quietHoursEnabled: boolean;
    quietHoursStart: string;
    quietHoursEnd: string;
}

export const DEFAULT_PREFERENCES: NotificationPreferences = {
    notificationsEnabled: false,
    dailyReminder: true,
    streak: true,
    monthlyInsight: true,
    sharedLinkPending: true,
    dailyReminderTime: DEFAULT_REMINDER_TIME,
    quietHoursEnabled: true,
    quietHoursStart: DEFAULT_QUIET_HOURS_START,
    quietHoursEnd: DEFAULT_QUIET_HOURS_END,
};

/** Postgres `time` columns come back as "HH:MM:SS"; the UI works in "HH:MM". */
function toHourMinute(value: string | null | undefined, fallback: string): string {
    if (!value) return fallback;
    const parts = value.split(':');
    if (parts.length < 2) return fallback;
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
}

interface SettingsRow {
    notifications_enabled: boolean | null;
    notify_daily_reminder: boolean | null;
    notify_streak: boolean | null;
    notify_monthly_insight: boolean | null;
    notify_shared_link_pending: boolean | null;
    daily_reminder_time: string | null;
    quiet_hours_enabled: boolean | null;
    quiet_hours_start: string | null;
    quiet_hours_end: string | null;
}

function fromRow(row: SettingsRow): NotificationPreferences {
    return {
        notificationsEnabled: row.notifications_enabled ?? DEFAULT_PREFERENCES.notificationsEnabled,
        dailyReminder: row.notify_daily_reminder ?? DEFAULT_PREFERENCES.dailyReminder,
        streak: row.notify_streak ?? DEFAULT_PREFERENCES.streak,
        monthlyInsight: row.notify_monthly_insight ?? DEFAULT_PREFERENCES.monthlyInsight,
        sharedLinkPending: row.notify_shared_link_pending ?? DEFAULT_PREFERENCES.sharedLinkPending,
        dailyReminderTime: toHourMinute(row.daily_reminder_time, DEFAULT_PREFERENCES.dailyReminderTime),
        quietHoursEnabled: row.quiet_hours_enabled ?? DEFAULT_PREFERENCES.quietHoursEnabled,
        quietHoursStart: toHourMinute(row.quiet_hours_start, DEFAULT_PREFERENCES.quietHoursStart),
        quietHoursEnd: toHourMinute(row.quiet_hours_end, DEFAULT_PREFERENCES.quietHoursEnd),
    };
}

const SELECT_COLUMNS =
    'notifications_enabled, notify_daily_reminder, notify_streak, notify_monthly_insight, notify_shared_link_pending, daily_reminder_time, quiet_hours_enabled, quiet_hours_start, quiet_hours_end';

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return DEFAULT_PREFERENCES;

    const { data, error } = await supabase
        .from('user_settings')
        .select(SELECT_COLUMNS)
        .eq('user_id', userId)
        .maybeSingle();

    if (error) {
        console.warn('[Notifications] Could not load preferences:', error);
        return DEFAULT_PREFERENCES;
    }
    if (!data) return DEFAULT_PREFERENCES;

    return fromRow(data as unknown as SettingsRow);
}

/** Map of preference keys to their `user_settings` columns. */
const COLUMN_FOR: Record<keyof NotificationPreferences, string> = {
    notificationsEnabled: 'notifications_enabled',
    dailyReminder: 'notify_daily_reminder',
    streak: 'notify_streak',
    monthlyInsight: 'notify_monthly_insight',
    sharedLinkPending: 'notify_shared_link_pending',
    dailyReminderTime: 'daily_reminder_time',
    quietHoursEnabled: 'quiet_hours_enabled',
    quietHoursStart: 'quiet_hours_start',
    quietHoursEnd: 'quiet_hours_end',
};

/**
 * Persist a subset of preferences. Upserts so a user whose `user_settings` row
 * does not exist yet still gets their choice saved rather than silently losing it.
 */
export async function updateNotificationPreferences(
    changes: Partial<NotificationPreferences>,
): Promise<{ ok: boolean; error?: string }> {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return { ok: false, error: 'Not signed in.' };

    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(changes)) {
        const column = COLUMN_FOR[key as keyof NotificationPreferences];
        if (column && value !== undefined) patch[column] = value;
    }
    if (Object.keys(patch).length === 0) return { ok: true };

    const { error } = await supabase
        .from('user_settings')
        .upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' });

    if (error) {
        console.error('[Notifications] Could not save preferences:', error);
        return { ok: false, error: error.message };
    }
    return { ok: true };
}

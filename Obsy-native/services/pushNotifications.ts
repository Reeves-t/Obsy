import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import type { NotificationType } from '@/constants/notifications';

/**
 * Remote push registration.
 *
 * Obsy sends notifications from the server (see `supabase/functions/_shared/push.ts`),
 * so the client's job is narrow: ask permission, obtain an Expo push token, and
 * keep that token and the device's timezone current in the database. Every
 * decision about *whether* to deliver is made server-side, where the user's
 * preferences live — a client that is offline or uninstalled cannot suppress a
 * notification it should not receive.
 */

// Foreground presentation. Notifications that arrive while the app is open are
// still shown: Obsy's are time-relevant ("you have not logged today"), and
// silently swallowing them makes the feature look broken.
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
    }),
});

export type PushRegistrationResult =
    | { status: 'registered'; token: string }
    | { status: 'denied' }
    | { status: 'unsupported'; reason: string }
    | { status: 'error'; error: string };

/** The device's IANA timezone, e.g. "America/New_York". */
function getDeviceTimezone(): string | null {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
    } catch {
        return null;
    }
}

/**
 * The EAS project id, which `getExpoPushTokenAsync` requires in a production
 * build. It is absent in bare Expo Go runs, where push is unsupported anyway.
 */
function getProjectId(): string | undefined {
    return (
        Constants.expoConfig?.extra?.eas?.projectId ??
        // Older config shape, still present in some EAS builds.
        (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId
    );
}

/** Whether the OS has already granted notification permission. */
export async function hasPermission(): Promise<boolean> {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
}

/**
 * Request permission and register this device for push.
 *
 * Call this only when the user has asked for notifications — iOS gives one
 * permission prompt per install, and spending it on app launch before the user
 * knows what they would be agreeing to is how apps get permanently denied.
 */
export async function registerForPushNotifications(): Promise<PushRegistrationResult> {
    if (!Device.isDevice) {
        return { status: 'unsupported', reason: 'Push notifications require a physical device.' };
    }

    try {
        const existing = await Notifications.getPermissionsAsync();
        let status = existing.status;

        if (status !== 'granted') {
            const requested = await Notifications.requestPermissionsAsync();
            status = requested.status;
        }

        if (status !== 'granted') {
            return { status: 'denied' };
        }

        const projectId = getProjectId();
        if (!projectId) {
            return {
                status: 'unsupported',
                reason: 'No EAS project id — push tokens are only available in an EAS build.',
            };
        }

        const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
        const token = tokenResponse.data;

        await syncTokenToServer(token);

        return { status: 'registered', token };
    } catch (error) {
        console.error('[Push] Registration failed:', error);
        return { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Upsert this device's token and timezone.
 *
 * Conflicts resolve on `token` rather than `user_id`: one account may have
 * several devices, and one device that signs into a second account must move
 * to the new owner instead of leaving the previous account able to receive its
 * notifications.
 */
async function syncTokenToServer(token: string): Promise<void> {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return;

    const { error } = await supabase.from('push_tokens').upsert(
        {
            user_id: userId,
            token,
            platform: Platform.OS === 'ios' ? 'ios' : 'android',
            device_id: Constants.sessionId ?? null,
            updated_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'token' },
    );

    if (error) {
        console.error('[Push] Could not save token:', error);
        throw error;
    }

    await syncTimezone(userId);
}

/**
 * Keep the stored timezone current. The scheduled senders use it to decide
 * when the user's local reminder time and quiet-hours window fall, so a stale
 * value means notifications land at the wrong hour after travel or a DST shift.
 */
export async function syncTimezone(userId?: string): Promise<void> {
    const timezone = getDeviceTimezone();
    if (!timezone) return;

    let id = userId;
    if (!id) {
        const { data } = await supabase.auth.getUser();
        id = data.user?.id;
    }
    if (!id) return;

    const { error } = await supabase
        .from('user_settings')
        .update({ timezone })
        .eq('user_id', id);

    if (error) console.warn('[Push] Could not sync timezone:', error);
}

/**
 * Remove this device's token.
 *
 * Called when the user turns notifications off and on sign-out. Deleting the
 * row is deliberate: leaving a valid token behind means the server still has a
 * working delivery target for someone who opted out, and on a shared device it
 * would send the next person's notifications to the previous account.
 */
export async function unregisterPushNotifications(): Promise<void> {
    try {
        const projectId = getProjectId();
        if (!projectId || !Device.isDevice) return;

        const { data: userData } = await supabase.auth.getUser();
        const userId = userData.user?.id;
        if (!userId) return;

        const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
        const { error } = await supabase
            .from('push_tokens')
            .delete()
            .eq('user_id', userId)
            .eq('token', tokenResponse.data);

        if (error) console.warn('[Push] Could not remove token:', error);
    } catch (error) {
        // Never block sign-out on token cleanup.
        console.warn('[Push] Unregister failed:', error);
    }
}

/**
 * Integration point for the shared-link inbox (in progress, not yet in this
 * repo). Call this when quick-shared links have been sitting un-triaged long
 * enough to be worth a nudge — the preference toggle, quiet-hours handling,
 * and delivery path already exist for the `shared_link_pending` type.
 *
 * Two things are needed before it does anything:
 *   1. Flip `available: true` on `shared_link_pending` in constants/notifications.ts
 *      so the Settings toggle appears.
 *   2. Decide the trigger — most likely a scheduled sweep over links older than
 *      some threshold, since "pending" is a state that ages rather than an event.
 */
export async function notifySharedLinksPending(pendingCount: number): Promise<void> {
    if (pendingCount <= 0) return;
    await requestServerNotification('shared_link_pending', { pendingCount });
}

/**
 * Ask the server to consider sending a notification. The server still checks
 * the master switch, the per-type toggle, and quiet hours before delivering —
 * this only reports that something notification-worthy happened.
 */
export async function requestServerNotification(
    type: NotificationType,
    payload: Record<string, unknown> = {},
): Promise<void> {
    try {
        const { error } = await supabase.functions.invoke('send-notification', {
            body: { type, payload },
        });
        if (error) console.warn(`[Push] ${type} request failed:`, error);
    } catch (error) {
        console.warn(`[Push] ${type} request threw:`, error);
    }
}

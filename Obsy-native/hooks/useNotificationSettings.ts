import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking } from 'react-native';
import {
    getNotificationPreferences,
    updateNotificationPreferences,
    DEFAULT_PREFERENCES,
    type NotificationPreferences,
} from '@/services/notificationPreferences';
import {
    registerForPushNotifications,
    unregisterPushNotifications,
    hasPermission,
} from '@/services/pushNotifications';

/**
 * State and handlers for the Notifications settings section.
 *
 * Preferences are optimistic: the switch moves immediately and rolls back if
 * the write fails, because a toggle that waits on the network feels broken.
 * The master switch is different — it owns the OS permission prompt and the
 * push token, so it stays busy until both have actually happened.
 */
export function useNotificationSettings(isGuest: boolean) {
    const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            if (isGuest) {
                if (!cancelled) setLoading(false);
                return;
            }
            const prefs = await getNotificationPreferences();
            if (cancelled) return;

            // The OS is the source of truth for permission. If it was revoked in
            // Settings while we still had the flag on, the stored preference is a
            // lie — reconcile rather than showing a switch that does nothing.
            if (prefs.notificationsEnabled && !(await hasPermission())) {
                await updateNotificationPreferences({ notificationsEnabled: false });
                if (!cancelled) setPreferences({ ...prefs, notificationsEnabled: false });
            } else if (!cancelled) {
                setPreferences(prefs);
            }
            if (!cancelled) setLoading(false);
        })();

        return () => {
            cancelled = true;
        };
    }, [isGuest]);

    /** Optimistic write for everything except the master switch. */
    const update = useCallback(
        async (changes: Partial<NotificationPreferences>) => {
            const previous = preferences;
            setPreferences((current) => ({ ...current, ...changes }));

            const result = await updateNotificationPreferences(changes);
            if (!result.ok) {
                setPreferences(previous);
                Alert.alert(
                    'Could not save',
                    'Your notification preference was not saved. Please try again.',
                );
            }
        },
        [preferences],
    );

    /**
     * Turn notifications on or off.
     *
     * On: request OS permission, register a push token, then persist. If the
     * user declines we do not flip the switch — showing it on while iOS blocks
     * delivery would be a straightforward lie about what the app will do.
     *
     * Off: drop the token first, so the server stops having a delivery target
     * even if the settings write fails afterwards.
     */
    const setEnabled = useCallback(
        async (enabled: boolean) => {
            if (busy) return;
            setBusy(true);
            try {
                if (enabled) {
                    const result = await registerForPushNotifications();

                    if (result.status === 'denied') {
                        Alert.alert(
                            'Notifications are blocked',
                            'Obsy needs notification permission from iOS. You can turn it on in Settings.',
                            [
                                { text: 'Not now', style: 'cancel' },
                                { text: 'Open Settings', onPress: () => Linking.openSettings() },
                            ],
                        );
                        return;
                    }

                    if (result.status === 'unsupported') {
                        Alert.alert('Not available here', result.reason);
                        return;
                    }

                    if (result.status === 'error') {
                        Alert.alert('Could not enable notifications', result.error);
                        return;
                    }

                    await update({ notificationsEnabled: true });
                } else {
                    await unregisterPushNotifications();
                    await update({ notificationsEnabled: false });
                }
            } finally {
                setBusy(false);
            }
        },
        [busy, update],
    );

    return { preferences, loading, busy, update, setEnabled };
}

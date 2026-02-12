/**
 * Notifications Module — Orchestration
 * =======================================
 * Single entry point that ties settings, local scheduling, and
 * (future) remote push together. Call `refreshLocalNotifications()`
 * from any trigger point:
 *
 *   - App start
 *   - App foreground (AppState → active)
 *   - Settings changes
 *   - Year-in-Pixels pixel updates
 */

export { NotificationType, type ObsyNotificationData } from './types';
export { useNotificationSettingsStore, type NotificationSettingsState } from './settingsStore';
export {
  configureNotificationHandler,
  requestPermission,
  cancelAllLocalObsyNotifications,
  cancelTodayYearPixelsReminder,
  scheduleCheckinSlotsRepeatingDaily,
  scheduleYearPixelsOneTimeIfNeeded,
} from './localNotifications';
export {
  registerForRemotePushToken,
  syncPushTokenToBackend,
  handleRemoteNotificationRouting,
} from './remoteNotifications';

import { useNotificationSettingsStore } from './settingsStore';
import { useYearInPixelsStore } from '../yearInPixelsStore';
import { getLocalDayKey } from '../utils';
import {
  cancelAllLocalObsyNotifications,
  scheduleCheckinSlotsRepeatingDaily,
  scheduleYearPixelsOneTimeIfNeeded,
} from './localNotifications';

// ─────────────────────────────────────────────────────────────────────────────
// Refresh Logic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read current settings + pixel state, then cancel/reschedule all
 * local notifications accordingly. Safe to call frequently — it's
 * idempotent (cancels before rescheduling).
 */
export async function refreshLocalNotifications(): Promise<void> {
  const settings = useNotificationSettingsStore.getState();

  // If master toggle is off, cancel everything and bail
  if (!settings.remindersEnabled) {
    await cancelAllLocalObsyNotifications();
    return;
  }

  // Check if today's pixel is coloured
  const pixels = useYearInPixelsStore.getState().pixels;
  const todayKey = getLocalDayKey();
  const todayPixel = pixels[todayKey];
  const isTodayColored = !!(
    todayPixel?.color ||
    (todayPixel?.strokes && todayPixel.strokes.length > 0)
  );

  // Schedule check-in reminders (repeating daily)
  await scheduleCheckinSlotsRepeatingDaily(settings.checkinSlots);

  // Schedule year-in-pixels one-time reminder for today
  await scheduleYearPixelsOneTimeIfNeeded(
    {
      yearPixelsEnabled: settings.yearPixelsEnabled,
      yearPixelsHour: settings.yearPixelsHour,
      yearPixelsMinute: settings.yearPixelsMinute,
    },
    isTodayColored
  );
}

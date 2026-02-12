import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
  NotificationType,
  OBSY_NOTIFICATION_PREFIX,
  CHECKIN_MESSAGES,
  YEAR_PIXELS_MESSAGES,
  CheckinSlot,
  ObsyNotificationData,
} from './types';
import { NotificationSettingsState } from './settingsStore';
import { getLocalDayKey } from '../utils';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configure default notification behaviour (sound, badge, banner).
 * Call once at app startup.
 */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
      priority: Notifications.AndroidNotificationPriority.DEFAULT,
    }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Permissions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Request notification permission from the OS.
 * Returns true if granted, false otherwise.
 */
export async function requestPermission(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ─────────────────────────────────────────────────────────────────────────────
// Cancel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cancel ALL Obsy-scheduled local notifications.
 * Leaves notifications from other sources untouched.
 */
export async function cancelAllLocalObsyNotifications(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const obsyIds = scheduled
    .filter((n) => n.identifier.startsWith(OBSY_NOTIFICATION_PREFIX))
    .map((n) => n.identifier);

  for (const id of obsyIds) {
    await Notifications.cancelScheduledNotificationAsync(id);
  }
}

/**
 * Cancel only the Year-in-Pixels reminder for today.
 */
export async function cancelTodayYearPixelsReminder(): Promise<void> {
  const todayKey = getLocalDayKey();
  const id = `${OBSY_NOTIFICATION_PREFIX}-${NotificationType.YEAR_PIXELS_REMINDER}-${todayKey}`;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // Notification may not exist — that's fine
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Schedule: Daily Check-in Reminders (repeating)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cancel existing check-in notifications, then schedule the enabled slots
 * as daily repeating notifications.
 */
export async function scheduleCheckinSlotsRepeatingDaily(
  slots: [CheckinSlot, CheckinSlot, CheckinSlot]
): Promise<void> {
  // Cancel existing check-in notifications
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const checkinIds = scheduled
    .filter((n) => n.identifier.startsWith(`${OBSY_NOTIFICATION_PREFIX}-${NotificationType.CHECKIN_REMINDER}`))
    .map((n) => n.identifier);

  for (const id of checkinIds) {
    await Notifications.cancelScheduledNotificationAsync(id);
  }

  // Schedule enabled slots
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (!slot.enabled) continue;

    const message = CHECKIN_MESSAGES[Math.floor(Math.random() * CHECKIN_MESSAGES.length)];
    const identifier = `${OBSY_NOTIFICATION_PREFIX}-${NotificationType.CHECKIN_REMINDER}-slot${i}`;

    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: message.title,
        body: message.body,
        data: { type: NotificationType.CHECKIN_REMINDER } as ObsyNotificationData,
        sound: false,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: slot.hour,
        minute: slot.minute,
      },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Schedule: Year-in-Pixels One-Time Reminder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schedule a one-time Year-in-Pixels reminder for today IF:
 * - Year pixels reminder is enabled
 * - Today's pixel is NOT coloured
 * - The reminder time hasn't passed yet today
 *
 * If today's pixel IS coloured, or time has passed, cancels any existing one.
 */
export async function scheduleYearPixelsOneTimeIfNeeded(
  settings: Pick<NotificationSettingsState, 'yearPixelsEnabled' | 'yearPixelsHour' | 'yearPixelsMinute'>,
  isTodayColored: boolean
): Promise<void> {
  const todayKey = getLocalDayKey();
  const identifier = `${OBSY_NOTIFICATION_PREFIX}-${NotificationType.YEAR_PIXELS_REMINDER}-${todayKey}`;

  // Always cancel any existing today reminder first
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  } catch {
    // May not exist
  }

  // Don't schedule if disabled, already coloured, or time has passed
  if (!settings.yearPixelsEnabled || isTodayColored) return;

  const now = new Date();
  const triggerDate = new Date();
  triggerDate.setHours(settings.yearPixelsHour, settings.yearPixelsMinute, 0, 0);

  if (triggerDate <= now) return; // Time already passed today

  const message = YEAR_PIXELS_MESSAGES[Math.floor(Math.random() * YEAR_PIXELS_MESSAGES.length)];

  await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: message.title,
      body: message.body,
      data: { type: NotificationType.YEAR_PIXELS_REMINDER } as ObsyNotificationData,
      sound: false,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
    },
  });
}

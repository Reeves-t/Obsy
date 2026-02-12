/**
 * Notification Types & Constants
 * ================================
 * Shared type definitions for both local and remote notifications.
 * These keys are used for notification routing, scheduling identifiers,
 * and will be reused when migrating to remote push via EAS.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Notification Channel / Type Keys
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every Obsy notification carries one of these type keys.
 * Used as the notification identifier prefix and for routing on tap.
 */
export enum NotificationType {
  // Local (MVP)
  CHECKIN_REMINDER = 'obsy.checkin',
  YEAR_PIXELS_REMINDER = 'obsy.year-pixels',

  // Remote (future)
  ALBUM_NEW_POST = 'obsy.album.new-post',
  ALBUM_ACTIVITY = 'obsy.album.activity',
}

/**
 * Identifier prefix for all Obsy-scheduled local notifications.
 * Used to cancel only Obsy notifications without affecting other apps.
 */
export const OBSY_NOTIFICATION_PREFIX = 'obsy-notif';

// ─────────────────────────────────────────────────────────────────────────────
// Check-in Reminder Copy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calm, minimal notification copy for check-in reminders.
 * Rotated randomly per notification.
 */
export const CHECKIN_MESSAGES = [
  {
    title: 'Obsy',
    body: 'Quick check-in? Capture the mood of this moment.',
  },
  {
    title: 'Obsy',
    body: 'A moment to pause. How does right now feel?',
  },
  {
    title: 'Obsy',
    body: 'What colour is this part of your day?',
  },
  {
    title: 'Obsy',
    body: 'Tap in. One capture, one thought.',
  },
  {
    title: 'Obsy',
    body: 'Still here. Ready when you are.',
  },
];

export const YEAR_PIXELS_MESSAGES = [
  {
    title: 'Obsy',
    body: "Today's pixel is still blank. Colour it before bed?",
  },
  {
    title: 'Obsy',
    body: 'One pixel left for today. What colour was it?',
  },
  {
    title: 'Obsy',
    body: "Don't forget your pixel. How was today?",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Check-in Slot Defaults
// ─────────────────────────────────────────────────────────────────────────────

export interface CheckinSlot {
  enabled: boolean;
  hour: number;
  minute: number;
}

export const DEFAULT_CHECKIN_SLOTS: [CheckinSlot, CheckinSlot, CheckinSlot] = [
  { enabled: true, hour: 9, minute: 0 },
  { enabled: true, hour: 13, minute: 0 },
  { enabled: true, hour: 19, minute: 30 },
];

export const DEFAULT_YEAR_PIXELS_HOUR = 21; // 9:00 PM
export const DEFAULT_YEAR_PIXELS_MINUTE = 0;

// ─────────────────────────────────────────────────────────────────────────────
// Notification Data Payload
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Data attached to every Obsy notification.
 * Used for routing when the user taps a notification.
 */
export interface ObsyNotificationData {
  type: NotificationType;
  /** For album notifications: which album triggered it */
  albumId?: string;
  /** For album notifications: which post triggered it */
  postId?: string;
  /** Allow additional keys for compatibility with expo-notifications data */
  [key: string]: unknown;
}

/**
 * Remote Push Notifications — Placeholder Stubs
 * ================================================
 * These functions are scaffolded for the future EAS + Supabase migration.
 * None of them perform real work in the MVP. They exist so the call sites,
 * settings UI, and notification routing logic are already wired and won't
 * need rewriting when remote push is implemented.
 *
 * ── Future Implementation Plan (Shared Albums) ──────────────────────────────
 *
 * Backend events:
 *   When a user posts to an album, an insert into `album_posts` triggers a
 *   Supabase Edge Function (or database webhook) that:
 *     1. Queries `album_members` to find all members except the poster
 *     2. Fetches each member's `push_tokens`
 *     3. Sends a push notification to each device via APNs / FCM
 *     4. Respects per-user `notification_settings` (album_activity_enabled)
 *     5. Rate-limits: bundles multiple posts within 5 minutes into one
 *        notification per album per recipient
 *
 * Data tables (Supabase):
 *   - users
 *   - albums (id, name, created_by, created_at)
 *   - album_members (album_id, user_id, role, joined_at)
 *   - album_posts (id, album_id, user_id, created_at, image_url, caption)
 *   - push_tokens (id, user_id, token, platform, updated_at, enabled)
 *   - notification_settings (user_id, album_activity_enabled,
 *       album_new_posts_enabled, updated_at)
 *
 * Client behaviour on remote notification tap:
 *   - Parse `data.type` from the notification payload
 *   - If `ALBUM_NEW_POST`: deep-link to Album detail screen, scroll to
 *     the newest post (data.albumId, data.postId)
 *   - Future: per-album notification preferences
 *
 * ── EAS Migration Checklist ─────────────────────────────────────────────────
 *
 *   [ ] Create Apple bundle ID + enable Push Notification capability
 *   [ ] Configure EAS build (eas.json) for iOS dev + production
 *   [ ] Implement `registerForRemotePushToken()` using expo-notifications
 *       `getExpoPushTokenAsync()` or `getDevicePushTokenAsync()`
 *   [ ] Store push token in Supabase `push_tokens` table tied to user
 *   [ ] Implement Supabase Edge Function to send pushes on album_posts insert
 *   [ ] Add rate-limiting logic in Edge Function (bundle within 5 min window)
 *   [ ] Test with EAS dev builds first, then production
 *   [ ] Wire `handleRemoteNotificationRouting()` to actual deep-link logic
 *   [ ] Enable album notification toggles in settings UI (remove disabled state)
 */

import { NotificationType, ObsyNotificationData } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Token Registration (future)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register for a remote push token via EAS / APNs.
 * Returns the token string, or null if unavailable.
 *
 * Implementation (future):
 *   const token = await Notifications.getExpoPushTokenAsync({ projectId });
 *   return token.data;
 */
export async function registerForRemotePushToken(): Promise<string | null> {
  // Stub — no-op in MVP
  return null;
}

/**
 * Send the device push token to the backend so the server can target this device.
 *
 * Implementation (future):
 *   await supabase.from('push_tokens').upsert({
 *     user_id, token, platform: Platform.OS, updated_at: new Date().toISOString(),
 *   });
 */
export async function syncPushTokenToBackend(_token: string): Promise<void> {
  // Stub — no-op in MVP
}

// ─────────────────────────────────────────────────────────────────────────────
// Remote Notification Routing (future)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle taps on remote push notifications.
 * Routes to the correct screen based on notification type.
 *
 * Implementation (future):
 *   switch (data.type) {
 *     case NotificationType.ALBUM_NEW_POST:
 *       router.push(`/albums/${data.albumId}?highlight=${data.postId}`);
 *       break;
 *   }
 */
export function handleRemoteNotificationRouting(_data: ObsyNotificationData): void {
  // Stub — no-op in MVP
}

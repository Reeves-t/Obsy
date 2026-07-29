// Shared push delivery.
//
// Every notification Obsy sends goes through `sendNotification` so the rules
// live in exactly one place: the master switch, the per-type toggle, quiet
// hours in the user's own timezone, and dedupe. Callers describe what happened;
// this module decides whether it reaches the device.
//
// Deliberately server-side: a client cannot suppress a notification it should
// receive, and scheduled senders run whether or not the app is open.

// deno-lint-ignore-file no-explicit-any

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

export type NotificationType =
  | "daily_reminder"
  | "streak"
  | "monthly_insight"
  | "shared_link_pending";

/** Mirrors constants/notifications.ts on the client. */
const SETTINGS_COLUMN: Record<NotificationType, string> = {
  daily_reminder: "notify_daily_reminder",
  streak: "notify_streak",
  monthly_insight: "notify_monthly_insight",
  shared_link_pending: "notify_shared_link_pending",
};

export interface SendOptions {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Delivered to the app for deep-linking; keep it small and non-sensitive. */
  data?: Record<string, unknown>;
  /**
   * Collapses a logical send, e.g. "daily_reminder:2026-07-28". A repeat with
   * the same key is a no-op, which is what makes overlapping or retried
   * scheduler runs safe.
   */
  dedupeKey: string;
}

export type SendResult =
  | { sent: true; deviceCount: number }
  | { sent: false; reason: "disabled" | "type_disabled" | "quiet_hours" | "no_tokens" | "duplicate" };

interface PreferenceRow {
  notifications_enabled: boolean | null;
  quiet_hours_enabled: boolean | null;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string | null;
  [key: string]: unknown;
}

/** Minutes since local midnight, in the given IANA zone. UTC if unknown. */
export function minutesSinceMidnightInZone(now: Date, timezone: string | null): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone ?? "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    // en-US with hour12:false renders midnight as "24"; normalize it.
    return (hour % 24) * 60 + minute;
  } catch {
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  }
}

/** "HH:MM" or "HH:MM:SS" to minutes since midnight. */
export function parseTimeToMinutes(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const [h, m] = value.split(":");
  const hour = Number(h);
  const minute = Number(m);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return fallback;
  return hour * 60 + minute;
}

/**
 * Whether `nowMinutes` falls inside the quiet window.
 *
 * The window normally wraps midnight (22:00 → 08:00), so a naive
 * start <= now < end comparison is wrong for the common case and would leave
 * the small hours unprotected — exactly when a notification does most damage.
 */
export function isWithinQuietHours(
  nowMinutes: number,
  startMinutes: number,
  endMinutes: number,
): boolean {
  if (startMinutes === endMinutes) return false; // zero-length window
  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

/**
 * Deliver a notification if the user's preferences allow it.
 *
 * `admin` must be a service-role client: it reads preferences and writes the
 * delivery log, neither of which the user's own JWT should be able to do.
 */
export async function sendNotification(
  admin: any,
  options: SendOptions,
): Promise<SendResult> {
  const { userId, type, title, body, data, dedupeKey } = options;

  const column = SETTINGS_COLUMN[type];

  const { data: prefs, error: prefsError } = await admin
    .from("user_settings")
    .select(
      `notifications_enabled, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, timezone, ${column}`,
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (prefsError) {
    console.error("[push] Could not read preferences:", prefsError);
    return { sent: false, reason: "disabled" };
  }

  const row = (prefs ?? null) as PreferenceRow | null;

  // No settings row means the user has never enabled notifications. Default to
  // silence — the master switch defaults false precisely so we never deliver on
  // an assumption of consent.
  if (!row || row.notifications_enabled !== true) {
    return { sent: false, reason: "disabled" };
  }
  if (row[column] !== true) {
    return { sent: false, reason: "type_disabled" };
  }

  if (row.quiet_hours_enabled === true) {
    const nowMinutes = minutesSinceMidnightInZone(new Date(), row.timezone);
    const start = parseTimeToMinutes(row.quiet_hours_start, 22 * 60);
    const end = parseTimeToMinutes(row.quiet_hours_end, 8 * 60);
    if (isWithinQuietHours(nowMinutes, start, end)) {
      return { sent: false, reason: "quiet_hours" };
    }
  }

  // Claim the dedupe key before sending. Doing it first means a crash between
  // send and log cannot produce a duplicate on the next run; the cost is that a
  // failed send is not retried, which is the right trade for a nudge.
  const { error: dedupeError } = await admin
    .from("notification_deliveries")
    .insert({ user_id: userId, notification_type: type, dedupe_key: dedupeKey });

  if (dedupeError) {
    // 23505 = unique violation: already sent for this key.
    if (dedupeError.code === "23505") return { sent: false, reason: "duplicate" };
    console.error("[push] Could not record delivery:", dedupeError);
    return { sent: false, reason: "disabled" };
  }

  const { data: tokens, error: tokensError } = await admin
    .from("push_tokens")
    .select("token")
    .eq("user_id", userId);

  if (tokensError || !tokens || tokens.length === 0) {
    return { sent: false, reason: "no_tokens" };
  }

  const messages = tokens.map((t: { token: string }) => ({
    to: t.token,
    title,
    body,
    sound: "default",
    data: data ?? {},
  }));

  await deliverToExpo(admin, messages);

  return { sent: true, deviceCount: messages.length };
}

/**
 * POST to Expo's push service and prune tokens it rejects.
 *
 * Expo returns a per-message ticket; `DeviceNotRegistered` means the install is
 * gone. Dropping those keeps the table from filling with tokens that can never
 * deliver and that we would otherwise keep counting as reachable devices.
 */
async function deliverToExpo(admin: any, messages: any[]): Promise<void> {
  // Expo accepts up to 100 messages per request.
  const BATCH = 100;
  for (let i = 0; i < messages.length; i += BATCH) {
    const batch = messages.slice(i, i + BATCH);
    try {
      const response = await fetch(EXPO_PUSH_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(batch),
      });

      if (!response.ok) {
        console.error("[push] Expo rejected the batch:", response.status, await response.text());
        continue;
      }

      const result = await response.json();
      const tickets: any[] = result?.data ?? [];
      const dead: string[] = [];

      tickets.forEach((ticket, index) => {
        if (ticket?.status === "error" && ticket?.details?.error === "DeviceNotRegistered") {
          dead.push(batch[index].to);
        }
      });

      if (dead.length > 0) {
        const { error } = await admin.from("push_tokens").delete().in("token", dead);
        if (error) console.warn("[push] Could not prune dead tokens:", error);
      }
    } catch (error) {
      console.error("[push] Delivery failed:", error);
    }
  }
}

// Supabase Edge Function: send-notification
//
// Client-callable dispatcher for event-driven notifications. The app reports
// that something happened ("I just saved a capture"); this function decides
// whether that warrants a notification, writes the copy, and hands off to the
// shared sender, which enforces the user's preferences and quiet hours.
//
// The client never supplies the notification text and is not trusted about
// whether the event qualifies. Streaks are recomputed here from `entries`, so
// a modified client cannot manufacture a milestone. That keeps the one
// user-visible output of this endpoint honest.
//
// Scheduled notifications (the daily reminder) live in `send-daily-reminders`.

// deno-lint-ignore-file no-explicit-any

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { sendNotification, type NotificationType } from "../_shared/push/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Streak lengths worth interrupting someone for. */
const STREAK_MILESTONES = new Set([3, 7, 14, 30, 60, 100, 180, 365]);

const HANDLED: NotificationType[] = ["streak", "monthly_insight", "shared_link_pending"];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Consecutive days ending today (or yesterday) on which the user logged an
 * entry, counted in their own timezone — a "day" boundary in UTC would break
 * the streak for anyone logging in the evening west of Greenwich.
 */
async function computeStreak(admin: any, userId: string, timezone: string | null): Promise<number> {
  // 400 days is well past the longest milestone and bounds the scan.
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 400);

  const { data, error } = await admin
    .from("entries")
    .select("created_at")
    .eq("user_id", userId)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false });

  if (error || !data || data.length === 0) return 0;

  const zone = timezone ?? "UTC";
  const dayKey = (iso: string): string => {
    try {
      // en-CA renders as YYYY-MM-DD, which sorts and compares as a plain string.
      return new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date(iso));
    } catch {
      return new Date(iso).toISOString().slice(0, 10);
    }
  };

  const days = new Set<string>(data.map((row: { created_at: string }) => dayKey(row.created_at)));

  const today = dayKey(new Date().toISOString());

  // Calendar arithmetic on a YYYY-MM-DD string. Anchoring at noon means adding
  // or subtracting whole days never lands on a DST transition and shifts the date.
  const shift = (base: string, back: number): string => {
    const d = new Date(`${base}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - back);
    return d.toISOString().slice(0, 10);
  };

  // Let the streak end yesterday as well as today: someone logging at 00:30
  // should hear about the run they just completed, not be told it broke.
  const anchor = days.has(today) ? today : shift(today, 1);
  if (!days.has(anchor)) return 0;

  let streak = 0;
  while (days.has(shift(anchor, streak))) {
    streak += 1;
  }
  return streak;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // 1. Authenticate the caller.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing authorization header" }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  const userId = userData?.user?.id;
  if (userError || !userId) return json({ error: "Invalid session" }, 401);

  // 2. Parse and validate the request.
  let payload: { type?: string; payload?: Record<string, unknown> };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const type = payload.type as NotificationType | undefined;
  if (!type || !HANDLED.includes(type)) {
    return json({ error: `Unsupported notification type: ${type ?? "none"}` }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: settings } = await admin
    .from("user_settings")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();
  const timezone: string | null = settings?.timezone ?? null;

  // 3. Decide, per type, whether this is worth sending.
  try {
    if (type === "streak") {
      const streak = await computeStreak(admin, userId, timezone);
      if (!STREAK_MILESTONES.has(streak)) {
        return json({ sent: false, reason: "not_a_milestone", streak });
      }

      const result = await sendNotification(admin, {
        userId,
        type: "streak",
        title: `${streak} days in a row`,
        body:
          streak >= 30
            ? `${streak} days of noticing. That is a real habit now.`
            : `You have logged ${streak} days running. Nice work.`,
        data: { type: "streak", streak },
        // One milestone announcement per streak length, so re-opening the app
        // on the same day cannot re-send it.
        dedupeKey: `streak:${streak}`,
      });
      return json({ ...result, streak });
    }

    if (type === "monthly_insight") {
      const month = typeof payload.payload?.month === "string"
        ? payload.payload.month
        : new Date().toISOString().slice(0, 7);

      const result = await sendNotification(admin, {
        userId,
        type: "monthly_insight",
        title: "Your monthly insight is ready",
        body: "There is enough here to see the shape of the month. Take a look.",
        data: { type: "monthly_insight", month },
        dedupeKey: `monthly_insight:${month}`,
      });
      return json(result);
    }

    if (type === "shared_link_pending") {
      const count = Number(payload.payload?.pendingCount ?? 0);
      if (!Number.isFinite(count) || count <= 0) {
        return json({ sent: false, reason: "nothing_pending" });
      }

      const day = new Date().toISOString().slice(0, 10);
      const result = await sendNotification(admin, {
        userId,
        type: "shared_link_pending",
        title: count === 1 ? "A link is waiting" : `${count} links are waiting`,
        body:
          count === 1
            ? "You shared something to Obsy that has not become an entry yet."
            : "You shared these to Obsy but have not turned them into entries yet.",
        data: { type: "shared_link_pending", count },
        // At most one nudge a day, however many times the app reports pending links.
        dedupeKey: `shared_link_pending:${day}`,
      });
      return json(result);
    }

    return json({ error: "Unhandled type" }, 400);
  } catch (error) {
    console.error("[send-notification] Failed:", error);
    return json({ error: "Internal error" }, 500);
  }
});

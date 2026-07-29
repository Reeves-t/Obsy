// Supabase Edge Function: send-daily-reminders
//
// Scheduled sweep for the daily capture reminder. Intended to run hourly via
// pg_cron / Supabase Scheduled Functions; it selects the users whose chosen
// local reminder time falls in the hour that just started and who have not
// logged anything today in their own timezone.
//
// Running hourly rather than per-minute keeps the job cheap while still landing
// each user's reminder within their chosen hour. The delivery log's unique
// dedupe key makes an overlapping or retried run a no-op rather than a
// double-send.
//
// Not client-callable: it needs the service role and acts on every user, so it
// requires the scheduler's secret.

// deno-lint-ignore-file no-explicit-any

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { sendNotification, minutesSinceMidnightInZone, parseTimeToMinutes } from "../_shared/push/index.ts";

const BATCH_SIZE = 500;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** YYYY-MM-DD for `now` in the given zone. */
function localDay(now: Date, timezone: string | null): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone ?? "UTC" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

interface Candidate {
  user_id: string;
  daily_reminder_time: string | null;
  timezone: string | null;
}

serve(async (req: Request) => {
  // Only the scheduler may run this. Without the check, anyone who learned the
  // URL could trigger a fan-out send to the whole user base.
  const expectedSecret = Deno.env.get("NOTIFICATION_SCHEDULER_SECRET");
  const providedSecret = req.headers.get("x-scheduler-secret");
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const now = new Date();

  const summary = { considered: 0, sent: 0, skipped: 0, alreadyLogged: 0 };

  let from = 0;
  // Page through everyone who wants this notification. The per-user work is a
  // couple of indexed reads, and the outer filter already excludes opt-outs.
  for (;;) {
    const { data, error } = await admin
      .from("user_settings")
      .select("user_id, daily_reminder_time, timezone")
      .eq("notifications_enabled", true)
      .eq("notify_daily_reminder", true)
      .range(from, from + BATCH_SIZE - 1);

    if (error) {
      console.error("[daily-reminders] Could not load candidates:", error);
      return json({ error: "Query failed", summary }, 500);
    }
    if (!data || data.length === 0) break;

    for (const row of data as Candidate[]) {
      summary.considered += 1;

      const nowMinutes = minutesSinceMidnightInZone(now, row.timezone);
      const targetMinutes = parseTimeToMinutes(row.daily_reminder_time, 20 * 60);

      // Fire when the user's local clock is inside the hour their reminder is
      // set for. An exact-minute match would drop the reminder entirely on any
      // run that drifted by a minute.
      const sameHour = Math.floor(nowMinutes / 60) === Math.floor(targetMinutes / 60);
      if (!sameHour) {
        summary.skipped += 1;
        continue;
      }

      const day = localDay(now, row.timezone);

      // Skip anyone who already logged today — the reminder exists to catch a
      // missed day, and sending it to someone who just journaled is noise.
      const dayStart = new Date(`${day}T00:00:00Z`);
      dayStart.setUTCDate(dayStart.getUTCDate() - 1); // widen for timezone offset
      const { count, error: countError } = await admin
        .from("entries")
        .select("id", { count: "exact", head: true })
        .eq("user_id", row.user_id)
        .gte("created_at", dayStart.toISOString());

      if (countError) {
        console.warn("[daily-reminders] Entry check failed:", row.user_id, countError);
        summary.skipped += 1;
        continue;
      }

      if ((count ?? 0) > 0) {
        // The widened window can include yesterday, so confirm against the
        // user's actual local day before deciding they have already logged.
        const { data: recent } = await admin
          .from("entries")
          .select("created_at")
          .eq("user_id", row.user_id)
          .gte("created_at", dayStart.toISOString())
          .order("created_at", { ascending: false })
          .limit(50);

        const loggedToday = (recent ?? []).some(
          (e: { created_at: string }) => localDay(new Date(e.created_at), row.timezone) === day,
        );

        if (loggedToday) {
          summary.alreadyLogged += 1;
          continue;
        }
      }

      const result = await sendNotification(admin, {
        userId: row.user_id,
        type: "daily_reminder",
        title: "Nothing logged today",
        body: "A moment, a mood, a sentence. That is enough.",
        data: { type: "daily_reminder" },
        // One reminder per user per local day.
        dedupeKey: `daily_reminder:${day}`,
      });

      if (result.sent) summary.sent += 1;
      else summary.skipped += 1;
    }

    if (data.length < BATCH_SIZE) break;
    from += BATCH_SIZE;
  }

  return json({ ok: true, summary });
});

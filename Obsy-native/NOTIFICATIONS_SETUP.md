# Push Notifications — Setup

Remote push for Obsy. The code is in place; the steps below are the ones that
need Apple credentials or Supabase dashboard access.

## What ships

| Type | Trigger | Where |
|---|---|---|
| `daily_reminder` | Scheduled hourly sweep; fires in the hour matching the user's chosen local time, only if they have not logged that day | `supabase/functions/send-daily-reminders` |
| `streak` | Entry created → server recomputes the streak and checks it against a milestone list | `supabase/functions/send-notification` |
| `monthly_insight` | Monthly insight finishes generating | `supabase/functions/send-notification` |
| `shared_link_pending` | **Registered but not active** — waiting on the share-inbox feature | see below |

Every send goes through `supabase/functions/_shared/push/index.ts`, which
enforces the master switch, the per-type toggle, quiet hours in the user's own
timezone, and a dedupe key. Nothing bypasses it.

## 1. APNs key (required — this is the blocker)

Remote push does not work without it.

1. Apple Developer portal → **Certificates, Identifiers & Profiles → Keys**
2. Create a key with **Apple Push Notifications service (APNs)** enabled
3. Download the `.p8` — Apple lets you download it **once**
4. Upload it to Expo: `eas credentials` → iOS → production → Push Notifications key

Team ID `ZFPQ2B7DKN` and the ASC app id are already in `eas.json`.

## 2. Deploy the migration and functions

```bash
supabase db push
supabase functions deploy send-notification
supabase functions deploy send-daily-reminders
```

The migration `20260728000001_create_push_notifications.sql` adds `push_tokens`,
`notification_deliveries`, and the preference columns on `user_settings`. Both
new tables cascade from `auth.users`, so account deletion still removes
everything — the Privacy Policy's deletion promise holds.

## 3. Scheduler secret

`send-daily-reminders` acts on every user, so it is not client-callable. It
requires a shared secret:

```bash
supabase secrets set NOTIFICATION_SCHEDULER_SECRET="$(openssl rand -hex 32)"
```

## 4. Schedule the hourly sweep

Run `send-daily-reminders` **once an hour, on the hour**. Users pick a local
reminder time; the sweep fires for those whose current local hour matches.

With `pg_cron` + `pg_net`:

```sql
select cron.schedule(
  'obsy-daily-reminders',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/send-daily-reminders',
    headers := '{"x-scheduler-secret": "<the secret from step 3>"}'::jsonb
  );
  $$
);
```

Hourly rather than per-minute keeps the job cheap while still landing each
reminder inside the chosen hour. Overlapping or retried runs are safe: the
delivery log's unique `(user_id, dedupe_key)` index makes a repeat a no-op.

## 5. Verify on device

Push requires a physical device and an EAS build — it does not work in the
simulator or Expo Go, and `registerForPushNotifications()` returns
`unsupported` in both.

- [ ] Toggle **Push notifications** on in Profile → Notifications; the iOS prompt appears
- [ ] A row lands in `push_tokens` with the right `user_id` and platform
- [ ] `user_settings.timezone` is populated with the device's IANA zone
- [ ] Declining the prompt leaves the switch **off** (it must not show enabled while iOS blocks delivery)
- [ ] Turning the switch off deletes the token row
- [ ] Signing out deletes the token row
- [ ] Set quiet hours to cover now, trigger a notification, confirm it is suppressed
- [ ] Set the reminder time to the next hour with no entry logged, confirm it arrives
- [ ] Log an entry, confirm the reminder does **not** arrive that day

## Notes

**No background modes are declared.** Obsy sends user-visible alerts only, not
silent/content-available pushes, so `UIBackgroundModes: ["remote-notification"]`
is deliberately absent from `app.json`. Declaring an unused background mode
invites App Review questions. If silent push is ever added, that changes.

**Permission is requested on demand, not at launch.** iOS gives one prompt per
install; spending it before the user knows what they would be agreeing to is how
apps get permanently denied. The prompt fires from the Settings toggle.

**The master switch defaults to `false`.** Notifications begin only after the
user turns them on, so we never deliver on an assumption of consent.

## Enabling `shared_link_pending`

The type is fully wired — preference column, Settings toggle, quiet-hours
handling, and delivery path all exist. It is gated off because the share-inbox
feature it describes is still in progress. To turn it on:

1. Flip `available: true` on `shared_link_pending` in `constants/notifications.ts`.
   The Settings toggle appears automatically.
2. Decide the trigger. "Pending" is a state that ages rather than an event, so a
   scheduled sweep over links older than some threshold fits better than firing
   at share time — a nudge one second after sharing is not useful.
3. Call `notifySharedLinksPending(count)` from `services/pushNotifications.ts`.
   The server caps it at one nudge per day regardless of how often it is called.

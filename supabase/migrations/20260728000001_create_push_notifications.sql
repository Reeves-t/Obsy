-- Push notifications: device token registry + per-user delivery preferences.
--
-- Delivery is decided server-side (see the `push` shared module), so every
-- input the sender needs lives here: which types the user wants, when they do
-- not want to be disturbed, and which timezone "10pm" means for them.
--
-- Notification types (kept in sync with constants/notifications.ts):
--   daily_reminder       — "you haven't logged today"
--   streak               — streak and milestone nudges
--   monthly_insight      — monthly insight finished generating
--   shared_link_pending  — quick-shared links still waiting to become entries

-- ============================================================================
-- PUSH TOKENS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.push_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- Expo push token, e.g. ExponentPushToken[xxxxxxxx]. Unique across users:
    -- a device that signs into a second account must move, not duplicate, or
    -- the previous owner keeps receiving that device's notifications.
    token text NOT NULL UNIQUE,
    platform text NOT NULL CHECK (platform IN ('ios', 'android')),
    -- Stable per-install id, so re-registering the same device updates its row
    -- instead of accumulating one per token refresh.
    device_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    -- Touched on every successful registration; lets us prune tokens for
    -- installs that have not opened the app in a long time.
    last_seen_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.push_tokens IS 'Expo push tokens per device. Deleted with the user via ON DELETE CASCADE, so account deletion removes them.';

CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON public.push_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_last_seen ON public.push_tokens(last_seen_at DESC);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'push_tokens' AND policyname = 'Users can insert own push tokens') THEN
        CREATE POLICY "Users can insert own push tokens"
            ON public.push_tokens FOR INSERT
            TO authenticated
            WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'push_tokens' AND policyname = 'Users can read own push tokens') THEN
        CREATE POLICY "Users can read own push tokens"
            ON public.push_tokens FOR SELECT
            TO authenticated
            USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'push_tokens' AND policyname = 'Users can update own push tokens') THEN
        CREATE POLICY "Users can update own push tokens"
            ON public.push_tokens FOR UPDATE
            TO authenticated
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
    END IF;

    -- Signing out, or turning notifications off, must be able to remove the
    -- device's token — otherwise the server keeps a valid delivery target for
    -- someone who opted out.
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'push_tokens' AND policyname = 'Users can delete own push tokens') THEN
        CREATE POLICY "Users can delete own push tokens"
            ON public.push_tokens FOR DELETE
            TO authenticated
            USING (auth.uid() = user_id);
    END IF;
END $$;

-- ============================================================================
-- DELIVERY PREFERENCES (on user_settings)
-- ============================================================================

-- Master switch. Off means nothing is delivered regardless of the per-type
-- flags below, so the UI can offer a single kill switch without rewriting them.
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS notifications_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_settings.notifications_enabled IS 'Master switch. Defaults false: notifications begin only after the user grants OS permission, so we never imply consent the user did not give.';

ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS notify_daily_reminder boolean NOT NULL DEFAULT true;

ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS notify_streak boolean NOT NULL DEFAULT true;

ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS notify_monthly_insight boolean NOT NULL DEFAULT true;

ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS notify_shared_link_pending boolean NOT NULL DEFAULT true;

-- Local wall-clock time the daily reminder should land.
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS daily_reminder_time time NOT NULL DEFAULT '20:00';

-- ============================================================================
-- QUIET HOURS
-- ============================================================================

ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS quiet_hours_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS quiet_hours_start time NOT NULL DEFAULT '22:00';

ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS quiet_hours_end time NOT NULL DEFAULT '08:00';

COMMENT ON COLUMN public.user_settings.quiet_hours_start IS 'Local wall-clock start of do-not-disturb. Window wraps midnight when start > end, which is the common case.';

-- IANA zone (e.g. America/New_York), captured from the device. Without it the
-- scheduler cannot tell when the user's local reminder time or quiet window
-- falls, so every time-based decision degrades to UTC.
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS timezone text;

COMMENT ON COLUMN public.user_settings.timezone IS 'IANA timezone from the device. NULL until first registration; senders fall back to UTC.';

-- ============================================================================
-- DELIVERY LOG
-- ============================================================================

-- One row per delivered notification. Two jobs: stop the scheduled senders
-- from double-sending when a run overlaps or retries, and give support a
-- record when a user reports a notification they did or did not receive.
CREATE TABLE IF NOT EXISTS public.notification_deliveries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    notification_type text NOT NULL,
    -- Collapses a logical send to one row, e.g. 'daily_reminder:2026-07-28' or
    -- 'monthly_insight:2026-07'. The unique index below makes resends no-ops.
    dedupe_key text NOT NULL,
    sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_deliveries_dedupe
ON public.notification_deliveries(user_id, dedupe_key);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_sent_at
ON public.notification_deliveries(sent_at DESC);

ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

-- Written only by the service role from edge functions. Users may read their
-- own history; there is deliberately no client-side insert policy, so a client
-- cannot forge a delivery record to suppress a notification it should receive.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notification_deliveries' AND policyname = 'Users can read own notification deliveries') THEN
        CREATE POLICY "Users can read own notification deliveries"
            ON public.notification_deliveries FOR SELECT
            TO authenticated
            USING (auth.uid() = user_id);
    END IF;
END $$;

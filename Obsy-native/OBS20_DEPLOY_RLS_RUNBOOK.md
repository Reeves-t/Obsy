# OBS-20 — Production Deploy & RLS Verification Runbook

**Owner:** Board (holds Supabase production deploy access).

**Project ref:** `vsxxlhztgtcgcvzvojdf` (`project_id Obsy-Gotenks`, Ohio).

## Supabase layout (consolidated 2026-06-16)
There is now **one** Supabase tree: **`Obsy/supabase`** (the linked project). The old
`Obsy/Obsy-native/supabase` folder was merged in and deleted. All edge functions
(including `revenuecat-webhook`, `delete-account`, `transcribe-voice-note`) and the
active migrations live under `Obsy/supabase`. Legacy base-schema migrations are
archived in `Obsy/supabase/_legacy_migrations/` (the CLI ignores any non-`migrations`
folder, so they are **not** re-pushed).

Run all `supabase` commands from the repo root `Obsy/Obsy` (which contains
`supabase/`), or add `--workdir Obsy` if running from the workspace parent. Function
and secret commands also accept `--project-ref vsxxlhztgtcgcvzvojdf`. `db push`
needs the DB password — the CLI caches it from a prior link, otherwise provide it via
`SUPABASE_DB_PASSWORD` (note: `setx` only affects new shells) or `--password`.

---

## Deploy status (as of 2026-06-16)

| Step | Status |
|---|---|
| 1. Migrations applied to prod | ✅ Done — all applied (verified via `supabase migration list`) |
| 2. `revenuecat-webhook` deployed | ✅ Done |
| 2. `RC_WEBHOOK_SECRET` set | ✅ Done (non-empty; verified via `supabase secrets list`) |
| 3. RevenueCat dashboard webhook configured | ✅ Done (board) |
| 4–5. RLS / storage SQL verification | ⏳ Pending — run in SQL editor (below) |
| 6. Sandbox purchase smoke test | ⏳ Pending (board, needs device/sandbox) |

---

## 1. Migrations (already applied)

All migrations in `Obsy/supabase/migrations` are applied on prod, including the
OBS-10/15/17 set:

- `20260610000001_collapse_tiers_remove_founder.sql` — collapse to `free|plus`, drop `is_founder`, retire founder counter
- `20260610000002_guard_subscription_tier_server_only.sql` — `BEFORE UPDATE` trigger so only the service role can change `subscription_tier`
- `20260610000004…000007` — **OBS-15 data-safety set**: topic RLS, storage-bucket RLS (avatars/topic-attachments), voice-notes private bucket, relationship-scoped `profiles` SELECT

To re-verify or push future migrations:

```sh
# from Obsy/Obsy (or add --workdir Obsy)
supabase db push --dry-run      # preview; "Remote database is up to date" = nothing pending
supabase db push --yes          # apply pending
```

Data sanity check (expect only `free` and `plus`; no `founder`, no `guest`):

```sql
select subscription_tier, count(*) from public.user_settings group by 1;
```

---

## 2. RevenueCat webhook edge function (deployed)

```sh
supabase functions deploy revenuecat-webhook --no-verify-jwt --project-ref vsxxlhztgtcgcvzvojdf --workdir Obsy
supabase secrets set "RC_WEBHOOK_SECRET=<secret>" --project-ref vsxxlhztgtcgcvzvojdf
```

- `--no-verify-jwt` is **required**: RevenueCat is not a Supabase-authenticated
  caller. The function compares the `Authorization` header to `RC_WEBHOOK_SECRET`
  (`supabase/functions/revenuecat-webhook/index.ts` lines 43–57). With JWT
  verification on, RC requests 401 before reaching the secret check.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected — only
  `RC_WEBHOOK_SECRET` must be set. (Changing the secret takes effect on the next
  invocation; no redeploy needed.)

---

## 3. RevenueCat dashboard (configured)

- **Webhook URL:** `https://vsxxlhztgtcgcvzvojdf.supabase.co/functions/v1/revenuecat-webhook`
- **Authorization header value:** the exact `RC_WEBHOOK_SECRET` (raw, or `Bearer <secret>`).

---

## 4. Verify RLS (SQL editor, as admin)

```sql
-- a) RLS enabled on every public table (expect rls_enabled = true for all user-data tables)
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by rls_enabled asc, table_name;

-- b) Policies per table (every user-data table should have owner-scoped policies)
select tablename, policyname, cmd, roles
from pg_policies where schemaname = 'public'
order by tablename, policyname;

-- c) subscription_tier guard trigger present + enabled on user_settings
select tgname, tgrelid::regclass as table_name, tgenabled
from pg_trigger
where tgrelid = 'public.user_settings'::regclass and not tgisinternal;
-- Expect enforce_subscription_tier_server_only (from 20260610000002).
```

**Negative test (must FAIL/no-op):** in a session authenticated as a normal test
user (NOT service role):

```sql
update public.user_settings set subscription_tier = 'plus' where user_id = auth.uid();
-- Expect: rejected by the guard trigger. If it succeeds, STOP and investigate.
```

---

## 5. Storage policy verification

```sql
select id, name, public from storage.buckets;  -- entries/profile/photo/voice-note buckets should NOT be public
select policyname, cmd, roles from pg_policies where schemaname = 'storage' order by policyname;
```

Confirm photo/voice-note buckets are private with owner-scoped read/write policies.

---

## 6. Post-deploy smoke test

1. In a sandbox build, complete a sandbox purchase of `obsy.plus.monthly`.
2. Confirm RevenueCat fires `INITIAL_PURCHASE` to the webhook (RC dashboard → webhook logs → 200).
3. Confirm `user_settings.subscription_tier` flipped to `plus` for that user (written by the service role, not the client).
4. Confirm the client reflects Plus entitlement.

---

## DeepSeek disclosure (keep scoped accurately)

For the App Store privacy policy: **DeepSeek is live** (`api.deepseek.com`, China),
but **only** for limited, non-sensitive interpretation:

- Topic Pulse ("Explore this topic")
- Mood Signal / Mood Connection interpretation

It receives only aggregated mood metadata and topic metadata. It must **not** be
described as receiving raw journal entries, notes, voice transcripts, photos,
shared-link content, full topic entries, or any personally identifying information —
those paths never touch DeepSeek. The other live providers are Anthropic/Claude (US),
Google/Gemini (US), and OpenAI/Whisper (US). All four must be disclosed.

# OBS-20 — Production Deploy & RLS Verification Runbook

**Owner:** Board (holds Supabase production deploy access). The CTO agent has the
**anon key only**, so steps 1–3 must be run by the board. Steps 4–6 are copy-paste
verification the board runs after deploying; paste results back into OBS-20.

**Project ref:** `vsxxlhztgtcgcvzvojdf`
**Source branch:** `claude/obs-10-cluster-b-monetization` — the B1 tier-collapse,
the subscription_tier guard trigger, the OBS-15 data-safety migration, and the
`revenuecat-webhook` function all live here. They are **not on `main`** yet (merge
is tracked by OBS-19). Deploy from this branch, or deploy after the OBS-19 merge.

---

## 1. Apply migrations (in order)

```sh
supabase link --project-ref vsxxlhztgtcgcvzvojdf
# Apply in this order (db push applies all pending; or run individually):
#  1) 20260610_collapse_tiers_remove_founder.sql      (B1: collapse to free|plus, drop founder/guest)
#  2) <OBS-15 data-safety migration>                  (data-safety hardening)
#  3) 20260610_guard_subscription_tier_server_only.sql (server-only tier guard trigger)
supabase db push
```

After apply, confirm no tier rows reference removed tiers:

```sql
select subscription_tier, count(*) from public.user_settings group by 1;
-- Expect only 'free' and 'plus'. No 'founder', no 'guest'.
```

---

## 2. Deploy the RevenueCat webhook edge function

```sh
supabase functions deploy revenuecat-webhook --no-verify-jwt
supabase secrets set RC_WEBHOOK_SECRET=<shared-secret-from-RevenueCat>
```

- `--no-verify-jwt` is **required**: RevenueCat is not a Supabase-authenticated
  caller. The function performs its own auth by comparing the `Authorization`
  header to `RC_WEBHOOK_SECRET` (see `supabase/functions/revenuecat-webhook/index.ts`
  lines 43–57). With default JWT verification on, RC requests 401 before reaching
  the secret check.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected — only
  `RC_WEBHOOK_SECRET` must be set.

---

## 3. Configure the webhook in the RevenueCat dashboard

- **Webhook URL:**
  `https://vsxxlhztgtcgcvzvojdf.supabase.co/functions/v1/revenuecat-webhook`
- **Authorization header value:** the exact same string set as `RC_WEBHOOK_SECRET`.
  (The function accepts both a raw secret and `Bearer <secret>`.)

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

-- c) subscription_tier guard trigger is present + enabled on user_settings
select tgname, tgrelid::regclass as table_name, tgenabled
from pg_trigger
where tgrelid = 'public.user_settings'::regclass and not tgisinternal;
-- Expect the guard trigger from 20260610_guard_subscription_tier_server_only.sql.
```

**Negative test (must FAIL/no-op):** as an authenticated non-service user, try to
self-grant Plus and confirm the trigger blocks it:

```sql
-- Run in a session authenticated as a normal test user (NOT service role):
update public.user_settings set subscription_tier = 'plus' where user_id = auth.uid();
-- Expect: rejected by the guard trigger, or value unchanged. If this succeeds, the
-- guard is not active — STOP and investigate before launch.
```

---

## 5. Storage policy verification

```sql
select id, name, public from storage.buckets;        -- entries/profile buckets should NOT be public
select policyname, cmd, roles from pg_policies where schemaname = 'storage' order by policyname;
```

Confirm photo/voice-note buckets are private and have owner-scoped read/write policies.

---

## 6. Post-deploy smoke test

1. In a sandbox build, complete a sandbox purchase of `obsy.plus.monthly`.
2. Confirm RevenueCat fires `INITIAL_PURCHASE` to the webhook (RC dashboard → webhook logs → 200).
3. Confirm `user_settings.subscription_tier` flipped to `plus` for that user (written by the service role, not the client).
4. Confirm the client reflects Plus entitlement.

---

## Blockers owned by the board (none resolvable by the agent)

1. **Supabase production deploy access** — to run steps 1–3.
2. **RevenueCat webhook shared secret** — value for `RC_WEBHOOK_SECRET` + the RC dashboard webhook auth header.
3. *(Adjacent, OBS-19)* production RevenueCat iOS public SDK key (currently a test key in `constants/revenuecat.ts`).

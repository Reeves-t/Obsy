# OBS-27 — Device QA Runbook (sandbox purchase + restore on a real iOS device)

**Owner of execution:** a human **Mac/iOS operator** (this CTO agent runs on win32 and cannot
drive a real device or StoreKit sandbox).
**Code side:** ✅ verified ready — see §0. Any failure below is therefore a **config / store / key**
issue, not a code bug, unless §0's mapping is contradicted on-device.
**Blocked-by:** OBS-26 (iOS launch credentials) + an Apple sandbox tester + a Mac operator.

---

## 0. Code-readiness audit (done by CTO agent, 2026-06-15)

All six QA assertions map to code that is already wired on branch
`claude/obs-10-cluster-b-monetization`. Spot-checked file:line references:

| QA assertion | Code path (verified) |
|---|---|
| Monthly/yearly purchase grants `plus` | `components/paywall/VanguardPaywall.tsx` → `purchasePlusPackage()` → `Purchases.purchasePackage()` (`lib/revenuecat.ts:98`) |
| Restore re-grants `plus` | paywall + `app/(tabs)/profile.tsx:461` → `restorePurchases()` (`lib/revenuecat.ts:110`) |
| Packages come from offering `default` | `getPlusPackages()` (`lib/revenuecat.ts:71`), `OFFERING_ID='default'`, products `obsy.plus.monthly`/`obsy.plus.yearly` (`constants/revenuecat.ts`) |
| Webhook flips `user_settings.subscription_tier` → `plus`/`free` | `supabase/functions/revenuecat-webhook/index.ts` (service-role write, GRANT/REVOKE event map, plus-only + UUID guards) |
| Cancel/expire de-gates Plus | webhook `EXPIRATION` → `free`; `useSubscription.ts:169/196` gates on `tier === 'plus'` |
| Signed-out user at a Plus gate → **sign-up**, not paywall | `components/PremiumGate.tsx:47` routes `isGuest` to `/auth/signup` (route file `app/auth/signup.tsx` present) |
| RC user tied to Supabase id | `app/_layout.tsx:127` `identifyRevenueCatUser(user.id)` on login; `resetRevenueCatUser()` on logout (`:129`) |

**Note on entitlement source of truth:** the client unlock is immediate (RevenueCat
`CustomerInfo.entitlements.active['plus']`), but the *authoritative* tier is written
server-side by the webhook. Client `subscription_tier` writes are blocked by a DB trigger
(`20260610_guard_subscription_tier_server_only.sql`). So a fully correct pass needs **both**
the in-app unlock **and** the `user_settings` row flipping.

---

## 1. Prerequisites (must all be green before starting — owned by OBS-26 / board)

- [ ] Apple Developer account active; app record `com.innostudio.obsy` exists (ASC App ID `6758523822`).
- [ ] Both auto-renewable IAPs created in App Store Connect and in **"Ready to Submit"**:
      `obsy.plus.monthly` ($5.99) and `obsy.plus.yearly` ($49.99).
- [ ] **RevenueCat** project: offering `default` exposes both packages; entitlement `plus`
      attached to **both** products; iOS app uses bundle `com.innostudio.obsy`.
- [ ] EAS secret set: `eas secret:create --scope project --name EXPO_PUBLIC_REVENUECAT_IOS_KEY --value appl_…`
      (the iOS **public** key). Confirm `IS_PRODUCTION_REVENUECAT_KEY` is true in the build.
- [ ] RevenueCat dashboard → Webhooks: URL = the deployed Supabase fn
      `https://vsxxlhztgtcgcvzvojdf.functions.supabase.co/revenuecat-webhook`,
      Authorization header value = the same secret set in Supabase as `RC_WEBHOOK_SECRET`.
- [ ] Supabase: webhook edge fn **deployed**; migrations
      `20260610_collapse_tiers_remove_founder.sql` + `20260610_guard_subscription_tier_server_only.sql`
      applied. (Agent has anon key only — deploy is a human step.)
- [ ] A **TestFlight** build that includes the prod RC key; at least one internal tester.
- [ ] A **Sandbox Apple ID** (App Store Connect → Users and Access → Sandbox → Testers). Do **not**
      sign into iCloud with it — only into the App Store sandbox prompt at purchase time.

> If any box is unchecked, stop — the failure you'd see is a prereq gap, not a QA finding.

## 2. Device setup

1. Install the TestFlight build on a real iPhone (sandbox IAP does **not** work in the Simulator).
2. iOS 14+: the sandbox account is entered **at purchase time** (a "Sign In — [Environment: Sandbox]"
   sheet). On older iOS, set it under Settings → App Store → Sandbox Account.
3. Sign **into the app** (create/log in to an Obsy account) so a Supabase `user.id` exists and
   `Purchases.logIn(user.id)` runs. Note this UUID — you'll verify the webhook against it.
4. Keep two tabs open for observation:
   - **RevenueCat** → Customers → (this app_user_id) → Entitlements + the **Webhooks** event log.
   - **Supabase** → SQL editor, ready to run:
     `select user_id, subscription_tier, updated_at from user_settings where user_id = '<UUID>';`

> **Sandbox renewal speed (Apple accelerated):** monthly renews every **5 min**, yearly every
> **1 hour**, and auto-renews ~6 times then **expires**. Use this to test expiry/de-gate without waiting.

## 3. Test cases — run in order, record PASS/FAIL in §4

**TC1 — Monthly purchase grants Plus**
1. Trigger a Plus gate → paywall → select **Monthly** → Purchase → complete sandbox sheet.
2. Expect: paywall dismisses, Plus feature unlocks immediately (client entitlement).
3. Verify RC: customer shows entitlement `plus` active; webhook log shows `INITIAL_PURCHASE` → **200**.
4. Verify DB: the SQL query returns `subscription_tier = 'plus'`.

**TC2 — Yearly purchase grants Plus** *(use a 2nd sandbox account or wait for TC1 to expire to avoid "already subscribed")*
1. Same as TC1 but select **Yearly**.
2. Expect entitlement `plus`, webhook `INITIAL_PURCHASE` → 200, DB `plus`.

**TC3 — Restore Purchases on a fresh install / 2nd device**
1. Delete + reinstall the app (or use a second device), log into the **same** Obsy account.
2. Plus features are gated again on first load (fresh CustomerInfo).
3. Profile → **Restore Purchases** (or paywall → Restore).
4. Expect: entitlement `plus` re-granted, Plus unlocks. DB already `plus` (or re-confirmed).

**TC4 — Webhook tier write (covered by TC1–TC3 verifications)**
- Confirm every grant produced a `user_settings.subscription_tier = 'plus'` row write with a fresh
  `updated_at`. If RC log shows 200 but DB didn't change → check `RC_WEBHOOK_SECRET` match and that
  `app_user_id` is the Supabase UUID (not an anonymous `$RCAnonymousID`).

**TC5 — Cancel/expire de-gates Plus**
1. After TC1, let the sandbox subscription **expire** (don't renew; ~6 cycles, or cancel via
   Settings → sandbox subscriptions). Monthly expires fastest.
2. Expect webhook `EXPIRATION` → 200; DB flips to `subscription_tier = 'free'`.
3. Relaunch app → Plus features are **re-gated** (locked again).
4. *(Optional refund path:* if you can issue a sandbox refund, confirm same de-gate.)*

**TC6 — Signed-out user at a Plus gate → sign-up, not paywall**
1. Sign **out** of the Obsy account (stay in the app as a signed-out/guest user).
2. Tap a Plus-gated feature.
3. Expect: routed to **`/auth/signup`** (sign-up screen). The RevenueCat **paywall must NOT** appear.

## 4. Result log (operator fills in)

| TC | Result | Evidence (RC event + DB value + screenshot) | Notes |
|----|--------|---------------------------------------------|-------|
| TC1 monthly | ☐ pass ☐ fail | | |
| TC2 yearly  | ☐ pass ☐ fail | | |
| TC3 restore | ☐ pass ☐ fail | | |
| TC4 webhook | ☐ pass ☐ fail | | |
| TC5 expire/de-gate | ☐ pass ☐ fail | | |
| TC6 signed-out → sign-up | ☐ pass ☐ fail | | |

**On all-pass:** comment "QA PASS" on OBS-27 with the filled table + screenshots; that unblocks the
§6 merge gate in `IOS_RELEASE_READINESS.md` (merge monetization branch to release line).
**On any fail:** comment the failing TC + RC event id + DB value + screenshot, and re-assign OBS-27 to
the CTO agent (`resume: true`) — the audit in §0 will be the starting point for triage.

## 5. Troubleshooting quick map

| Symptom | Likely cause |
|---|---|
| Paywall shows "no packages" / fallback prices only | offering `default` not configured / products not "Ready to Submit" / wrong RC key |
| Purchase succeeds, UI unlocks, but DB stays `free` | webhook not deployed, `RC_WEBHOOK_SECRET` mismatch (401 in RC log), or `app_user_id` anonymous (user not logged in before purchase) |
| Webhook log shows 200 but ignored | event `entitlement_ids` not `plus`, or `app_user_id` not a UUID (see fn guards) |
| Signed-out tap shows paywall instead of sign-up | `PremiumGate` `guestAction` overridden to `paywall`, or `useAuth().isGuest` false when it shouldn't be |
| Restore does nothing | testing with a different Apple ID than the one that purchased, or different Obsy account than the original |
</content>

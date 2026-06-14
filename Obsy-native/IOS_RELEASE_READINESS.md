# iOS Release & Monetization Readiness (OBS-19)

**Owner:** CTO · **Parent:** OBS-1 · **Date:** 2026-06-11 · iOS-first (Android deferred per board)
**Branch:** `claude/obs-10-cluster-b-monetization`

Status of each OBS-19 scope item. ✅ done · 🟡 ready-but-needs-board-input · ⛔ blocked.

---

## 1. ✅ Scope-collapse to free | plus (code-only)
- **Albums / Moodverse / Obsy-Note** removed (commits `0ee03df`, `5fffb9a`; see `MVP_FEATURE_REMOVALS.md`).
- **Founder / lifetime tiers** removed (`cd28dec`); legacy values normalize to `plus`.
- **Guest tier** removed this issue. `LIMITS` and the `SubscriptionTier` type are now
  **`free | plus`** only (`hooks/useSubscription.ts`, `lib/captureStore.ts`,
  `services/storage.ts`). Signed-out usage now resolves to **`free`** limits; the
  signed-out *state* is still detected via `useAuth().isGuest` so `PremiumGate`/onboarding
  keep routing signed-out users to **sign-up** (not the paywall) — RevenueCat purchases
  require a logged-in user id. **Behavioral consequence to confirm with board:** signed-out
  users now get the **free** local-capture allowance (10/day, 200 stored) instead of the old
  restrictive guest allowance (3/day, 50 stored). The "Continue as Guest" auth mode itself was
  **kept** (removing it is a navigation/structure change, out of OBS-19 guardrails).
- **Albums archive residual** removed: the always-empty "Album Insights" archive section and the
  `'album'` `ArchiveInsightType` (coordinated with OBS-11 albums excise).
- **Verification:** `npx tsc --noEmit` introduces **zero new errors** in any touched file and no
  `'guest'`/`'album'` type errors remain. (The branch has ~30 *pre-existing* TS errors — chiefly
  `Capture` not re-exported from `@/lib/captureStore` — that are **type-only** and do not block a
  Metro/EAS build. They are not OBS-19 scope; see "Pre-existing tech debt" below.)

## 2. 🟡 `eas.json` iOS submit config — `eas.json`
```jsonc
"submit": { "production": { "ios": {
  "appleId":     "REPLACE_WITH_APPLE_ID_EMAIL",   // ⛔ board input
  "ascAppId":    "6758523822",                    // ✅ provided
  "appleTeamId": "REPLACE_WITH_APPLE_TEAM_ID"      // ⛔ board input
}}}
```
Structure is in place; the two placeholders need the board's Apple Developer account details.
Android submit block is present but **deferred** (no `play-store-service-account.json` yet).

## 3. 🟡 RevenueCat config — verified correct; prod key blocked
`constants/revenuecat.ts` — all identifiers match the board-locked config:
| Field | Value | OK |
|---|---|---|
| Entitlement | `plus` | ✅ |
| Offering | `default` | ✅ |
| Monthly product | `obsy.plus.monthly` ($5.99) | ✅ |
| Yearly product | `obsy.plus.yearly` ($49.99) | ✅ |
| SDK key (iOS) | **TEST key** (`test_…`) | ⛔ replace with `appl_…` prod key |

- SDK: `react-native-purchases` ^10.2.2; real `purchasePackage()` + Restore wired (OBS-16).
- Server entitlement: `revenucat-webhook` edge fn writes `plus`/`free`, ignores non-Plus
  entitlements and non-UUID `app_user_id` (OBS-17). Tier writes are server-only (RLS guard).
- **To do once board provides the prod key:** replace `RC_TEST_KEY` with the iOS `appl_…`
  public key, then in the RevenueCat dashboard confirm offering `default` exposes both products
  and the `plus` entitlement attaches to each.

## 4. ⛔ Device QA — blocked on Apple account + testers
Run on a **real iOS device** (StoreKit sandbox), both products, after prod key + TestFlight exist:
- [ ] Sandbox purchase — monthly → entitlement `plus` granted, UI unlocks Plus features
- [ ] Sandbox purchase — yearly → entitlement `plus` granted
- [ ] **Restore Purchases** re-grants `plus` on a fresh install / second device
- [ ] Webhook flips `user_settings.subscription_tier` to `plus` (and back to `free` on expiry/refund)
- [ ] Cancel/expire in sandbox → app de-gates Plus features
- [ ] Signed-out user hitting a Plus gate is routed to **sign-up**, not the paywall

## 5. ✅ App Privacy label inventory
See **`APP_PRIVACY_LABEL.md`** (full ASC nutrition-label mapping + open legal items).

## 6. ⛔ Merge to release line — blocked
"Merge `claude/obs-10-cluster-b-monetization` to the release line" should happen **after** the
RevenueCat prod key is wired and device QA (§4) passes — merging the release line before the
monetization path is verified on-device would ship an unverified IAP flow. Branch is currently
**12 commits ahead of `main`, 0 behind**, and not yet pushed. Treat as a human deploy/merge gate.

---

## Board-provided inputs needed (blockers) — owner: **board**
1. **Apple Developer account** (Apple ID email + Team ID) → unblocks `eas.json` §2 and submission.
2. **TestFlight testers** → unblocks device QA §4.
3. **RevenueCat iOS production SDK key** (`appl_…`) → unblocks §3 and §4.

## Pre-existing tech debt (not OBS-19 scope — recommend a separate issue)
- ~30 `tsc --noEmit` errors on the branch, type-only (don't block EAS build): `Capture` not
  re-exported from `@/lib/captureStore` (~9 files), `journal_*` not in `ArchiveInsightType`,
  reanimated `SharedValue`, `expo-file-system` API drift, `MoodGradient.from/to`, etc.
- `RELEASE_CHECKLIST.md` is stale (says "Stripe"/"analytics post-launch"); superseded by this doc
  + `MVP_FEATURE_REMOVALS.md` for monetization/scope items.

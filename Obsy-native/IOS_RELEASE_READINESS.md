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

## 2. ✅ `eas.json` iOS submit config — `eas.json` (filled 2026-06-16)
```jsonc
"submit": { "production": { "ios": {
  "appleId":     "reeves@commongroundhq.com",  // ✅ board-provided
  "ascAppId":    "6758523822",                 // ✅ provided
  "appleTeamId": "ZFPQ2B7DKN"                  // ✅ board-provided
}}}
```
All three iOS submit fields are filled from the board's Apple account details (provided in
`.env` notes 2026-06-16). Android submit block is present but **deferred** (no
`play-store-service-account.json` yet). Note: `eas submit` will still prompt for an
app-specific password (or an ASC API key) at submit time — that's an interactive/secret step
for the human operator, not stored in `eas.json`. The board also supplied an ASC/Developer ID
`3229e494-a4b2-438b-adfa-cc2017a3a9bc` (kept in `.env` notes; only needed if switching to ASC
API-key auth).

## 3. ✅ RevenueCat config — verified; iOS prod key now wired
`constants/revenuecat.ts` — all identifiers match the board-locked config:
| Field | Value | OK |
|---|---|---|
| Entitlement | `plus` | ✅ |
| Offering | `default` | ✅ |
| Monthly product | `obsy.plus.monthly` ($5.99) | ✅ |
| Yearly product | `obsy.plus.yearly` ($49.99) | ✅ |
| SDK key (iOS) | `appl_…` prod key in `.env` (TEST-key fallback) | ✅ local / 🟡 EAS secret for cloud |

- SDK: `react-native-purchases` ^10.2.2; real `purchasePackage()` + Restore wired (OBS-16).
- Server entitlement: `revenucat-webhook` edge fn writes `plus`/`free`, ignores non-Plus
  entitlements and non-UUID `app_user_id` (OBS-17). Tier writes are server-only (RLS guard).
- **Prod-key wiring (OBS-19, done):** `REVENUECAT_API_KEY` reads `process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY`
  (same `EXPO_PUBLIC_*` pattern as the Supabase keys), with the TEST key as the dev fallback.
- **Key provided 2026-06-16:** board pasted the iOS prod key into `.env`. I normalized it from a
  free-form note into a proper `EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_…` line so dotenv/Expo
  actually reads it (the original note form was not machine-readable → would have silently shipped
  the test key). `.env` is gitignored (key never committed). `IS_PRODUCTION_REVENUECAT_KEY` is now true for local/dev.
- ⚠️ **EAS CLOUD builds (action for board/operator):** `.env` is gitignored, so it is **not** in the
  EAS cloud build context. For `eas build` in the cloud the key must also be set as an EAS env/secret:
  `eas secret:create --scope project --name EXPO_PUBLIC_REVENUECAT_IOS_KEY --value appl_…`.
  Without this, a cloud production build silently falls back to the test key. (A local `eas build`
  or `expo run:ios` that has the `.env` present is unaffected.)
- **Dashboard check (board):** confirm offering `default` exposes both products and the `plus`
  entitlement attaches to each (code identifiers already match).

## 4. ⛔ Device QA — the remaining blocker (needs a Mac/iOS operator + TestFlight testers)
Delegated to child issue **OBS-19a** (device QA). Requires a macOS/iOS operator (this CTO agent
is win32 — cannot build/run an iOS binary) plus TestFlight testers and an EAS build carrying the
prod key. Run on a **real iOS device** (StoreKit sandbox), both products:
- [ ] Sandbox purchase — monthly → entitlement `plus` granted, UI unlocks Plus features
- [ ] Sandbox purchase — yearly → entitlement `plus` granted
- [ ] **Restore Purchases** re-grants `plus` on a fresh install / second device
- [ ] Webhook flips `user_settings.subscription_tier` to `plus` (and back to `free` on expiry/refund)
- [ ] Cancel/expire in sandbox → app de-gates Plus features
- [ ] Signed-out user hitting a Plus gate is routed to **sign-up**, not the paywall

## 5. ✅ App Privacy label inventory
See **`APP_PRIVACY_LABEL.md`** (full ASC nutrition-label mapping + open legal items).

## 6. ⛔ Merge to release line — gated on device QA (§4 / OBS-19a)
"Merge `claude/obs-10-cluster-b-monetization` to the release line" should happen **after** device
QA (§4) passes — merging before the monetization path is verified on-device would ship an
unverified IAP flow. Treat as a human deploy/merge gate. NOTE: the working branch currently also
carries large in-progress work from other efforts (Aurora theme, mood signals, topic pulse) that
is **uncommitted/unrelated to OBS-19**; the merge owner must ensure only release-ready work lands.

---

## Board inputs — status (2026-06-16)
1. ✅ **Apple Developer account** — Apple ID `reeves@commongroundhq.com`, Team ID `ZFPQ2B7DKN` → `eas.json` §2 filled.
2. ✅ **RevenueCat iOS prod key** (`appl_…`) → wired into `.env` §3 (also set the EAS cloud secret per §3).
3. ⛔ **TestFlight testers** + a **macOS/iOS operator** → still needed for device QA §4 (OBS-19a) and submission.

## Pre-existing tech debt (not OBS-19 scope — recommend a separate issue)
- ~30 `tsc --noEmit` errors on the branch, type-only (don't block EAS build): `Capture` not
  re-exported from `@/lib/captureStore` (~9 files), `journal_*` not in `ArchiveInsightType`,
  reanimated `SharedValue`, `expo-file-system` API drift, `MoodGradient.from/to`, etc.
- `RELEASE_CHECKLIST.md` is stale (says "Stripe"/"analytics post-launch"); superseded by this doc
  + `MVP_FEATURE_REMOVALS.md` for monetization/scope items.

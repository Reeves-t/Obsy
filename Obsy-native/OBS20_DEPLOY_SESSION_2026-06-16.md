# OBS-20 Deploy, Hardening & Incident — Session Log (2026-06-16)

Record of everything changed in this session (prod project `vsxxlhztgtcgcvzvojdf`
= `Obsy-Gotenks`, Ohio) so anyone reviewing the files later has the full picture.

---

## 1. Supabase tree consolidated into one
- There were two trees: `Obsy/supabase` (linked to prod) and a stray
  `Obsy/Obsy-native/supabase` (no `config.toml`; held 3 functions + 32 legacy
  migration files).
- Moved `revenuecat-webhook` + `delete-account` into `Obsy/supabase/functions`;
  dropped the duplicate `transcribe-voice-note` (byte-identical behavior).
- Archived the 32 legacy base-schema migrations in `Obsy/supabase/_legacy_migrations/`
  (the CLI ignores any non-`migrations` dir — they are NOT re-pushed).
- Deleted the now-empty `Obsy/Obsy-native/supabase` folder.
- **Canonical Supabase tree is now `Obsy/supabase` only.** Run CLI from `Obsy/Obsy`
  (or `--workdir Obsy`) with `--project-ref vsxxlhztgtcgcvzvojdf`.

## 2. OBS-20 monetization — deployed & verified
- **Migrations:** verified ALL applied on prod (`supabase migration list`), incl.
  `20260610000001` collapse tiers/remove founder, `20260610000002` server-only
  `subscription_tier` guard trigger, and `20260610000004–000007` (OBS-15 data-safety:
  topic RLS, storage-bucket RLS, voice-notes private, relationship-scoped profiles).
  `db push` reported "Remote database is up to date" — nothing was pending.
- **`revenuecat-webhook`** deployed (`--no-verify-jwt`). **`RC_WEBHOOK_SECRET`** set
  on prod (the board pasted the same value into the RevenueCat dashboard webhook).
- **DB verification (SQL editor):** tiers are `free`/`plus` only (no founder/guest);
  RLS enabled on all 30 public tables; `enforce_subscription_tier_server_only`
  trigger present + enabled.

## 3. Storage hardening (security fix found during verification)
Storage verification exposed two public buckets holding private data:
- **`entries`** (journal photos) was PUBLIC → flipped to **private**
  (`supabase/migrations/20260616000002_entries_private_bucket.sql`). App now reads
  entry photos via short-lived **signed URLs** — `services/storage.ts`
  `getEntryImageUrls` (batched, 7-day TTL), consumed in `lib/captureStore.ts`
  `fetchCaptures`. New captures still display from the local file.
- **`captures`** (orphan bucket, unused by app) was PUBLIC with an anonymous INSERT
  policy (`Anon Upload`) + public SELECT (`Public Access`) → made **private** and
  both policies dropped (`20260616000001_lock_down_captures_bucket.sql`).
- `avatars` left PUBLIC by design (profile photos shown to friends).
- Server-safe: no edge function reads entry photos from storage; photo-for-insight
  uses the LOCAL image. **Note:** a native rebuild/OTA is needed for the signed-URL
  change to reach standalone builds (Expo Go picks it up on reload).

## 4. Edge-function fleet incident + recovery
- **Symptom:** every edge function returned **503 `LOAD_FUNCTION_ERROR`** (boot
  failure, ~40ms). Daily/weekly insights were the first noticed; in fact the whole
  AI backend was down.
- **Cause:** Supabase upgraded the edge runtime; previously-deployed eszip bundles
  (some from April) became incompatible.
- **Fix:** redeployed all 16 functions from current source (re-bundles for the new
  runtime). Verified each boots via `POST` with the anon key (401/400 = OK, 503 =
  broken). Prod now matches repo HEAD.
- **`delete-account`** had NEVER been deployed (lived only in the old nested tree).
  Now deployed — required for Apple Guideline 5.1.1(v). Owner-scoped (verifies caller
  JWT, purges only `${userId}/` storage + deletes own auth user).

## 5. RevenueCat — Expo Go crash fixed
- `Purchases.configure()` threw "invalid api key / native store not available" in
  Expo Go (no native module) and crashed the render (called in a `useEffect` with no
  catch).
- `lib/revenuecat.ts` now detects Expo Go (`Constants.executionEnvironment ===
  StoreClient`), skips configuration there, and wraps `configure` in try/catch.
  Purchases stay inactive in Expo Go; test them in a dev/native build.

## 6. Privacy policy corrected (`PRIVACY_POLICY.md`)
Was inaccurate vs. the code. Fixed:
- **Added Google (Gemini)** — was missing entirely (it powers insight fallback +
  shared-link content digestion).
- **Scoped DeepSeek** correctly: Topic Pulse + Mood Signal/Connection interpretation
  only, receiving non-identifying topic + aggregated mood metadata — never journal
  text, voice, photos, shared-link content, or identifiers.
- Corrected insight providers (Claude primary, Gemini fallback), added
  topic-attachment extraction (Claude). All four providers now disclosed accurately:
  Claude (US), Gemini (US), Whisper (US), DeepSeek (China, scoped).

## 7. Branch cleanup
- Deleted 2 stale local branches + 25 merged-into-main remote branches.
- Deleted 3 obvious-dead unmerged remotes (newton-cradle ×2, add-theme-system).
- LEFT (unmerged, review later): `mood-color-gradients-Zk55H`,
  `scope-mood-signal-project-improvements`, `animate-mood-stars-HVJ1q`,
  `fix-insight-formatting-fBTHI` (look superseded); `check-patterns-commit-Gg391`,
  `notifications-mvp-setup-3OlRB`, `mood-flow-daily-insights-lbtsR` (possible unique
  work — keep until reviewed).

## Commits (branch `claude/obs-10-cluster-b-monetization`)
- `a309b12` — pre-deployment checkpoint (storage hardening + supabase consolidation +
  previously-uncommitted Topic Pulse / Mood Signal / Recommendations / background
  cleanup).
- (this commit) — RevenueCat Expo Go fix + privacy-policy corrections + this log.
- **Not pushed** to origin — board to `git push` when ready.

## Outstanding for the board
1. **Push the branch** (`git push`) when ready.
2. **Sandbox purchase smoke test** — needs a dev/native build (RevenueCat isn't in
   Expo Go): buy `obsy.plus.monthly` → RC webhook log 200 → `user_settings.subscription_tier`
   flips to `plus` → Plus unlocks.
3. **Rebuild/OTA** so the signed-URL entry-photo change reaches standalone builds.
4. Optionally delete the 4 superseded branches above; drop redundant duplicate
   storage policies (harmless).

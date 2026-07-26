# Plan: Fast Share Capture — save in ~2 seconds, reflect later

Status: **IMPLEMENTED (Phases A–E)** 2026-07-25. Phase F remains deferred.
Research verified 2026-07-25.
Branch: `claude/obsy-social-sharing-flow-0jjvs8`.

> Implementation notes, including what the plan got wrong, are at the bottom
> under "Implementation notes". The share-target phase needs a native dev build
> that has not been produced here — see `Obsy-native/SHARE_INTENT_SETUP.md`.
Companion doc: `PLAN_SHARED_LINK_ENRICHMENT.md` (backend enrichment + cards).
Both plans are independent; this one is client-heavy. If both land, the
QuickSaveSheet gets enriched thumbnails/digests for free.

## Concept

Split capture from reflection:

- **Capture** = share sheet → Obsy → saved in ~2 seconds, mood NOT required,
  user returns to scrolling. Entry lands in a "needs reflection" state; the
  existing `digest-shared-link` pipeline enriches it in the background.
- **Reflection** = later, inside Obsy: an inbox strip on Today surfaces
  unreflected saves; user adds mood / note / topic with the digest already
  there as a prompt ("You saved a video about burnout — what's on your mind?").

This is the differentiator vs. every platform's built-in Saved folder: the
save gets connected to a feeling — but at review time, not mid-scroll.

Current state being replaced: `SaveSharedLinkModal` is only reachable from
`DevPortalModal` (dev-only), and its `canSave` gate requires a mood — wrong
for the capture moment. The modal's guts get reused; the gate goes.

## Environment facts (verified)

- Expo SDK **54** (`expo ~54.0.35`), expo-router 6, RN 0.81.5, `expo-clipboard`
  already a dependency. Custom scheme `obsynative` configured.
- Options for share-target support, in order of preference:
  1. **`expo-share-intent`** (achorein) — iOS share extension + Android intent
     filters via config plugin; on share, the **host app opens** with the
     payload. Works with expo-router (loader in root `_layout`, or
     `+native-intent.ts`). Install the major version matching SDK 54 (check the
     repo's compatibility table at impl time). Requires an EAS dev build — no
     Expo Go.
  2. **`expo-share-extension`** (MaxAst) — iOS-only: renders a custom RN view
     *inside the share sheet*, so a save can complete **without leaving
     TikTok**. v5+ supports SDK 54. This is the true "get back to scrolling"
     experience but adds native complexity: extension runs in a separate
     process (App Group storage, its own bundle, memory limits, Supabase auth
     session must be shared via App Group). Android still needs intent filters.
  3. SDK 54's experimental first-party share-target support in `expo-sharing`
     (config plugin + deep link + `+native-intent.ts`) — evaluate at impl
     time; if stable enough it may replace option 1 with zero third-party deps.

**Decision: ship option 1 (or 3 if it proves stable) as the MVP** — app opens
to a QuickSaveSheet, one tap, swipe back. Option 2 is the designed upgrade
path (Phase E), not the MVP: don't block the flow on App-Group auth plumbing.

## Phase A — Share target wiring

- Add the chosen plugin to `app.json` config plugins.
  - iOS activation rules: URLs + plain text (share payloads are often
    "Title - https://…"; `extractUrlFromSharePayload` in
    `services/sharedLinkService.ts` already handles this).
  - Android: `ACTION_SEND` intent filter for `text/plain`.
- Route the incoming payload: new route **`app/share.tsx`** presented as a
  modal sheet over whatever the app was on. With expo-router use
  `+native-intent.ts` (or the library's hook in the root `_layout.tsx`) to
  redirect `→ /share?url=<encoded>`.
- Cold start: share intent must survive app launch (the libraries queue it;
  verify with app killed).
- EAS: dev build + profile updates in `eas.json`; document in README that
  Expo Go no longer exercises this path.

## Phase B — QuickSaveSheet (`app/share.tsx`)

A deliberately tiny sheet, target ≤2 interactions:

- Header: platform chip (`platformToIcon`/`platformToColor`) + parsed title
  from `parseSharedLinkMetadata` — instant, no network.
- One **Save** button (primary, huge). Saves immediately with:
  - mood: **none** (see Phase C schema note)
  - topic: none, unless…
- Optional single row of the user's 3 most-recently-used topic chips
  (`useTopicStore`) — tap one to file it in the same gesture. No pickers, no
  scrolling lists.
- Optional "+ mood" affordance for users who want it now (opens the existing
  `MoodSelectionModal`) — never required.
- After save: brief confirmation ("Saved ✓ — reflect later in Today"), then
  auto-dismiss. On iOS the user swipes back to the source app; do not deep-link
  them anywhere else in Obsy.
- Reuse `SaveSharedLinkModal` internals where sensible, but the sheet is a new
  component; the dev-portal modal can stay for dev use or be folded in later.
- Dedupe: if an entry with the same `shared_link_url` was saved in the last
  hour, show "Already saved" instead of double-saving.

## Phase C — Save-without-mood (store + schema)

This is the load-bearing change:

- `lib/captureStore.ts` `createSharedLinkEntry`: make `moodId`/`moodName`
  nullable. Entry saves with `mood_id = NULL`, `mood_name_snapshot = NULL`.
- **Verify at impl time** whether `entries.mood_id` has a NOT NULL constraint
  (check `types/supabase.types.ts` / the linked project's schema — migration
  history is canonical). If NOT NULL → migration to drop it **scoped by
  intent**: allowed only when `source_type = 'shared_link'` (enforce via a
  CHECK constraint: `mood_id IS NOT NULL OR source_type = 'shared_link'`).
- "Needs reflection" is **derived state**: `source_type = 'shared_link' AND
  mood_id IS NULL`. No new column needed.
- **Insights safety**: audit every consumer that assumes a mood exists —
  `generate-daily-insight`, `generate-weekly-insight`, `generate-monthly-insight`,
  `generate-observed-patterns`, mood signal/connection functions, and client
  `lib/insightPromptUtils.ts` / `contextDigests.ts`. Moodless entries must be
  **excluded from mood-based aggregation** until reflected (their digest text
  can still feed content-level context where mood isn't assumed). This audit
  is part of the phase, not optional.
- Gallery/grid: `EntryGridTile` etc. must render a moodless shared-link entry
  without crashing (mood theme lookups must null-guard) and show a subtle
  "unreflected" affordance (small dot/badge).

## Phase D — Reflection inbox on Today

- `app/(tabs)/index.tsx`: when unreflected saves exist, show a compact strip —
  "3 saves waiting for you" with stacked thumbnails — above/near the feed.
- Tapping opens a reflection flow (modal or route `app/reflect.tsx`) that pages
  through pending saves one at a time:
  - shows the enriched card (digest + thumbnail are usually ready by now —
    fire-and-forget `requestLinkDigest` already ran at save time)
  - digest-aware prompt line ("You saved a TikTok about X — what made you
    stop?")
  - mood picker (existing `MoodSelectionModal`), optional note, topic
    suggestion; **Skip** advances without reflecting, entry stays pending
- Saving reflection = update entry: set `mood_id`, `mood_name_snapshot`,
  append note, optional `topic:<id>` tag — via existing store update paths.
- Empty state: strip hidden. No red-badge nagging; the strip itself is the nudge.

## Phase E — Clipboard fallback (fast follow)

Instagram in particular pushes users to "Copy link". `expo-clipboard` is
already installed:

- On app foreground (AppState listener in root layout):
  - iOS: use `Clipboard.hasUrlAsync()` FIRST (does not trigger the iOS paste
    banner); only call `getUrlAsync()` after the user accepts the offer —
    calling get eagerly fires the system paste notification and feels creepy.
  - If the URL's host matches `PLATFORM_MAP` (`services/sharedLinkService.ts`)
    and its hash ≠ last-offered hash (persist in AsyncStorage), show a small
    dismissible pill: "Save the link you copied?" → opens the same
    QuickSaveSheet with the URL.
- Never auto-save from clipboard; always one explicit tap.

## Phase F (deferred, designed-for) — In-sheet save on iOS

Upgrade capture to `expo-share-extension` (custom RN view inside the share
sheet): user shares, taps Save in the sheet, **never leaves TikTok**. Needs:
App Group for sharing the Supabase session (or an offline queue the main app
drains on next launch — simpler and auth-free), extension memory budget,
separate bundle target in EAS. The offline-queue variant is the recommended
shape: extension writes `{url, ts}` to App Group storage and completes; main
app ingests the queue on launch/foreground through the exact same
`createSharedLinkEntry` path. Out of MVP scope; nothing in Phases A–E blocks it.

## QA matrix

- Share from TikTok, Instagram (post + reel + "copy link" path), X, YouTube,
  Safari/Chrome page → correct platform chip, correct URL extraction from
  "title + URL" payloads.
- App cold-killed vs. backgrounded when sharing (intent must not be lost).
- Same URL shared twice → dedupe message.
- Offline share → entry persists locally and syncs (verify `captureStore`
  offline behavior for shared_link entries).
- Moodless entry: renders in gallery, excluded from mood aggregation in every
  insight surface, reflect flow sets mood and it starts counting.
- iOS paste banner does NOT appear on mere app foreground (clipboard phase).
- Both themes; iPhone SE-class small screens for the sheet.

## Suggested commit sequence

1. Phase C store/schema groundwork (nullable mood + insights audit) — riskiest,
   land first behind no UI.
2. Phase A wiring + Phase B QuickSaveSheet.
3. Phase D reflection inbox.
4. Phase E clipboard pill.
5. QA fixes. (Phase F is a separate future effort.)

---

## Implementation notes (2026-07-25)

### What the plan got wrong

- **No schema change was needed to make the mood optional.** `entries.mood` was
  already nullable. What the plan missed is the trap next door:
  `mood_name_snapshot` is NOT NULL and `validate_entry_mood()` backfills it with
  `'Neutral'`, so an unreflected entry reads *mood = NULL, snapshot = 'Neutral'*.
  Any code that treats the snapshot as evidence of a mood will silently invent
  one. `isUnreflected()` and `withMood()` both branch on `mood_id` only, and a
  test pins that behaviour.

- **The most dangerous line was on the read path, not the write path.**
  `fetchCaptures` coerced a null mood to `'neutral'` when mapping rows. Left
  alone, every pending save would have been marked reflected on the next fetch
  and would have fed the user a mood they never chose. Fixed to preserve the
  null for shared links.

- **`expo-share-intent` version matters.** 5.1.1 is the SDK 54 line; 6/7/8 target
  SDK 55/56/57. The plan said "check the compatibility table" — the answer is
  pinned in `package.json` now, and repeated in `SHARE_INTENT_SETUP.md`.

- **The clipboard pill needed a dismissal cooldown the plan did not call for.**
  Because iOS cannot identify clipboard contents without reading them (which
  fires the paste banner), a single uninteresting link would otherwise
  re-trigger the offer on every foreground. A dismissal now suppresses it for
  30 minutes.

### Deviations by choice

- The insights audit was driven by making `Capture.mood_id` nullable and fixing
  the resulting compile errors, rather than by reading each consumer. The fixes
  concentrate at three chokepoints — the daily/weekly/monthly selectors in
  `insightTime.ts`, the pattern/keyword stores, and the mood-light derivations —
  so future insight surfaces inherit the exclusion instead of re-implementing it.
- `EnrichedCapture` now extends `CaptureWithMood`, since the selectors that
  produce it drop moodless entries. That makes the exclusion a type-level fact.
- Both Today nudges live in one collapsing stack so neither needs to know where
  the other sits.

### Not done

- **No native build was produced.** `expo prebuild` needs a `patch-package`
  setup for `xcode@3.0.1` that could not be vendored from this environment
  (GitHub access is scoped to this repo). Steps are in
  `Obsy-native/SHARE_INTENT_SETUP.md`; the share target is untested until that
  build exists.
- The QA matrix above is unrun — no device, no simulator.
- Phase F (in-sheet save on iOS) untouched, as planned.

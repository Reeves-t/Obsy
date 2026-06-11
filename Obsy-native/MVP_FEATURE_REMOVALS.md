# MVP Feature Removals

**Date:** 2026-06-11 · **Branch:** `claude/obs-10-cluster-b-monetization`

This records features removed to focus the MVP. **Read this before re-adding code or
"fixing" what looks like a gap** — several things are intentionally gone or intentionally
kept-but-headless. Removal was **code-only**: no database objects were dropped (see below).

Primary commit: `0ee03df` (`chore: remove Albums, Moodverse, and Obsy-Note-on-photo`).
Docs trimmed in a follow-up commit (PRIVACY_POLICY / TERMS_OF_SERVICE / TIER_GUARDRAILS /
RELEASE_CHECKLIST).

---

## ❌ Removed features — do NOT reintroduce without product sign-off

### 1. Albums (+ album sharing)
- Deleted: `app/albums/`, `components/albums/`, `components/capture/DestinationSelector.tsx`,
  `services/albums.ts`, `services/albumMembers.ts`, `services/albumInsightPosts.ts`,
  `lib/albumEngine.ts`, `lib/albumToneStore.ts`, `lib/useAlbumRename.ts`,
  `lib/useAlbumHiddenMembers.ts`, `contexts/MockAlbumContext.tsx`,
  `hooks/useAlbumInsightPosts.ts`, `types/albums.ts`.
- De-coupled from: `app/capture/review.tsx` (no more destination selector / album linking),
  `app/_layout.tsx`, `services/friends.ts` (dropped `getFriendAlbums`/`addFriendToAlbum`),
  `services/archive.ts` (dropped the `'album'` insight type), `services/storage.ts`,
  `hooks/useSubscription.ts` (dropped the dead `'albums'` feature gate), `services/ai.ts`.

### 2. Moodverse
- Was already hidden (`MOODVERSE_MVP_HIDDEN`); now fully deleted: `app/moodverse/`,
  `components/moodverse/`, `lib/moodverseStore.ts`, `services/moodverseExplainClient.ts`.
- Removed the `'moodverse'` option from `AmbientMode` (`lib/ambientMoodFieldStore.ts`) and the
  hidden remnants in `app/(tabs)/index.tsx` and `app/(tabs)/profile.tsx`.

### 3. Obsy-Note on photo uploads (+ "Use photo for insight" consent)
- Removed generation, the consent toggle, and all display from `app/capture/review.tsx`,
  `app/capture/[id].tsx`, and `components/home/TodayCaptureCard.tsx`.
- `createCapture()` (`lib/captureStore.ts`) no longer takes `obsyNote` / `usePhotoForInsight`.
- Core daily/weekly/monthly **insights are untouched** — only the per-photo note + the
  photo-as-AI-input consent were removed.

---

## ✅ Intentionally KEPT — do NOT delete or break

- **`moodverse-explain` Supabase edge function.** Despite the name, it is the **live AI backend
  for Topics** (`services/topicChatClient.ts`, `services/topicContentDigest.ts`). Keep it.
- **Friends (backend).** Screen relocated `app/albums/friends/` → **`app/friends/`**; the
  invite-accept flow lands there. It has **no other UI entry point on purpose** — Friends is
  deferred to post-MVP (planned for **topic sharing**). Keep the `friends` service + the OBS-15
  `get_profile_for_friending_by_*` backend.
- **`ObsyIcon`** moved `components/moodverse/` → **`components/ui/ObsyIcon.tsx`** (Topics uses it).
- **`ChatMessage` type** extracted from the old moodverseStore → **`lib/chatTypes.ts`**.

---

## ⏸️ Tags — DEFERRED, not removed (important)

Tags looks like an old, standalone feature, but **Topics depends on the `entries.tags` column**:
topic↔entry linking is done by storing a synthetic tag `topic:<topicId>` and filtering on it,
in ~11 files (`lib/topicStore.ts`, `services/topicChatClient.ts`, `services/topicContentDigest.ts`,
`app/topics/entries.tsx`, `components/topics/board/BoardItemPicker.tsx`, `app/capture/review.tsx`,
`app/voice/`, `app/journal/`, `app/quick-mood/`, `app/capture/[id].tsx`,
`components/entries/SaveSharedLinkModal.tsx`).

➡️ **Do not remove tags / the `tags` column** until Topics is first migrated onto a real
`topic_entries` link table. The user-facing tag UI is still present and was intentionally left in.

---

## 🗄️ Database — code-only removal (nothing dropped)

No migrations were run for this cleanup. These remain in the DB and in
`types/supabase.types.ts` (the schema mirror — **do not edit it to "match" the app**):
- Album tables: `albums`, `album_members`, `album_entries`, `album_daily_insights`,
  `album_insight_posts`; helper fns (`is_entry_in_user_album`, etc.) and their RLS/storage policies.
- Moodverse/World-Lens: `world_lens_runs` table + `world_lens_*` columns on `entries`.
- Obsy-note: `entries.ai_summary`, `entries.use_photo_for_insight`, `user_settings.ai_per_photo_captions`.

`Capture.obsy_note` / `Capture.usePhotoForInsight` (`types/capture.ts`) were kept as invisible
mirrors of the retained columns. Dropping any of the above is a **separate, deliberate** step.

> Note: `supabase/migrations/README.md` still documents the album tables/migrations — correct,
> because those objects still exist. The migration history (`Obsy/supabase/migrations`, the linked
> project) is the canonical source of truth.

---

## Known residuals (harmless; clean up later if desired)
- Dead exports: `generateAlbumInsightSecure` + `AlbumEntry` in `services/secureAI.ts`.
- Vestigial setting `ai_per_photo_captions` in `services/profile.ts` (no readers).
- `PRIVACY_POLICY.md` / `TERMS_OF_SERVICE.md` still describe the removed "Use photo for insight"
  per-capture opt-in. Album text was trimmed; the photo-insight wording was **left for human/legal
  review** (it's a privacy claim, not safe to silently rewrite).

---

## Conventions for future automated edits (paperclip)
- **Supabase migrations go in the canonical linked folder `Obsy/supabase/migrations/`** (the project
  linked via `supabase/config.toml`), **NOT** `Obsy-native/supabase/migrations/`. Use unique
  **14-digit** version prefixes (e.g. `20260610000001_...`). Migrations placed in the wrong folder or
  with colliding prefixes never get pushed.
- Don't re-add the removed features above as a "fix." If a feature is genuinely needed, raise it first.

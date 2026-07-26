# Plan: Shared-Link Enrichment — Social Digestion + Universal Thumbnails

Status: **IMPLEMENTED** 2026-07-25. Research verified 2026-07-25.
Branch: `claude/obsy-social-sharing-flow-0jjvs8`.

> Three plan assumptions were corrected during implementation, after testing
> each endpoint live — see "Corrections from live verification" at the bottom.
> Everything else landed as written. Not yet run against a real device or a
> deployed database; the migrations have not been applied.

## Problem

Two failures for TikTok / Instagram / X / Tumblr links, one root cause:

1. `supabase/functions/_shared/links/metadata.ts` falls back to OpenGraph scraping with an
   `ObsyLinkBot` UA — these platforms serve bot walls / JS shells, so no title, no `og:image`.
2. `supabase/functions/_shared/links/gemini.ts` routes `social` media type through
   `url_context` — Gemini's fetcher hits the same walls, so the digest silently nulls.

Additionally, thumbnails that *do* resolve from TikTok/Meta CDNs are **signed URLs that
expire in days** (`x-expires=...`), so hotlinked thumbnails rot. YouTube/Spotify don't
expire, which is why only those look good today.

Fix: use each platform's structured (oEmbed/JSON) endpoint for caption + thumbnail,
re-host thumbnails in Supabase Storage, digest social posts from their caption text,
and render every card through a 3-tier universal card system.

## Verified platform facts (July 2026)

| Platform | Endpoint | Gives | Notes |
|---|---|---|---|
| TikTok | `https://www.tiktok.com/oembed?url=<url>` | `title` = **full caption + hashtags**, `author_name`, `thumbnail_url` (576×1024) | No auth. Thumbnail URL is signed & **expires** → must re-host. Verified live. |
| Instagram / Threads / Facebook | Meta oEmbed, **tokenless since 2026-06-15** | embed HTML, provider, dimensions; thumbnail expected but **verify response shape at impl time** | Public content only; lower rate limits than token route. Try `https://graph.facebook.com/instagram_oembed?url=<url>&omitscript=true` with no token; Threads via `graph.threads.net/oembed`. Meta CDN URLs also expire → re-host. |
| X/Twitter | `https://publish.twitter.com/oembed?url=<url>&omit_script=1` | tweet **text** (inside blockquote HTML), `author_name` | **No thumbnail.** Decision: do NOT chase unofficial routes (syndication CDN / fxtwitter — unstable). Render X as a text card. |
| Tumblr | `https://www.tumblr.com/oembed/1.0?url=<url>` | embed info | OG scraping also still works (no aggressive bot wall). Tumblr API v2 (free key) optional later. |
| Reddit | append `.json` to post URL | title, selftext, preview images | No auth needed. |
| Gemini video | — | — | Still **YouTube URLs only** for direct video understanding. Non-YouTube video = download + Files API = ToS-gray + needs a non-Deno worker. **Deferred, out of scope.** Caption-first digestion is the chosen strategy. |

## Phase 1 — Structured metadata providers (backend)

File: `supabase/functions/_shared/links/metadata.ts`

- Add to `OEMBED_PROVIDERS`: TikTok, Instagram/Threads/Facebook (tokenless Meta), X, Tumblr.
- X special handling: `thumbnail_url` absent; extract tweet text from the returned
  blockquote `html` (strip tags, decode entities) — this is the digest input.
- Add a Reddit resolver (not oEmbed): fetch `<post-url>.json`, take `title`, `selftext`
  (cap ~500 chars), `preview.images[0].source.url` (unescape `&amp;`).
- Extend `ResolvedLinkMetadata` in `_shared/links/types.ts`:
  - `text: string | null` — caption / tweet body / selftext (digest input, also stored, see Phase 4)
  - `thumbnailExpires: boolean` — true for TikTok/Meta CDN URLs (signed URLs); informs re-host priority but **re-host everything anyway** (Phase 2)
- Keep the existing oEmbed→OG merge order; OG stays as fallback for Tumblr/generic web.
- `classifyMediaType`: keep `social` but note TikTok/Reels/Shorts are portrait video —
  the client derives aspect from platform (Phase 4), no schema change needed for that.

## Phase 2 — Thumbnail re-hosting (backend + migration)

**Migration** (new file in `supabase/migrations/`), following the pattern of
`20260610000005_storage_bucket_rls_avatars_topic_attachments.sql`:

- Bucket `link-thumbnails`, private. Path convention: `<user_id>/<entry_id>.jpg`.
- RLS: owner-scoped select/insert/update/delete (first path segment = `auth.uid()`).
- New column: `entries.shared_link_thumbnail_path TEXT` (storage path). Keep
  `shared_link_thumbnail_url` as legacy fallback for old rows — do not drop.
- New columns (used by Phase 3/4): `entries.shared_link_author TEXT`,
  `entries.shared_link_text TEXT` (caption/tweet excerpt, cap 500 chars at write).
- After running the migration, regenerate `types/supabase.types.ts` (it is the schema
  mirror — never hand-edit it; see `Obsy-native/MVP_FEATURE_REMOVALS.md`).

**Edge function** `supabase/functions/digest-shared-link/index.ts`:

- After `resolveLinkMetadata`, if `thumbnailUrl` resolved: download it
  (timeout ~8s, size cap ~5 MB, require `image/*` content-type), upload to
  `link-thumbnails/<user_id>/<entry_id>.jpg` via the caller-authed client (RLS-safe),
  `upsert: true`. On success write `shared_link_thumbnail_path`; on failure keep the
  raw URL in `shared_link_thumbnail_url` (best-effort, never throw).
- The function needs the entry's `user_id` — add it to the entry `select`.
- Also persist `shared_link_author` and `shared_link_text` from resolved metadata.
- Response envelope: add `thumbnailPath`, `author`, `text` fields; update
  `Obsy-native/services/linkDigestClient.ts` `LinkDigestResult` to match.
- Optional (skip unless trivial): no image resizing server-side — use Supabase Storage
  image transformations (width param) at render time on the client.
- Backfill of existing rows: out of scope; note that re-invoking `digest-shared-link`
  per entry is the backfill mechanism if ever wanted.

## Phase 3 — Caption-first social digestion (backend)

File: `supabase/functions/_shared/links/gemini.ts`

- New `SOCIAL_PROMPT`: given platform, author, and caption/text, write the 1–2 sentence
  journal digest. No preamble/markdown (match existing prompt style).
- In `buildBody`: for `mediaType === "social"` (and `"post"` when `resolved.text` exists),
  build a plain-text prompt from `resolved.text` + `resolved.author` + platform — **no
  `url_context` tool**. If no text resolved, fall through to the current `url_context`
  path (harmless: it nulls out on walled pages, as today).
- YouTube (`video`) and music paths unchanged.

## Phase 4 — Universal card system (client)

Files: `components/entries/SharedLinkCard.tsx`, `components/entries/EntryGridTile.tsx`,
`components/entries/StaticLinkPreview.tsx`, `components/topics/TopicEntryTile.tsx`,
`services/sharedLinkService.ts`, `lib/captureStore.ts`, `types/capture.ts`.

Every shared-link tile renders one of three tiers, always with the platform chip
(existing `platformToIcon` / `platformToColor`):

1. **Image card** — thumbnail from `shared_link_thumbnail_path` (signed/transformed URL
   via a small helper, e.g. `getLinkThumbnailUrl(path, width)`), falling back to legacy
   `shared_link_thumbnail_url`. Aspect handled by class, not platform hardcoding:
   - portrait (TikTok, Instagram reels, YouTube shorts): center-crop with a blurred,
     darkened copy of the same image as background fill so any aspect fills any tile
   - landscape (YouTube): 16:9
   - square (Spotify/album art): as-is
   Helper `platformAspect(platform, mediaType): 'portrait' | 'landscape' | 'square'`
   in `sharedLinkService.ts`.
2. **Text card** — X, Reddit/Tumblr text posts, or any social save with `shared_link_text`
   but no image: platform-tinted gradient background (add `platformToGradient(platform)`
   returning a two-stop pair derived from `platformToColor`), 2–3 line excerpt in quotes,
   author handle, chip. Must look right in both themes (see LIGHT_THEME_FIXES notes).
3. **Monogram fallback** — everything failed: platform gradient + platform logo + domain.
   Retire the gray globe default.

Client plumbing:

- `types/capture.ts` + `lib/captureStore.ts`: add `shared_link_thumbnail_path`,
  `shared_link_author`, `shared_link_text` to the entry mapping (6 mapping sites in
  captureStore mirror the existing `shared_link_*` fields — extend all of them and
  `createSharedLinkEntry`).
- `linkDigestClient.ts`: extend result type; the save flow already fire-and-forgets.

## Phase 5 — QA

- Unit: extend existing jest coverage around `sharedLinkService` for `platformAspect`
  and gradient helpers; edge-function helpers (`metadata.ts` X-text extraction,
  Reddit JSON parsing) if the repo grows Deno tests — otherwise manual.
- Manual matrix (one URL each): TikTok video, Instagram post + reel, X text tweet,
  X media tweet (expect text card), Tumblr post, Reddit text + image post, YouTube,
  YouTube short (portrait), Spotify track, generic article. Verify: title, digest,
  re-hosted thumbnail renders after CDN expiry window, both themes, grid + detail views.
- Confirm graceful degradation: bogus URL → monogram card, no crash, entry still saves.

## Explicit non-goals (decided)

- No video downloading / yt-dlp / third-party scraper APIs (ToS risk, needs non-Deno
  worker). Caption-first only. Revisit post-MVP only on user demand.
- No unofficial X thumbnail routes (syndication CDN, fxtwitter). Text cards instead.
- No backfill migration for existing entries' expired thumbnails.
- Share-sheet/share-extension capture flow is a separate effort (previously discussed),
  not part of this plan.

## Suggested commit sequence

1. Migration + regenerated supabase types (Phase 2 schema).
2. `metadata.ts` providers + types (Phase 1).
3. `digest-shared-link` re-hosting + new fields (Phase 2) + `gemini.ts` social prompt (Phase 3).
4. Client card system + store plumbing (Phase 4).
5. QA fixes.

---

## Corrections from live verification (2026-07-25)

Each provider was called for real before being trusted. Three plan assumptions
did not survive:

1. **Reddit's JSON API 403s from datacenter IPs.** Both `www.reddit.com/...json`
   and `old.reddit.com/...json` returned Reddit's bot-check page to this cloud
   host, and so did the plain HTML page. Supabase edge functions egress from the
   same class of IP, so this will likely fail there too. The plan had Reddit
   *replacing* its OpenGraph path with the JSON resolver, which would have been
   a regression; instead both run in parallel and whichever succeeds wins.

2. **OpenGraph can return a bot wall as the title.** Reddit's block page is
   titled "Reddit - Please wait for verification". Without a guard that string
   would have become the entry's permanent title. `looksLikeBotWall()` now
   discards such responses entirely, letting the card fall back to its platform
   tier — which reads as intentional.

3. **Tumblr's oEmbed endpoint is dead.** `https://www.tumblr.com/oembed/1.0`
   serves an HTML page, not JSON. The provider was removed rather than left to
   burn a 6-second timeout on every Tumblr save; Tumblr does return real
   `og:title`/`og:image` to a plain fetch, so it resolves through OpenGraph.

Confirmed working exactly as the plan described:

- **TikTok** oEmbed — `title` is the full caption including hashtags, plus
  `author_name` and a 576×1024 `thumbnail_url` carrying `x-expires`.
- **X** oEmbed — tweet body inside the blockquote's `<p>`, `author_name`, and no
  thumbnail field at all, which is what makes the text card the right render.
  Note it answers with a 301 first; Deno's fetch follows redirects by default.
- **Meta's tokenless `instagram_oembed`** — rejected a fake media id with
  "Media Not Found" rather than demanding an access token, confirming the
  June 2026 tokenless change is live and the endpoint URL is correct.

## Still outstanding

- Migrations `20260725000001` and `20260725000002` have not been applied, and
  `types/supabase.types.ts` has not been regenerated against them.
- No device testing. The QA matrix in this document is unrun.
- Existing entries keep their expiring thumbnail URLs until their entry is
  re-digested; no backfill was written (out of scope, as planned).

# Obsy Media Board — Implementation Spec

**Status:** Design spec, not yet implemented
**Owner:** Reeves
**Written for:** a fresh Claude Code session picking this up cold in VS Code

---

## 1. What we are building

A **Media Board**: a single, lifelong spatial canvas showing the media that moved
the user — songs, videos, articles, posts — each card carrying the mood the user
attached when they saved it.

The board is **auto-populated and auto-arranged**. The user never faces a blank
canvas and is never asked to compose anything. They open it and find a wall that
assembled itself out of things they already saved. They *may* drag, resize, and
edit — but editing is an option, never a task.

Later, an AI **Board Read** interprets the wall back to them.

### The one-line product thesis

> Insights is the read on your feelings. The board is the read on your taste.

### Why this matters commercially

Every other save-things app (Pocket, Raindrop, saved TikToks) is retrieval-oriented
and rots into a graveyard. Obsy's link save flow already enforces
`canSave = !!selectedMoodId && !!meta.url` — **you cannot save a link without a
mood**. That single constraint converts bookmarking into journaling, and it is why
this wall stays meaningful instead of becoming Pinterest.

**Protect that constraint wherever media enters the app.** It is the cheapest moat
in the product.

---

## 2. Product principles (non-negotiable)

1. **Zero manual work by default.** The board arranges itself. Opening it is the
   only required user action.
2. **Never empty, never wrong.** Auto-placement means a user with three saved
   links already has a wall worth looking at. There is no blank-canvas state to fail.
3. **Editing is ownership without obligation.** The moment a user drags one card,
   the wall becomes theirs — and auto-layout must never undo that.
4. **The arrangement carries meaning.** Position is data, not decoration. Related
   things sit near each other; important things are bigger. The user should see
   structure they did not create. That is the metacognition hit.
5. **Restraint over cleverness.** Consistent gutters, a small set of card sizes,
   generous breathing room, and let the mood gradients do the color work. A tidy
   masonry grid beats an elaborate arrangement with sloppy spacing.

---

## 3. Tech stack

### The board canvas (already built)

| Piece | Detail |
|---|---|
| Canvas library | **tldraw v5** (`tldraw: ^5.1.0`) |
| Board app | React 19 + TypeScript, built with **Vite 6** |
| Bundling | `vite-plugin-singlefile` → one self-contained HTML file, all JS/CSS inlined |
| Source | `Obsy-native/board-web/` |
| Build output | `Obsy-native/assets/board/index.html` (~2 MB, **committed to git**) |
| Host | `react-native-webview` inside the Expo app, loaded from a bundled asset (no network) |

### The app

| Piece | Detail |
|---|---|
| Framework | Expo (SDK 54-era) + expo-router, React Native, new architecture enabled |
| State | Zustand + `persist` middleware over AsyncStorage |
| Backend | Supabase (Postgres + RLS, Storage, Edge Functions on Deno) |
| AI | Shared router at `supabase/functions/_shared/ai/router.ts` — Claude primary, Gemini fallback, DeepSeek available |
| Payments | RevenueCat, entitlement id `plus`. Tiers are `free` \| `plus` only |

### Answering the "could a Python script do this?" question

Yes to the *instinct*, no to the language. The layout is a **deterministic script,
not an AI call** — but it runs in TypeScript inside the board WebView, next to
tldraw, so it executes in milliseconds, offline, at zero cost, every time the board
changes. A Python service would mean a network round trip for something that should
feel instant. **No Python anywhere in this feature.**

---

## 4. What already exists (inventory)

The board was built as Topic Focus Mode page 2. All of it is reusable.

### Board web app — `Obsy-native/board-web/`

| File | Lines | What it does |
|---|---|---|
| `src/main.tsx` | 273 | tldraw mount, RN message handling, persistence, shape creation helpers, asset store |
| `src/ObsyCardShapeUtil.tsx` | 163 | Custom `obsyCard` tldraw shape — the styled "blog card" |
| `src/bridge.ts` | 57 | Bridge protocol (board side) |
| `vite.config.ts` | 24 | Single-file build config, outputs to `../assets/board` |

**Already working in `main.tsx`:**
- Snapshot load/save with a 1500 ms debounce (`scheduleSave` / `emitSnapshot`)
- `view` / `edit` mode toggle (view mode = tldraw readonly + hand tool)
- Image embedding as downscaled JPEG data URLs (max 768 px, quality 0.5)
- Legacy `obsy://<storage_path>` asset resolution via async RN round trip
- tldraw chrome hidden (menus, minimap, zoom); Toolbar + StylePanel intentionally kept
- Dark color scheme forced
- Pointer events forwarded to RN to lock page swipe during interaction

**`obsyCard` shape props (current):**
```ts
{ w, h, variant, title, body, url, hue, refId }
// variant: 'entry' | 'insight' | 'gap' | 'link' | 'note'
```
Extends `BaseBoxShapeUtil`, so move / resize / lock / z-order come free.
`canEdit()` returns false — cards are not text-editable in place.

### React Native side

| File | What it does |
|---|---|
| `components/topics/focus/TopicBoardPage.tsx` | WebView host, native chrome, add-content flows, persistence wiring, swipe lock |
| `components/topics/board/boardBridge.ts` | Bridge protocol (RN side) — **must stay in sync with `board-web/src/bridge.ts`** |
| `components/topics/board/AddToBoardSheet.tsx` | Bottom sheet: Note / Image / Link / Topic Entry / Saved Insight |
| `components/topics/board/BoardItemPicker.tsx` | Picker for pulling existing entries/insights onto the board |
| `lib/boardStore.ts` | Zustand + AsyncStorage, keyed by `topicId`, persists `{ snapshot, isEmpty, updatedAt }` |
| `services/topicAttachments.ts` | `createSignedUrl(storagePath)` for private-bucket images |

### Current bridge protocol

```ts
// RN → Board
| { type: 'init'; snapshot: unknown | null; topicHue: number; mode: 'view' | 'edit' }
| { type: 'setMode'; mode: 'view' | 'edit' }
| { type: 'addShape'; shape: { kind: 'note' | 'image' | 'obsyCard'; ... } }
| { type: 'resolveAsset'; storagePath: string; url: string | null }
| { type: 'flush' }

// Board → RN
| { type: 'ready' }
| { type: 'snapshot'; snapshot: unknown; isEmpty: boolean }
| { type: 'requestAsset'; storagePath: string }
| { type: 'interaction'; phase: 'start' | 'end' }
| { type: 'openItem'; refId: string }
| { type: 'console'; level: string; text: string }
```

### The media data that will fill the board

`Obsy-native/types/capture.ts` — shared-link entries already carry everything needed:

```ts
source_type: 'shared_link'
shared_link_url
shared_link_platform          // TikTok | YouTube | Reddit | Spotify | Instagram | Web ...
shared_link_title
shared_link_thumbnail_url     // ← the visual payload for media cards
shared_link_digest            // ← Gemini-generated content summary, drives AI clustering
shared_link_media_type        // article | post | video | music | playlist | podcast | social | link
mood_id, mood_name_snapshot   // ← the emotional vector
created_at
```

The digest pipeline is live: `supabase/functions/digest-shared-link/index.ts`
(Gemini watches YouTube videos, distills song themes from LRCLIB lyrics without
persisting them, reads articles via url_context).

---

## 5. Critical gotchas — read before writing any code

### 5.1 `assets/board/index.html` is a build artifact

Editing `board-web/src/*` does **nothing** until you rebuild:

```bash
cd Obsy-native/board-web
npm install
npm run build      # regenerates ../assets/board/index.html
```

The ~2 MB output is committed to git. Commit it alongside source changes or the
app ships stale board code.

Dev loop: `npm run dev` runs the board standalone in a browser. Stub
`window.obsyBoard.receive` from the console to test messages without the app.

### 5.2 Topics are being removed — the board must be decoupled

The board is currently coupled to Topics in several places:

- `boardStore` is keyed by `topicId`
- `TopicBoardPage` takes `topic: Topic` and `stats: TopicStats` props
- The `init` message sends `topicHue`, used as the card accent (`hue` prop)
- `AddToBoardSheet` offers "Topic Entry" and "Saved Insight" as sources
- `topic_attachments` table stores `topic_id text` (client-side topic ids)

**None of this is load-bearing.** The board never needed Topics — it needed a
container id and an accent color. Decoupling is a rename plus a re-key.

### 5.3 The Home screen in this branch is out of date

`app/(tabs)/index.tsx` in this repo still renders the old `HomeActionCarousel`
(the four-way orbit of voice / camera / journal / quick-mood).

The **current live Home** is a composer layout:
- Header "DROP IT IN / What's on your mind?"
- A text composer with `+`, mic, and **link** buttons and a "Log it" action
- A "How are you feeling?" mood chip
- A "RECENT MEMORIES" horizontal carousel of mood-gradient cards with "See all"
- Four tabs: **Home / Entries / Insights / Settings** (Topics already gone)

Write the Home entry point against **whatever Home is current in the working
branch**, not against the carousel in this file. Confirm before editing.

### 5.4 Tier limits are server-side

Any AI feature added here must enforce limits inside the Edge Function, matching
the existing pattern (see `topic-pulse`, `generate-mood-signal-interpretation`).
Never trust a client-supplied tier — `20260610000002_guard_subscription_tier_server_only.sql`
exists specifically to prevent that.

---

## 6. Architecture — who does what

The single most important design decision:

> **A deterministic script decides geometry. AI decides meaning. Neither does the
> other's job.**

Asking a language model for x/y coordinates produces overlapping cards, uneven
gutters, and drift — it has no eyes on the canvas. It is also slow and costs money
on every refresh. Layout is a solved problem; meaning is not.

| Job | Owner | When it runs | Cost |
|---|---|---|---|
| Positioning, sizing, packing, no-overlap | **Script** (TS, in board-web) | Every board open + every add | Free, instant, offline |
| Color-rhythm neighbor ordering | **Script** | Same | Free |
| Respecting user-pinned cards | **Script** | Same | Free |
| Grouping items by theme | **AI** (Edge Function) | Occasionally, cached | Metered |
| Ranking emotional importance | **AI** | Occasionally, cached | Metered |
| Naming clusters | **AI** | Occasionally, cached | Metered |
| Board Read narrative | **AI** | On demand, user-triggered | Metered, tier-limited |

AI output is **never coordinates**. It returns groupings, weights, and labels.
The script turns those into geometry.

---

## 7. Phase 1 — Decouple from Topics, add the Home entry point

### 7.1 Rename and re-key

**`lib/boardStore.ts`**

```ts
export type BoardRecord = {
    boardId: string;          // was topicId
    snapshot: unknown;
    isEmpty: boolean;
    updatedAt: string;
};
```

Keep the `Record<string, BoardRecord>` map — multiple walls stay possible later
(seasonal walls, see §11). For v1 use a single constant id:

```ts
export const MEDIA_BOARD_ID = 'media-wall';
```

Add a store migration (`version: 2`) that either drops old topic-keyed boards or
merges the largest one into `media-wall`. Reeves' call — see §12.

**Component move**

`components/topics/focus/TopicBoardPage.tsx` → `components/board/MediaBoardScreen.tsx`

Strip the `topic`/`stats` props and the pager props (`pageIndex`, `pageCount`,
`onGoToPage`, `onInteractingChange`) — it is a standalone screen now, not a page in
a horizontal pager, so the WebView no longer competes with a swipe gesture. Keep
`onClose`.

Move `board/` helpers from `components/topics/board/` → `components/board/`.

**Bridge:** rename `topicHue` → `accentHue` in the `init` message and in
`ObsyCardProps.hue` usage. Source it from the app theme accent
(`lib/themeAccent.ts`) rather than a topic.

**Route:** add `app/board/index.tsx` (+ `_layout.tsx`) presenting the board
full-screen, matching the modal-ish presentation of `app/capture` / `app/journal`.

**`AddToBoardSheet`:** drop the `entry`/`insight` (topic-scoped) options, keep
`note` / `image` / `link`, and add a "From your entries" picker sourced from
`captureStore` instead of topic entries.

### 7.2 Home entry point — a live preview, not a button

Do **not** add a fifth tab. Add a preview tile to Home.

It should render an actual scaled-down view of the wall with three or four recent
items legible, not a labeled icon. `boardStore` already persists the snapshot and
an `isEmpty` flag, which is exactly what a preview needs.

Two implementation options:

| Option | How | Trade-off |
|---|---|---|
| **A — native preview (recommended for v1)** | Read the last N media entries from `captureStore` and render a small static RN collage of mood-gradient tiles | Instant, cheap, no second WebView on Home, visually consistent with the Recent Memories cards |
| **B — real WebView thumbnail** | Second WebView in readonly + `zoomToFit`, pointer events disabled | Pixel-accurate but heavy on the Home screen; a WebView per Home render is a real cost |

Go with **A**. It looks like the board, costs nothing, and the real canvas is one
tap away.

**Placement:** below the "RECENT MEMORIES" row. The vertical story reads
composer (input) → recent memories (latest output) → the wall (accumulated output).

**Why this matters:** because the board self-populates, this preview **changes on
its own** every time the user saves a link. Home quietly redecorates itself as a
byproduct of use. That is a compulsion loop for free — no competitor's home screen
changes.

**Empty state:** if the user has no media entries yet, show the tile with a
one-line invitation ("Save something that moves you") rather than hiding it — it
advertises the feature.

### 7.3 Media cards need thumbnails

`ObsyCardShapeUtil` currently renders label / title / body / url and **no image**.
A media wall without artwork will look like a wall of text.

Add to `ObsyCardProps`:

```ts
thumbnailUrl: string;   // '' when absent
mediaType: string;      // article | post | video | music | ...
platform: string;       // TikTok | YouTube | Spotify | ...
moodHexFrom: string;    // mood gradient start
moodHexTo: string;      // mood gradient end
```

Render rules:
- Thumbnail fills the top ~60% of the card, `object-fit: cover`, rounded to match
- Title below, 2-line clamp; body/digest excerpt 2-line clamp
- Small platform badge over the thumbnail corner
- The mood gradient becomes the card's accent edge (replacing the flat `hue`
  accent bar) — this is what makes the wall read as *emotional* rather than as a
  link dump
- No thumbnail → fall back to a mood-gradient fill, so the card is still a color
  block, never a grey box

`shared_link_thumbnail_url` is a remote URL. The WebView loads from a
`file://` bundle with no network dependency by design — verify remote images load
in that context. If blocked, fetch and downscale to a data URL RN-side (reuse the
`fileToDataUrl` approach in `main.tsx`) before sending the card.

---

## 8. Phase 2 — The auto-layout engine

New file: **`board-web/src/layout.ts`**. Pure functions, no tldraw imports where
avoidable, so it is unit-testable.

### 8.1 When it runs

- On `init`, after the snapshot loads, if `autoLayout` is enabled for the board
- After a batch of new items arrives (`syncItems`)
- On explicit user request ("Tidy up" in the board chrome)

**Never** on every shape change — that would fight the user mid-drag.

### 8.2 Pinning — the rule that protects user edits

Any shape the user has moved or resized gets `meta.pinned = true`:

```ts
editor.store.listen(({ changes }) => {
    // on user-sourced translate/resize of a shape, set meta.pinned = true
}, { scope: 'document', source: 'user' });
```

Auto-layout **treats pinned shapes as immovable obstacles** and flows everything
else around them. Add "Reset layout" to the context menu to clear all pins.

This is principle 3 made concrete: one drag and the wall is theirs.

### 8.3 The algorithm — masonry with weighting

Start here. It is reliable, fast, and looks good.

```
INPUT:  items[]  — { refId, createdAt, moodEnergy, moodHue, weight?, clusterId? }
        pinned[] — { x, y, w, h } rectangles to avoid
        canvasWidth

1. SIZE
   weight = 0.5 * recencyScore + 0.5 * intensityScore   (both normalized 0..1)
     recencyScore  = exponential decay over days since createdAt
     intensityScore= mood energy tier: high = 1.0, medium = 0.6, low = 0.35
                     (+ AI rank in Phase 4, when available)

   Map weight to ONE OF THREE fixed sizes — never continuous:
     weight >= 0.75 → L  (360 x 300)
     weight >= 0.40 → M  (280 x 230)
     else           → S  (220 x 180)

   Fixed tiers are what make the grid look designed rather than noisy.

2. COLUMNS
   columnCount = clamp(round(sqrt(items.length * 0.75)), 2, 6)
   columnWidth = L.width
   GUTTER      = 28   (constant everywhere — this single number does most of the
                       aesthetic work; do not vary it)

3. ORDER
   Sort by weight descending, so heavy cards land near the top/center.
   Then apply COLOR RHYTHM (step 5) before placing.

4. PLACE (classic masonry)
   for each item:
     col = the column with the smallest current height
     x = col.index * (columnWidth + GUTTER)
     y = col.height
     if rect(x, y, w, h) intersects any pinned rect (inflated by GUTTER):
         y = bottom of that pinned rect + GUTTER   // flow around it
     place; col.height = y + h + GUTTER

5. COLOR RHYTHM
   Before placing, do a single-pass local reorder: if two adjacent items in the
   order have mood hues within 20 degrees of each other, swap the second with the
   next item that differs by more. Cap at one pass — this is a nudge, not a solve.
   This is how human designers make collages work, and it is the cheapest way to
   make the wall look composed.

6. CENTER
   Translate all placed shapes so the bounding box centers on origin, then
   editor.zoomToFit().

OUTPUT: [{ refId, x, y, w, h }]
```

Apply positions in a single batch (`editor.run(() => { ... })` or equivalent
batched update) so tldraw records one undo entry and the WebView paints once.

### 8.4 Animating the reflow

New items should not teleport into place. Because layout is instant and free, the
board can re-flow **live**: cards nudge over to make room with a short eased
transition. If tldraw does not animate shape translation natively, interpolate
positions over ~350 ms with `requestAnimationFrame` before committing the final
values.

This is where the feature stops feeling mechanical. It also matches the motion
language already in the app — the Aurora orbs run a momentum/damping loop in
`components/backgrounds/AuroraBackground.tsx`.

### 8.5 Optional flourish — physics relax pass

After masonry, an optional force-directed pass (repel on overlap, weak attraction
toward same-cluster centroids, ~60 iterations then freeze) makes the grid feel
organic rather than gridded.

**Gate this behind a flag and ship masonry first.** Masonry alone is the reliable
good-looking version; physics is polish that can destabilize spacing if rushed.

---

## 9. Phase 3 — Arrangement schemes that carry meaning

Once masonry works, position can encode data. Each of these is a strategy the
layout engine selects, not a rewrite:

| Scheme | Rule | What the user sees |
|---|---|---|
| **Emotional geography** | Mood energy maps to canvas region — high-energy warm moods drift one way, low/cool the other. Mood hue drives angle from center | A map of their palette. "My whole month sat in the blue corner." |
| **Gravity by recency** | Distance from center = age. New things near the middle, old drifting outward | A slow solar system |
| **Constellations** | Cluster centroids spread apart; faint connective lines between same-cluster cards | Fits the existing orb visual language |
| **Size = intensity** | Already in §8.3 step 1 | The song that wrecked them is physically bigger than the article they liked |

Expose as a small strategy picker in the board chrome, defaulting to the tidiest.
`'masonry' | 'mood-regions' | 'recency-gravity' | 'constellations'`.

---

## 10. Phase 4 — AI clustering (meaning, not geometry)

### New Edge Function: `supabase/functions/generate-board-clusters/index.ts`

Follow the house pattern exactly — see `topic-pulse/index.ts` as the reference for
auth, CORS, tier limits, and `runAiTextTask` usage.

**Input (client → function).** Metadata only:

```ts
{
  items: Array<{
    refId: string;
    title: string;          // shared_link_title
    digest: string;         // shared_link_digest — already generated, reuse it
    mediaType: string;
    moodName: string;
    moodEnergy: 'low' | 'medium' | 'high';
    createdAt: string;
  }>
}
```

**Never send:** photos, raw journal notes, voice transcripts, user identifiers,
or full URLs. This matches the privacy posture documented in `topic-pulse` and
`generate-mood-signal-interpretation`, and it is a marketable property — keep it.

**Output:**

```ts
{
  ok: true,
  clusters: Array<{
    id: string;
    label: string;        // "The 3am shelf" / "Things that made you want to make something"
    refIds: string[];
    weight: number;       // 0..1 — how central this cluster is to the period
  }>
}
```

**Routing:** `runAiTextTask` with `responseFormat: 'json'`. Claude primary
(strong at this kind of thematic judgment), Gemini fallback — the router default
order already is `["claude", "gemini"]`.

**Tone:** cluster labels are where the personality lives. Resolve the user's
selected tone the same way `secureAI.ts` does (`resolveTonePrompt`) and pass it as
the system prompt so labels sound like the rest of the app — see
`docs/TONE_SYSTEM_GUIDE.md`.

**Caching:** store the cluster result and only regenerate when the item set has
changed meaningfully (e.g. 5+ new items, or manual refresh). This is not a
per-open call.

**Tier limits:** enforce server-side, e.g. `free: 2/day`, `plus: 10/day`, matching
`PULSE_LIMITS` in `topic-pulse`.

The layout engine consumes `clusterId` + `weight` and does all the placement.

---

## 11. Phase 5 — Board Read

The payoff feature. Ship it after everything above is stable.

### The idea

Every AI feature in Obsy today reads a **list** — captures in order, aggregate mood
metadata. A board read is the first that reads a **spatial arrangement**. What sits
in the center, what is large, what got pushed to the edge, what the user clustered
together without thinking about it — that is projective. A Rorschach the user built
themselves without knowing it.

Three vectors, and no other app holds all three:
1. **What the thing was** — `shared_link_digest`
2. **What it did to them** — mood
3. **Where they put it** — x/y/size from the tldraw snapshot

### New Edge Function: `supabase/functions/generate-board-read/index.ts`

**Input:** the §10 item metadata **plus** normalized geometry per item
(`x`, `y`, `w`, `h` scaled to a 0..1 canvas), plus which items are `pinned`
(user-placed — those are the highest-signal items on the wall, because the user
chose their position deliberately).

**Output:** a short narrative read in the user's selected tone. Cap it — 150-200
words. Brevity is what makes it feel like an observation rather than a report.

**Tier:** on-demand, user-triggered, tier-limited (`free: 1/week`, `plus: 5/week`
as a starting point). This is the natural premium moment in the feature — a rare,
generative, high-value act rather than another chart.

**Shareability:** the output should be renderable as an image card. "Here's what
your wall says about you" gets screenshotted; "your mood variance this week" does
not. Reuse the insight-card path (`generate-insight-card`) if it fits.

---

## 12. Data model changes

### Client

```ts
// lib/boardStore.ts — bump to version: 2, add migrate()
BoardRecord.topicId → boardId
export const MEDIA_BOARD_ID = 'media-wall';
```

Add alongside the snapshot, so layout does not have to parse the tldraw blob:

```ts
type BoardMeta = {
    boardId: string;
    layoutStrategy: 'masonry' | 'mood-regions' | 'recency-gravity' | 'constellations';
    autoLayoutEnabled: boolean;
    lastLayoutAt: string;
    clusters?: Array<{ id: string; label: string; refIds: string[]; weight: number }>;
    clustersGeneratedAt?: string;
};
```

### Server

No new tables required for Phases 1-3 — the board lives in AsyncStorage and the
media entries already exist in `entries`.

For Phase 4/5, follow the existing limits pattern (see
`20260614_topic_pulse_limits.sql` and `20260615000002_mood_signal_interpretation_limits.sql`)
for per-day counters.

**Cross-device sync** (board snapshot → Supabase) is explicitly **out of scope**
for v1. The board is local-first, same as it is today. Note it as a known limit.

**`topic_attachments`** stays as-is for now; if Topics are fully deleted, the board
image path should move to a board-scoped bucket. Not urgent — Phase 1 board images
are embedded data URLs, not storage-backed.

---

## 13. Bridge protocol additions

Add to **both** `board-web/src/bridge.ts` and `components/board/boardBridge.ts`.
They are hand-mirrored; drift here causes silent failures.

```ts
// RN → Board
| {
    type: 'syncItems';
    items: Array<{
        refId: string;
        title: string;
        body: string;
        url?: string;
        thumbnailUrl?: string;
        mediaType?: string;
        platform?: string;
        moodHexFrom: string;
        moodHexTo: string;
        moodEnergy: 'low' | 'medium' | 'high';
        createdAt: string;
        clusterId?: string;
        weight?: number;
    }>;
    /** Remove cards whose refId is no longer present (entry deleted). */
    prune: boolean;
  }
| {
    type: 'autoLayout';
    strategy: 'masonry' | 'mood-regions' | 'recency-gravity' | 'constellations';
    animate: boolean;
  }
| { type: 'resetPins' }

// Board → RN
| { type: 'layoutApplied'; itemCount: number; pinnedCount: number }
| {
    type: 'geometry';           // for the Board Read
    items: Array<{ refId: string; x: number; y: number; w: number; h: number; pinned: boolean }>;
  }
```

Also: `openItem` is currently a no-op ("v1: tapping a card in view mode is a
no-op"). Wire it to navigate to `app/capture/[id]` so tapping a card opens the
entry. On a media wall that is the expected gesture.

---

## 14. Privacy rules

Non-negotiable, consistent with the rest of the codebase:

- Board AI functions receive **metadata only** — title, digest, media type, mood
  name, timestamps, geometry. Never photos, raw notes, transcripts, or full URLs.
- Respect **AI-free mode** (`hooks/useAiFreeMode.ts`) — with it on, the board still
  auto-arranges (the script is not AI) but clustering and Board Read are disabled.
  Worth saying in the UI: *the layout is not AI.*
- Respect the per-entry `includeInInsights` flag. An entry excluded from insights
  should not be fed to clustering or Board Read. Whether it still *appears* on the
  wall is a product call — recommendation: yes, it appears, but is never sent to AI.
- Tier checks server-side only.

---

## 15. Build & verify

```bash
# Board canvas
cd Obsy-native/board-web
npm install
npm run typecheck
npm run build                 # → ../assets/board/index.html   (COMMIT THIS)

# App
cd Obsy-native
npx tsc --noEmit
npm test                      # jest
npx expo start
```

Manual checks that matter:
1. Save 3 links → open board → cards laid out, no overlaps, even gutters
2. Drag one card → close → reopen → **that card is where the user left it**
3. Save a 4th link → reflow animates, pinned card does not move
4. Airplane mode → board opens and lays out fine (script is offline)
5. Rotate device / small screen → column count adapts
6. 100+ items → still smooth (this is the perf ceiling to watch)

---

## 16. Sequencing

| Phase | Scope | Ships as |
|---|---|---|
| **1** | Decouple from Topics, `app/board` route, Home preview tile, thumbnails on cards | A real media wall, manually arranged |
| **2** | `layout.ts` masonry + pinning + animated reflow | The wall arranges itself — **the core promise** |
| **3** | Alternate strategies (mood regions, gravity, constellations) | The arrangement means something |
| **4** | `generate-board-clusters` + labels | Related things sit together, with names |
| **5** | `generate-board-read` | The payoff, and the premium moment |

Phase 2 is the one that matters. Everything before it is plumbing; everything after
is upside. If scope has to be cut, ship 1 + 2 and stop — an auto-tidying wall of
media that you saved with your feelings attached is already a feature nothing else
on the App Store has.

---

## 17. Open decisions for Reeves

1. **Existing topic boards** — migrate the largest one into the media wall, or drop
   them on upgrade? (Affects the `boardStore` v2 migration.)
2. **One lifelong wall, or seasonal walls** (per month/season)? Spec assumes one
   lifelong wall with `MEDIA_BOARD_ID`; the store is a map, so seasonal is additive
   later. Seasonal is the better screenshot ("my November wall"); lifelong is the
   better first version.
3. **Do non-media entries go on the wall** — photos, journal entries, voice notes —
   or is it strictly saved media? Spec assumes **media-first**, with entries
   addable manually. Media-only keeps the concept sharp.
4. **Home preview placement** — below Recent Memories (spec's assumption) or
   replacing/merging with it?
5. **Does an entry excluded from insights still appear on the wall?**
   (Recommendation: yes, but never sent to AI.)

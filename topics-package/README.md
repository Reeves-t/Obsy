# Obsy Topics — extracted feature package

The complete Topics feature, removed from the Obsy app on branch `feat/remove-topics`
(July 2026) and preserved here so a **standalone Topics app** can be built from it later.
Nothing in this folder is compiled into Obsy; it is a code archive with its full git
history (files were moved with `git mv` from `Obsy-native/` and `supabase/`).

## What the feature is

- **Topics garden** (`app/topics-tab.tsx`, formerly `app/(tabs)/topics.tsx`) — physics-based
  orb garden of the user's topics (`components/topics/useGardenPhysics.ts`, `TopicOrb.tsx`).
- **Focus Mode** — a 4-page swipe pager per topic (`components/topics/focus/TopicFocusPager.tsx`):
  1. **Observe** — stats, Topic Pulse feed ("Explore this topic", DeepSeek-backed)
  2. **Board** — freeform tldraw canvas in a WebView (see *Board* below)
  3. **Discover** — AI-generated insights (`useTopicAiPage.ts`, `topicAiParse.ts`)
  4. **Evolve** — AI suggestions incl. habit/goal prompts (`GoalHabitSuggestionCard.tsx`)
- **Topic chat** (`app/topics/chat.tsx`, `services/topicChatClient.ts`, `lib/chatTypes.ts`).
- **Topic entries & attachments** (`app/topics/entries.tsx`, `services/topicAttachments.ts`,
  uploads to the `topic-attachments` storage bucket; text extraction via the
  `extract-attachment` edge function using Claude).
- **Topic Pulse** (`services/topicPulseClient.ts` + `supabase/functions/topic-pulse/`) —
  DeepSeek-generated exploration cards. Finite daily limits for BOTH tiers
  (free 5 / plus 10 in the client `LIMITS`; enforced server-side via
  `user_settings.topic_pulse_count`, reset by `20260614_topic_pulse_limits.sql`).

## Folder map

```
app/                    Expo Router screens (topics-tab.tsx was app/(tabs)/topics.tsx)
components/topics/      All topic UI (incl. focus/ pager pages, board/ RN side)
components/capture/     TopicSelectionField (topic picker used by capture flows)
lib/                    topicStore (zustand), topicAttachmentStore, boardStore,
                        topicAiParse/Types, topicFocusRules, topicLens, chatTypes
services/               topicChatClient, topicPulseClient, topicContentDigest,
                        topicAttachments
hooks/                  useTopicAiPage
board-web/              Standalone Vite app (tldraw v5) — builds the board bundle
assets/board/           Pre-built single-file board bundle (index.html)
__tests__/              Jest tests for topicAiParse, topicFocusRules, topicLens
supabase/functions/     topic-pulse, extract-attachment (moved out of ../supabase/functions)
supabase/migrations-reference/  COPIES of applied topic migrations (see below)
```

## Board (tldraw WebView)

`board-web/` is its own npm project (React 19 + tldraw 5 + Vite + vite-plugin-singlefile).
`npm install && npm run build` inside it regenerates `assets/board/index.html`, which the
RN side loads in a WebView (`components/topics/focus/TopicBoardPage.tsx`, message bridge in
`components/topics/board/boardBridge.ts` ↔ `board-web/src/bridge.ts`).

Host app requirements that were removed from Obsy's `metro.config.js` and must be
re-added in the standalone app:
- `config.resolver.assetExts.push('html')` so `require('assets/board/index.html')` works
- a Metro `blockList` entry for `/board-web/` (it has its own node_modules)

## Backend objects (all still live in the `Obsy-Gotenks` Supabase project)

- **Tables**: `topic_attachments` (+ `extracted_text` column), `user_settings.topic_pulse_count`.
  Topics themselves and topic↔entry links are client-side: topics live in the persisted
  zustand `topicStore`; an entry is linked by a synthetic tag `topic:<topicId>` in
  `captures.tags`. Existing user data keeps those inert tags.
- **Storage bucket**: `topic-attachments` (private, RLS per-user paths).
- **Edge functions**: `topic-pulse` (DeepSeek; enforces daily limits) and
  `extract-attachment` (Claude; caches into `topic_attachments.extracted_text`).
  Both are STILL DEPLOYED — Obsy no longer calls them. Delete from the dashboard when
  ready, or keep for the standalone app. `delete-account` (still in the app repo) keeps
  purging `topic-attachments` storage for account deletions.
- **Migrations**: files in `supabase/migrations-reference/` are copies for re-creating the
  schema in a new project. The originals remain in `../supabase/migrations/` because they
  are applied history for the prod DB — do not re-run them there.

## AI providers & keys

- **DeepSeek** — Topic Pulse cards (`topic-pulse` function; `DEEPSEEK_API_KEY` secret).
  Scoped to non-sensitive derived context, never raw journal text.
- **Anthropic Claude** — attachment text extraction (`extract-attachment` function;
  `ANTHROPIC_API_KEY` secret).

## Integration points that were cut from Obsy (re-create in the standalone shell)

- Tab entry in `app/(tabs)/_layout.tsx` (+ `TopicsTabIcon`) and
  `<Stack.Screen name="topics">` in `app/_layout.tsx`.
- Capture flows (journal / voice / quick-mood / photo review) rendered
  `TopicSelectionField` and accepted `topicId`/`topicTitle` route params to pre-link an
  entry; saved via tag `topic:<id>` (`topicTagForId`).
- `createSharedLinkEntry` in `captureStore` took a `topicTag` param; the share-save modal
  offered a Today/Topic destination.
- Habits/Goals: `NewHabitGoal.linkedTopicId` picker in `HabitGoalCreateModal`, topic name
  in `HabitGoalDetailsList`. (The `linkedTopicId` / DB `linked_topic_id` fields still
  exist in Obsy's store/table for data compatibility — only the UI was removed.)
- `useSubscription`: `topic_chat` (plus-only) and `topic_pulse` (finite for both tiers)
  feature gates; counts read `user_settings.topic_pulse_count`.
- `'topics'` screen name in `ScreenWrapper` / `AmbientBackground`, `navigation.topics`
  i18n keys (en/ja/tl), and "and topics" wording in app.json permission strings.

## Host-app npm deps the feature needs (beyond a base Expo app)

`react-native-webview` (board), `zustand` (stores), `expo-image-picker` /
`expo-document-picker` (attachments), `@supabase/supabase-js`, `expo-router`,
`react-native-reanimated` + `react-native-gesture-handler` (garden physics, pager),
`expo-linear-gradient`, `@expo/vector-icons`. See the app's `package.json` at the
`feat/remove-topics` branch point for exact versions.

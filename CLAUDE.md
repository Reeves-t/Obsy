# Obsy — working notes for agents

Read this before acting. The warnings in the first section are the kind that are
expensive to learn by doing.

---

## ⚠️ Never do these

### Never run `eas update` to ship a release that adds native code

This project has EAS Update configured (`expo-updates`, `updates.url` in
`Obsy-native/app.json`) with `runtimeVersion: { "policy": "appVersion" }`. Runtime
version is therefore derived from `expo.version`.

At the time of writing `expo.version` is **1.0.0**, which is also the version of
the build on TestFlight. EAS Update uses runtime version to decide which
installed binaries may receive a JS bundle, so it currently treats the shipped
binary as a valid target for whatever is on this branch.

The branch imports `expo-share-intent` — a native module the shipped binary does
not contain — and `ShareIntentProvider` wraps the whole app at the root of
`Obsy-native/app/_layout.tsx`. An OTA push would fail at first render on launch,
for every tester, with no in-app recovery.

**Bumping `expo.version` is the safety mechanism, not a release formality.** It
changes the runtime version and makes old binaries ineligible. Anything adding
native code requires a real build; it can never go out over the air.

Full sequence: [Obsy-native/SHARE_INTENT_SETUP.md](Obsy-native/SHARE_INTENT_SETUP.md).

### Never assume you can build iOS from Windows

`expo prebuild --platform ios` refuses to generate the Xcode project off macOS:

```
⚠️  Skipping generating the iOS native project files.
   Run npx expo prebuild again from macOS or Linux.
```

This is not a missing tool you can install around. On Windows the options are a
Mac or an EAS cloud build. Android prebuild *does* run on Windows and is a
useful way to verify config-plugin wiring.

### Never `git add -A` without checking what it caught

`Obsy-native/.env` holds live Supabase and RevenueCat credentials. It is
gitignored and must stay that way — verify with
`git ls-files --error-unmatch Obsy-native/.env` (should fail) before any push.

---

## Layout

The git root is **nested**: the repository is `Obsy/Obsy`, not the `Obsy` folder
you may have opened.

| Path | What |
| --- | --- |
| `Obsy-native/` | the Expo / React Native app — nearly all work happens here |
| `supabase/` | the single source of truth for migrations and edge functions |
| `topics-package/` | the Topics feature, extracted and unused; not wired into the app |
| `claude design/` | design handoff HTML, reference only |

Note `topics-package/`: Topics was removed from the app. `@/lib/topicStore` and
`@/components/topics` **do not exist**. Code arriving from older branches often
still imports them — strip the dependency rather than stubbing the module.

## Commands

Run from `Obsy-native/`:

```bash
npx jest                # 63 tests, 5 suites — all green
npx tsc --noEmit        # ~30 PRE-EXISTING errors, see below
npx expo start          # also regenerates .expo/types/router.d.ts
```

Migrations, from the repo root:

```bash
npx supabase migration list --linked
npx supabase db push --linked
```

### tsc is not clean, and that is expected

There are roughly 30 long-standing errors — `Capture` not re-exported from
`captureStore`, `MoodGradient.from/to`, expo-file-system API drift in
`services/export.ts`, and similar. **Do not treat them as regressions from your
change.** Check whether the file you touched appears; ignore the rest. To
confirm something is pre-existing, compare the same lines on an earlier commit
rather than assuming.

### Typed routes go stale

`.expo/types/router.d.ts` is generated. After adding a route file, tsc will
report `Type '"/your-route"' is not assignable...` until `expo start` regenerates
it. That is codegen lag, not a code defect — do not "fix" it with `as never`
casts, just regenerate.

## Line endings

The working tree is CRLF (`core.autocrlf=true`, no `.gitattributes`). Branches
authored on Linux — anything from Claude Code on the web — arrive as LF and will
conflict **whole files rather than lines**.

When a merge conflicts an entire file, that is the cause. Redo it with
renormalization:

```bash
git merge --abort
git merge -Xrenormalize <branch>
```

This dissolved 2 of 6 conflicts in the 2026-07-25 social-sharing merge. To see a
diff's real size, `git diff --ignore-cr-at-eol --stat` — one file there reported
335 changed lines but had 3.

## Database

Live project `vsxxlhztgtcgcvzvojdf` (us-east-2). Migration history is in sync as
of 2026-07-25 and `db push` works normally.

Every migration here is written idempotently — `ADD COLUMN IF NOT EXISTS`,
`DROP POLICY IF EXISTS` before `CREATE` — so replaying one is safe. Keep it that
way; some have already been applied by hand and re-run as no-ops.

Docker is not installed on the Windows machine, so `supabase db dump` does not
work there. To check whether a column exists in prod without it:

```bash
curl -s -o /dev/null -w '%{http_code}' \
  "$URL/rest/v1/entries?select=<column>&limit=1" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
# 200 = exists, 400 = missing
```

## Branch state (2026-07-25)

Active branch is `feat/remove-topics`, pushed, well ahead of `main`. It carries
the Topics removal, the Control-style home rework, Unpack, the splash morph, the
habits/goals orb rework, and the whole shared-links social flow.

`main` is the older layout — carousel-and-clock home, Topics present — and is
what the current TestFlight build was made from. Leave it alone unless
deliberately releasing. There are **no GitHub Actions workflows**, so nothing
builds or publishes on push; merging to `main` is inert on its own.

## House style

Comments explain *why*, not *what* — the reasoning that is not recoverable from
reading the code. Match the density of the file you are editing. Several modules
carry a header comment explaining the feature's intent; keep those current when
behaviour changes rather than letting them rot.

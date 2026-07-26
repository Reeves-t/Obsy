# Share Intent — native build runbook

The share-sheet capture flow ([app/share.tsx](app/share.tsx), wired in
[app/\_layout.tsx](app/_layout.tsx)) uses `expo-share-intent`, which ships native
code. **It cannot run in Expo Go** — it needs a custom dev client.

Version pin: `expo-share-intent@5.1.1`. The 5.x line targets Expo SDK 54, which
this app is on (`expo ~54.0.35`, RN 0.81.5). Do not upgrade past 5.x without
also moving the Expo SDK: 6.x targets SDK 55, 7.x targets 56, 8.x targets 57.

---

## Read this first: you cannot build iOS from Windows

Verified 2026-07-25 on the Windows dev machine. `expo prebuild` refuses outright:

```
$ npx expo prebuild --platform ios
⚠️  Skipping generating the iOS native project files.
   Run npx expo prebuild again from macOS or Linux.
```

This is not a missing-tool problem you can install your way out of — Expo will
not generate the Xcode project off a Mac. Two ways forward:

| Path | Where | Notes |
| --- | --- | --- |
| **Local build** | macOS + Xcode | Fastest iteration, free. Steps below. |
| **EAS cloud build** | anywhere | Works from Windows. Needs `eas login`, costs build credits, ~15–25 min. |

Everything JS-only (the inbox, tiles, Log/Delete, the clipboard pill) already
runs on the existing dev client. Only the **OS share sheet** — Obsy appearing in
the share menu inside TikTok/Instagram — needs the rebuild.

---

## On a Mac: the whole sequence

```bash
git clone <repo> && cd Obsy/Obsy-native
npm install

# Generate the native projects. Safe to re-run: ios/ and android/ are
# gitignored build output, never edited by hand.
npx expo prebuild --clean

npx expo run:ios          # or: npx expo run:android
```

Then reinstall the dev client on the device and restart Metro. The share
extension only exists in the newly built binary — a JS reload will not add it.

### If prebuild fails with `Cannot read properties of null (reading 'path')`

Full error: `Config sync failed — withIosXcodeprojBaseMod: Cannot read
properties of null (reading 'path')`. This is a known `xcode`-package bug that
the 5.x README works around with a patch.

**Do not pre-emptively add the workaround.** As of 2026-07-25 the patch file has
been *removed from upstream* (`achorein/expo-share-intent` main has no
`patches/` directory), meaning it was fixed in the dependency chain. Wiring up a
`postinstall: patch-package` hook that points at a patch we do not have would
break every future `npm install`. This project has `xcode@3.0.1` installed,
which is the version the old patch targeted, so the failure is *possible* — just
unconfirmed on SDK 54.

Only if you actually hit that error:

1. `npm install --save-dev patch-package`
2. Add `"postinstall": "patch-package"` to `package.json` scripts
3. Recover `xcode+3.0.1.patch` from a v5-era tag of `achorein/expo-share-intent`
   (it is gone from `main`) into `Obsy-native/patches/`
4. Re-run `npx expo prebuild --clean`

### EAS credentials

Keep exactly **one** extension target during the credentials step. The
`projectId` is pinned in `app.json` and `eas.json` exists, which is what stops
Expo's auto-configuration from injecting a second `appExtensions` entry. A
duplicate entry is tedious to unpick on an app already in review.

Note `eas.json`'s `development` profile is **simulator-only**
(`"ios": { "simulator": true }`) — it produces a build you cannot install on a
phone. Use the `development-device` profile for on-device testing, which is what
share-sheet testing actually requires: you need to share *from* the real TikTok
and Instagram apps.

```bash
npx eas-cli build --profile development-device --platform ios
```

---

## Shipping this to the test-store app — read before you run anything

**Do NOT run `eas update` to ship this version.** It will hard-crash every
install of the current build.

This project has EAS Update configured (`expo-updates`, `updates.url` in
`app.json`) with `runtimeVersion: { "policy": "appVersion" }`. Runtime version
is therefore derived from `expo.version`, which is still **1.0.0** — the same as
the build already on TestFlight. EAS Update uses runtime version to decide which
binaries may receive a JS bundle, so as things stand it considers the old binary
a valid target for the new JS.

That JS imports `expo-share-intent`, a native module the current binary does not
contain, and `ShareIntentProvider` wraps the entire app at the root of
[app/\_layout.tsx](app/_layout.tsx). An OTA delivery would fail at the first
render on launch, for every tester, with no in-app recovery path.

**Bumping `expo.version` is the safety mechanism, not a formality.** It changes
the runtime version, which makes old binaries ineligible for the new bundle.

### The sequence, on a Mac

```bash
git pull
npm install

# 1. Bump expo.version in app.json (e.g. 1.0.0 -> 1.1.0)
#    This is what stops the OTA channel reaching the old binary.
# 2. Bump expo.ios.buildNumber (App Store Connect rejects duplicates).

npx expo prebuild --clean
npx eas-cli build --profile production --platform ios
npx eas-cli submit --profile production --platform ios
```

A **new native build is mandatory** — this release adds native code, so it can
never go out as an over-the-air update no matter how convenient that would be.

### The database is already migrated, and that is fine

The three shared-link migrations were applied to prod on 2026-07-25, ahead of
any app release. The currently installed test-store build keeps working against
the migrated schema:

- the new columns are nullable additions, so an older client simply never
  selects them;
- `entries_mood_required_unless_shared_link` was added `NOT VALID` and only
  forbids a moodless entry that is not a shared link — the old client always
  writes a mood, so every write it makes still passes;
- the new index and storage policies are additive.

So there is no ordering constraint between the app release and the database.
The schema went first, on purpose.

### Merging to `main` on its own changes nothing

There are no GitHub Actions workflows in this repo, so nothing builds,
publishes, or updates on push. The TestFlight binary is a compiled artifact: it
changes when you upload a build, and at no other time. Merging is just git.

---

## Android status

**Config is verified correct; no Android build has ever been produced.**

`expo prebuild --platform android` *does* run on Windows, and was used on
2026-07-25 to confirm the plugin wiring end-to-end. The generated
`AndroidManifest.xml` came out right:

```xml
<activity android:name=".MainActivity" android:launchMode="singleTask" android:exported="true" ...>
  <intent-filter>
    <action android:name="android.intent.action.SEND"/>
    <data android:mimeType="text/*"/>
    <category android:name="android.intent.category.DEFAULT"/>
  </intent-filter>
</activity>
```

All three of the things that matter are present: `launchMode="singleTask"`
(without it, sharing into an already-running app spawns a duplicate activity and
the payload is lost), `exported="true"` (required from Android 12), and the
`SEND` + `text/*` filter.

What is still missing for Android:

- **No local toolchain** on the Windows machine — no Android SDK, no JDK, no
  `adb`. `expo run:android` cannot work there without installing Android Studio.
- **No Play Store submission path** — `eas.json` references
  `./play-store-service-account.json`, which is not in the repo.

So Android is "good" only in the sense that nothing is wired wrong. Building it
still needs either Android Studio locally or an EAS Android build.

---

## What is configured

In `app.json`, under the `expo-share-intent` plugin:

- `NSExtensionActivationSupportsWebURLWithMaxCount: 1` — share a link
- `NSExtensionActivationSupportsWebPageWithMaxCount: 1` — also gives us the page
  title in `shareIntent.meta.title`, which beats guessing from the URL slug
- `NSExtensionActivationSupportsText: true` — payloads that are text containing
  a link ("Title - https://…"), which is how several apps share
- `androidIntentFilters: ["text/*"]` — the Android equivalent

Images and video are deliberately **not** accepted: this flow saves links.

`ios/` and `android/` are gitignored. Do not commit them; regenerate with
`expo prebuild --clean` before each build.

---

## Testing checklist

- Share from TikTok, Instagram (post and reel), X, YouTube, and a browser page.
- Share while the app is backgrounded, and while fully killed — the intent must
  survive a cold start.
- Share the same link twice within an hour: the sheet should say "Already saved"
  rather than creating a second entry.
- Share something with no link in it: the sheet should say so and close cleanly.
- Save a link, leave it unlogged, and confirm it appears in the Home strip with
  the **day it was saved** — then log it and confirm the entry files under that
  original day, not today.

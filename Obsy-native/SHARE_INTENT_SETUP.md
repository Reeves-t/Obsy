# Share Intent — native build setup

The share-sheet capture flow (`app/share.tsx`, wired in `app/_layout.tsx`) uses
`expo-share-intent`, which contains native code. **It cannot run in Expo Go** —
you need a custom dev client.

Version pin: `expo-share-intent@5.1.1`. The 5.x line is the one that targets
Expo SDK 54, which this app is on (`expo ~54.0.35`). Do not upgrade past 5.x
without also moving the Expo SDK: 6.x targets SDK 55, 7.x targets 56, 8.x
targets 57.

## Required before the first native build

`expo prebuild` will fail with `Config sync failed — withIosXcodeprojBaseMod:
Cannot read properties of null (reading 'path')` unless the `xcode` package is
patched. This repo has `xcode@3.0.1` installed, which is the version the
upstream patch targets.

1. Add `patch-package`:
   ```bash
   npm install --save-dev patch-package
   ```
2. Add the postinstall hook to `package.json`:
   ```json
   "scripts": {
     "postinstall": "patch-package"
   }
   ```
3. Copy `patches/xcode+3.0.1.patch` from the upstream example app into a
   `patches/` directory at `Obsy-native/patches/`. It lives in the
   `achorein/expo-share-intent` repository under the basic example's `patches/`
   folder. (It was not vendored here because it could not be fetched from this
   environment — GitHub access is scoped to this repo only. Verify the file
   matches `xcode@3.0.1` before committing it.)

Then:

```bash
npx expo prebuild --no-install --clean
npx expo run:ios      # or run:android
```

Do not commit the generated `ios/` and `android/` folders — rebuild them before
each EAS build.

## EAS builds

Keep exactly **one** extension target during the credentials step. The
`projectId` is already pinned in `app.json` and `eas.json` exists, which is what
stops Expo's auto-configuration from injecting an extra `appExtensions` entry.

## What is configured

In `app.json`, under the `expo-share-intent` plugin:

- `NSExtensionActivationSupportsWebURLWithMaxCount: 1` — share a link
- `NSExtensionActivationSupportsWebPageWithMaxCount: 1` — also gives us the
  page title in `shareIntent.meta.title`, which beats guessing from the URL slug
- `NSExtensionActivationSupportsText: true` — payloads that are text containing
  a link ("Title - https://…"), which is how several apps share
- `androidIntentFilters: ["text/*"]` — the Android equivalent

Images and video are deliberately **not** accepted: this flow saves links.

## Testing checklist

- Share from TikTok, Instagram (post and reel), X, YouTube, and a browser page.
- Share while the app is backgrounded, and while it is fully killed — the intent
  must survive a cold start.
- Share the same link twice within an hour: the sheet should say "Already saved"
  rather than creating a second entry.
- Share something with no link in it: the sheet should say so and close cleanly.

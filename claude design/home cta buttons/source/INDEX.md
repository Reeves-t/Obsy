# Home CTA Buttons Source Bundle

These are reference-only snapshots of the current 4-button home CTA system for Claude Design.

Use them together with:

- `../README.md`

## Start Here

Highest priority files:

- `home-action-carousel.tsx`
- `home-screen.tsx`
- `pulsing-camera-trigger.tsx`
- `animated-mic-button.tsx`
- `animated-journal-button.tsx`
- `quick-mood-button.tsx`

## Supporting Files

- `theme-context.tsx`
  Theme system and color behavior.

- `screen-wrapper.tsx`
  Ambient background shell and safe area behavior.

- `themed-text.tsx`
  Shared text component and baseline typography behavior.

- `colors.ts`
  Shared app color constants.

- `package.json`
  Current Expo / React Native stack and dependencies.

## Notes For Claude

- These files are snapshots for design context, not the live source of truth.
- The live implementation still lives under `Obsy-native/...`.
- This is a React Native / Expo native mobile interaction, not a web carousel.
- The CTA system is constrained by:
  - one active front CTA
  - three orbit positions around it
  - swipe and tap rotation
  - 4 fixed destinations
  - the message / caption below the cluster changing with the currently front CTA
  - integration into the current home hero layout

## Recommended Upload Set

Minimum set:

- `README.md`
- `source/INDEX.md`
- `source/home-action-carousel.tsx`
- `source/pulsing-camera-trigger.tsx`
- `source/animated-mic-button.tsx`
- `source/animated-journal-button.tsx`
- `source/quick-mood-button.tsx`
- `source/home-screen.tsx`

Recommended additional context:

- `source/theme-context.tsx`
- `source/screen-wrapper.tsx`
- `source/themed-text.tsx`
- `source/colors.ts`
- `source/package.json`

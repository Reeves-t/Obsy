# Home CTA Buttons UI Handoff

This folder is the Claude Design handoff for the 4 CTA buttons on the Obsy home screen.

Use this as the source of truth for the current CTA system before proposing UI and UX changes.

## Goal

Redesign the 4 home-screen CTA buttons and their orbit / carousel presentation only.

Keep the existing navigation targets and core interaction model intact unless a visual redesign requires a small structural adjustment.

This is not a feature rewrite. It is a UI and UX redesign of the home CTA system.

## App Context

Obsy is an Expo React Native app using `expo-router`.

This handoff is for a native mobile screen, not a web page.

Claude should design against React Native and Expo constraints so the result can be implemented as a near 1:1 copy in the production app.

Important:

- design for native mobile only
- assume React Native layout and component constraints
- do not rely on web-only patterns or CSS-only behavior
- keep proposals implementable inside the existing `Obsy-native` app

## What Is Being Redesigned

The CTA system on the home screen currently consists of 4 actions:

1. `Capture`
2. `Voice`
3. `Journal`
4. `Quick Mood`

These do not render as a simple grid.

They render inside a rotating orbit / carousel system where:

- one CTA sits in the front as the active, primary action
- two CTAs sit left and right as secondary actions
- one CTA sits above as the smallest, furthest action
- tapping or swiping rotates the system
- the message / caption below updates based on whichever CTA is currently in front

## Tech Stack

From the current implementation:

- Expo `~54.0.33`
- React `19.1.0`
- React Native `0.81.5`
- TypeScript `~5.9.2`
- Expo Router `~6.0.23`
- React Native Reanimated `~4.1.1`
- React Native SVG `15.12.1`
- Expo Linear Gradient `~15.0.8`
- React Native Gesture Handler `~2.28.0`

Shared app context also uses:

- `ScreenWrapper`
- `ThemedText`
- `ThemeContext`
- app-wide ambient backgrounds

## Primary Files

Main CTA system:

- `Obsy-native/components/home/HomeActionCarousel.tsx`

Button implementations:

- `Obsy-native/components/home/PulsingCameraTrigger.tsx`
- `Obsy-native/components/home/AnimatedMicButton.tsx`
- `Obsy-native/components/home/AnimatedJournalButton.tsx`
- `Obsy-native/components/home/QuickMoodButton.tsx`

Home screen usage:

- `Obsy-native/app/(tabs)/index.tsx`

Supporting visual context:

- `Obsy-native/components/ScreenWrapper.tsx`
- `Obsy-native/components/ui/ThemedText.tsx`
- `Obsy-native/contexts/ThemeContext.tsx`
- `Obsy-native/constants/Colors.ts`
- `Obsy-native/package.json`

## Current Structure

The CTA system is mounted inside the home hero section.

The home screen currently places:

- time and date above
- the CTA carousel in the center
- a Moodverse card below

The CTA redesign should work inside that existing home composition.

## Current CTA Order And Defaults

Current action list in code:

1. `voice`
2. `capture`
3. `journal`
4. `quick-mood`

Important:

- the carousel initializes with `activeIndex = 1`
- that means `Capture` is the default front CTA on first load
- the caption also initializes to the `Capture` description

## Current Captions

These are the current CTA descriptions shown below the orbit:

This message below the CTA cluster is part of the CTA system and should be treated as part of the redesign scope, not as unrelated helper text.

The front CTA controls which message is shown underneath the orbit.

- `capture`: `capture a moment that reflects your mood`
- `journal`: `write whatever is on your mind`
- `voice`: `say what's on your mind out loud`
- `quick-mood`: `no words needed, just log the mood`

If the visual redesign changes how captions are shown, these descriptions still matter as content context.

## Current Rotation Model

The carousel uses 4 named orbit slots:

- `front`
- `left`
- `right`
- `top`

Current layout characteristics:

- `front` is the largest, most prominent CTA
- `left` and `right` are smaller side CTAs
- `top` is the smallest / most distant CTA

Current motion behavior:

- tapping the left CTA rotates right
- tapping the right CTA rotates left
- tapping the top CTA also rotates left
- horizontal swipe rotates the orbit
- movement is animated with Reanimated timing

Current animation constants:

- orbit duration: `460ms`
- swipe threshold: `36`

## Current Slot Layout Values

From `HomeActionCarousel.tsx`:

### Front

- hit size: `176`
- opacity: `1`
- scale: `1`
- translateX: `0`
- translateY: `34`
- zIndex: `4`

### Left

- hit size: `112`
- opacity: `0.94`
- scale: `0.45`
- translateX: `-126`
- translateY: `-24`
- zIndex: `3`

### Right

- hit size: `112`
- opacity: `0.94`
- scale: `0.45`
- translateX: `126`
- translateY: `-24`
- zIndex: `3`

### Top

- hit size: `84`
- opacity: `0.72`
- scale: `0.35`
- translateX: `0`
- translateY: `-96`
- zIndex: `1`

These are not necessarily sacred visually, but they define the current orbit feel.

## Current Carousel Shell Metrics

From `HomeActionCarousel.tsx`:

- main button size: `168`
- button ring padding: `8`
- stage size: `176`
- container width: `360`
- container height: `308`

The caption area below the orbit currently uses:

- width: `360`
- max text width: `280`
- min caption height: `48`

## Current Visual Language

All 4 CTAs currently share a common material style:

- metallic outer ring
- dark or dark-glass inner button surface
- glass shine highlight
- subtle inner glint
- icon centered inside circular orb

The front CTA also gets a separate large oval ring behind it:

- rendered via `FrontObsyRing`
- uses an SVG ellipse with a metallic gradient

This is a big part of the current identity of the CTA cluster.

## Current Button Details

### 1. Capture

File:

- `PulsingCameraTrigger.tsx`

Visual treatment:

- larger than the other CTA buttons by default
- dark orb in dark mode
- warm tan orb in light mode
- metallic ring shell
- animated shimmer sweep over the outer ring

Icon:

- `Ionicons` camera icon

Route:

- `/capture`

Current notable behavior:

- shimmer animation repeats
- this is the default active CTA on first load

### 2. Voice

File:

- `AnimatedMicButton.tsx`

Visual treatment:

- dark circular orb
- metallic ring shell
- glass surface highlight

Icon:

- `Ionicons` mic icon

Route:

- `/voice`

### 3. Journal

File:

- `AnimatedJournalButton.tsx`

Visual treatment:

- dark circular orb
- metallic ring shell
- glass surface highlight

Icon:

- custom SVG file/document + pencil style glyph

Route:

- `/journal`

### 4. Quick Mood

File:

- `QuickMoodButton.tsx`

Visual treatment:

- dark circular orb
- metallic ring shell
- glass surface highlight

Icon:

- custom SVG using 3 white ellipses / orb dots

Route:

- `/quick-mood`

## Current Colors

The shared button look currently leans on:

- dark orb base: `#171717`
- metallic ring border: `rgba(180,180,180,0.3)`
- metallic ring gradient: `rgba(200,200,200,0.25)` to `rgba(120,120,120,0.15)` back to `rgba(200,200,200,0.25)`
- border ring: `rgba(255,255,255,0.08)`
- inner glint: `rgba(255,255,255,0.10)`
- glass shine: `rgba(255,255,255,0.14)` to transparent

Capture button in light mode is special:

- orb base becomes `#C2AE8A`

Caption text below the carousel currently uses:

- `rgba(255,255,255,0.58)`

## Current Icon Sources

### Capture

- `Ionicons name="camera"`

### Voice

- `Ionicons name="mic"`

### Journal

- custom `react-native-svg` `Path` drawing

### Quick Mood

- custom `react-native-svg` with `Ellipse` shapes

If Claude redesigns the icon style, it should still understand what each current icon is and where it comes from.

## Current Rotation / Interaction Logic

The orbit is not decorative only. It is interactive.

Current behavior:

- front CTA is pressable and routes to its screen
- side / top CTAs are not directly launching their target when off-center
- instead they act as rotation targets
- after rotation, the newly front CTA becomes the pressable launch target

This interaction model is important.

Claude can redesign how the orbit looks and feels, but should preserve the distinction between:

- rotate to focus
- tap focused CTA to launch

unless explicitly changing the product behavior.

## Theme Compatibility

The home screen sits inside `ScreenWrapper` and uses the shared theme system:

- `dark`
- `light`
- `pack1`

The CTA redesign must work with:

- ambient background behind it
- dark and pack1 themes
- the existing home layout

If Claude introduces new surfaces, they should still feel at home inside Obsy’s ambient background system.

## UI Boundaries

Safe to redesign visually:

- orbit layout styling
- the front / side / top CTA visual hierarchy
- ring treatments
- icon styling
- caption treatment
- CTA scaling and spacing
- carousel depth cues
- swipe and tap affordance styling

Safe to restructure lightly if needed:

- how the caption sits relative to the orbit
- how the 4 CTAs distribute spatially
- whether the orbit feels more radial, stacked, or mechanical

Do not change without explicit product approval:

- the 4 CTA destinations
- the home screen role of these 4 actions
- the fact that there is one primary active CTA
- the swipe / rotate interaction model
- the default front CTA unless intentionally discussed

## UX Constraints To Preserve

- The CTA system should feel intentional and premium.
- It should remain immediately tappable and understandable.
- It should still read as 4 distinct actions, not one ambiguous art object.
- The active CTA should be obvious.
- The system must remain usable on mobile screen sizes.
- The redesign should stay implementable in React Native and Expo.

## If Claude Is Making Code Changes

Primary file:

- `Obsy-native/components/home/HomeActionCarousel.tsx`

Likely supporting files:

- `Obsy-native/components/home/PulsingCameraTrigger.tsx`
- `Obsy-native/components/home/AnimatedMicButton.tsx`
- `Obsy-native/components/home/AnimatedJournalButton.tsx`
- `Obsy-native/components/home/QuickMoodButton.tsx`

Reference only:

- `Obsy-native/app/(tabs)/index.tsx`
- `Obsy-native/components/ScreenWrapper.tsx`
- `Obsy-native/components/ui/ThemedText.tsx`
- `Obsy-native/contexts/ThemeContext.tsx`

## Suggested Design Direction

This CTA cluster should feel like a signature home interaction, not a generic button row.

Good directions:

- stronger depth and hierarchy
- more intentional active / inactive states
- clearer motion language around rotation
- more distinctive identity for each CTA while keeping system cohesion
- better integration with the home ambient background
- a more intentional treatment for the active CTA message below the cluster

Avoid:

- generic app launcher grid
- flat icon row
- web-like carousel styling
- losing the premium mechanical / orbital feel

## Handoff Prompt You Can Paste To Claude

Design a better-looking 4-button CTA system for the Obsy home screen in this Expo React Native app.

This is a native mobile screen inside the `Obsy-native` app, not a web page. Please keep the design implementable as a near 1:1 React Native / Expo build.

Focus on:

- the 4 CTA buttons
- their icons
- their colors and material treatment
- the orbit / rotation behavior
- the active vs inactive hierarchy
- the message / caption treatment below the CTA cluster for the currently front button

Work primarily in:

- `Obsy-native/components/home/HomeActionCarousel.tsx`

And use these supporting files for the actual CTA button visuals:

- `PulsingCameraTrigger.tsx`
- `AnimatedMicButton.tsx`
- `AnimatedJournalButton.tsx`
- `QuickMoodButton.tsx`

Preserve:

- the 4 destinations
- one active front CTA at a time
- swipe / tap rotation behavior
- React Native / Expo constraints
- compatibility with the existing Obsy home screen and ambient background

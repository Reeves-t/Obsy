# Handoff: Orbital Carousel + Fluid Slider

## Overview
A 4-button "orbit" carousel for a home/dashboard screen (Journal, Snapshot, Voice note, Mood). The 4 actions sit on an elliptical orbit behind a clock. A horizontal fluid slider below the orbit drives rotation — drag or flick it and the orbit spins with momentum, snapping whichever button reaches the front into the "active" position. The front button also drives a small looping animation inside the empty center of the ring (scribble lines for Journal, a camera iris for Snapshot, an equalizer for Voice note, floating question bubbles for Mood). Spinning it hard enough triggers a hidden "turbo" easter egg.

**This is the piece to port exactly.** Your own UI shell, colors, copy, and button icons will replace everything else here — the codebase's visual system should override this mock's chrome. What must be preserved faithfully is the **slider/orbit interaction and its physics feel**, the **snap + micro-bounce**, the **glow/particle trail**, and the **center-stage animations + easter egg**.

## About the design file
`Orbital Carousel.dc.html` is an HTML/JS **design reference** — a working prototype built to demonstrate feel, not code to copy-paste into the app. It runs on a small custom template runtime (`support.js`) that won't exist in your app. Reimplement the behavior below natively in **React Native (Expo)** using **Reanimated 2/3** for the animation driver and **react-native-gesture-handler** (`Gesture.Pan()`) for input — that combination is the direct equivalent of the `requestAnimationFrame` + pointer-event loop used in the prototype, and will get you the same 60fps physics feel on-device that CSS/JS cannot reliably give you in RN.

Open the HTML file directly in a browser to see/feel the reference behavior.

## Fidelity
**High-fidelity for interaction and motion. Low-fidelity for visual chrome.** Layout positions, exact colors, fonts, and copy in the mock are placeholders — build those to your existing design system. The physics constants, timing, and state machine described below are the part to match precisely.

## The interaction, in plain terms
- 4 buttons sit at 90° apart on an ellipse. One is always "front" (bottom-center, largest, full opacity) — that's the active/selected action.
- A slider track sits below the orbit. Dragging it left/right rotates the whole orbit. There is no visible "position" on the slider itself relative to buttons — the thumb re-centers to represent nearest-detent offset, and its shape stretches (fluid/liquid) with drag speed.
- Release while moving fast → the orbit keeps spinning and decelerates (momentum/fling), then eases into the nearest 90° detent (spring/snap) with a small overshoot-bounce.
- Release while slow, or a straight tap on a button → springs directly to that button's detent.
- Every settle-to-detent triggers: a micro scale-bounce "pop" on the newly-front button, and a burst of glowing particles at that button's position.
- Whatever button is currently front drives (a) the title/subtext copy below the orbit and (b) a small looping animation inside the empty center of the ring.
- **Easter egg**: if the user keeps spinning fast enough to rack up ~7 full revolutions within a 4-second rolling window, the orbit is yanked into a self-sustaining fast spin ("turbo") for ~3.2–4.1s that decays on its own (no touch needed), while the subtext cycles through witty one-liners. It then eases back to the nearest detent normally.

## Exact physics model (port this precisely)

All angles in radians. `HALF = π/2` (90°, spacing between the 4 buttons). One shared rotation value `theta` (`th`) represents the orbit's rotation; button *i*'s angle = `theta + i*HALF`.

**State machine** — `phase` is one of `idle | drag | fling | spring | turbo`:

- **idle**: no input. Add a tiny ambient sway: `theta_display = theta + sin(now/850) * 0.026` (~1.5°, purely cosmetic, does not affect the real `theta`).
- **drag**: while pointer/touch is down and moving, `theta += -(dx_px) * 0.016` per move event (drag left → rotate one way; the `0.016` rad/px is the sensitivity constant — tune to the real slider's on-screen width, but keep it feeling this direct/1:1-ish). Track a short rolling buffer of `{time, theta}` samples (last ~8) to compute release velocity.
- **on release from drag**: compute `v = (theta_last - theta_first) / (t_last - t_first)` in rad/s from the sample buffer, clamp to `[-14, 14]` rad/s.
  - If `|v| > 1.6`: enter **fling** with that velocity.
  - Else: set `target = nearestDetent(theta + v*0.12)` (nudge target by a bit of residual velocity) and enter **spring**.
- **fling**: `theta += v * dt`; velocity decays exponentially: `v *= exp(-2.6 * dt)`. Each frame, feed `|dtheta|` into the rolling-revolution buffer (see Easter Egg below). When `|v|` decays below `1.6`, switch to **spring** with `target = nearestDetent(theta + v*0.12)`.
- **spring**: critically-damped spring pulling `theta` → `target`.
  - `k = 130` (stiffness), `bounce` = a 0–1 tunable (design default `0.6`), `damping c = 2*sqrt(k) * (1.05 - 0.62*bounce)`.
  - Each frame: `v += (k*(target - theta) - c*v) * dt; theta += v*dt`.
  - Settle when `|target - theta| < 0.004 rad` and `|v| < 0.06`: snap `theta = target`, `v = 0`, `phase = idle`, and fire the **settle event** (pop-bounce + particle burst on the new front button, refresh the title/subtext label).
- `nearestDetent(a) = round(a / HALF) * HALF`.

**Per-frame layout** (drives visual position of all 4 buttons from `theta_display`):
```
for i in 0..3:
  a = theta_display + i*HALF
  x = CX + RX*cos(a)      // ellipse center CX,CY; RX/RY = horizontal/vertical radii
  y = CY + RY*sin(a)
  depth d = (sin(a) + 1) / 2        // 0 = back-most, 1 = front-most
  scale = 0.58 + 1.12*d
  opacity = 0.38 + 0.62*d
  zIndex ∝ d  (front button always on top)
  glow: if d > 0.86, ramp up a soft accent-color box-shadow/blur proportional to (d-0.86)/0.14 — the front button gets an accent-tinted rim-light, everything else is flat dark
```
`FRONT = π/2` is the angle of the "front" slot (bottom-center in this layout — rotate to taste, e.g. right-center for a horizontal-dock layout). The currently-active button index is `round((FRONT - theta) / HALF) mod 4`.

**Tap-to-select**: a tap (movement < 8px, duration < 450ms) on a button hit-tests against each button's current on-screen position/radius; on hit, compute `target = theta + shortest-signed-delta-to(FRONT - i*HALF)` and enter **spring**.

**Slider thumb rendering** (the fluid part):
- Thumb's horizontal position = `0.5 - normalizedOffsetFromNearestDetent` mapped across the track width — i.e. the thumb position always represents *how far into the current 90° segment* the orbit has rotated, wrapping/re-centering every detent, not an absolute position.
- Thumb **squash/stretch**: `scaleX = 1 + min(1.1, |v| * 0.16)`, `scaleY = 1/sqrt(scaleX)` — this is the "liquid" feel; the faster it's moving, the more it elongates horizontally and thins vertically, like a stretched blob, then relaxes to a circle at rest. Implement with Reanimated's `useDerivedValue` off the same velocity used for the physics.

**Glow/particle trail**: on any meaningful rotation delta (drag, fling, or turbo), spawn 2–3 short-lived particles (small circles, additive/lighter blending, accent color, ~0.5–0.9s life, random small outward velocity, shrink+fade) at the front button's position or under the drag point. On settle, spawn a bigger burst (~14 particles). In RN, implement via `react-native-skia` (best for additive blending/glow) or a pooled `Animated` sprite layer if Skia isn't available; keep pool capped (~250 live particles) for perf.

**Micro-bounce ("pop")**: on any button becoming newly-active, animate its scale `1 → 1.16 → 1` over 300ms with an overshoot easing curve (e.g. Reanimated `withSequence(withTiming(1.16, {duration:120, easing: overshoot}), withTiming(1, {duration:180}))`, or a spring with damping ratio ~0.5).

## Easter egg: turbo spin
- Maintain a rolling buffer of `{time, |delta-theta|}` samples over the trailing **4000ms**. Sum them and divide by `2π` to get "revolutions in the last 4s".
- While in **drag** or **fling**, if that revolution count reaches **≥ 7** and turbo isn't already active: enter **turbo**.
  - `velocity = sign(current v) * max(20, |current v| * 1.35)` — punch the spin up.
  - `turboEnd = now + random(3200, 4100)ms`.
  - Immediately swap the title label to a spin glyph (e.g. 🌀) and start cycling the subtext through a witty phrase list every ~0.85s:
    `"having fun are we?", "okay speed demon.", "someone is bored.", "round and round we go.", "dizzy yet?", "the dial appreciates the workout.", "not letting go, huh?", "we see you."`
  - Suppress normal title/subtext updates while turbo is active (the per-button label swap logic should no-op, but the center-stage animation can keep switching as the front button cycles — that's part of the fun).
  - Each frame: `theta += v*dt`; `v *= exp(-0.5*dt)` (slower decay than a normal fling, so it visibly sustains); spawn a small continuous particle trickle.
  - End condition: `now > turboEnd` OR `|v| < 3` → clear turbo, reset the revolution buffer, set `target = nearestDetent(theta)`, enter **spring** as normal, and on settle restore the real button's title/subtext (force a refresh — don't rely on the "only update on active-index change" check, since the index may be unchanged from before turbo started).
  - A new touch-down at any point cancels turbo immediately and returns control to the user (treat like any other interrupt into **drag**).

## Center-stage animations (front-button contextual loop)
A ~130×130 area at the geometric center of the ring (empty space the buttons orbit around) shows a small looping animation matching whichever button is currently front. Swap by toggling visibility (each restarts its loop on becoming visible — that restart-on-reveal is part of the intended feel, don't try to keep them perfectly time-synced across switches):
- **Journal**: 4 short horizontal bars/lines, staggered 0.4s apart, looping ~2.6s: scaleX 0→1 (grow, transform-origin left) while fading in, then scaleX back to 0 while fading out — reads as handwriting being written then erased, continuously.
- **Snapshot (camera)**: a soft glowing accent-color disc (the "lens"), with a darker disc on top whose visible radius (clip-path circle radius, or an Animated mask in RN) oscillates large→small→large every 2.4s ease-in-out — mimics an iris/shutter opening to reveal the lens-glow and closing again.
- **Voice note (mic)**: 5 vertical bars, `scaleY` oscillating between ~0.25 and 1, `transform-origin: bottom`, each bar on a slightly different duration (0.44–0.71s) so they don't move in lockstep — a simple ambient equalizer, no real audio needed.
- **Mood**: 3 small pill-shaped bubbles with short check-in phrases (**not mood names** — questions like "doing okay?", "rough day?", "on top of the world?"), each rising and fading over ~4.6s, staggered ~1.5s apart: fade/scale in low, drift upward while fully opaque, fade out near the top of the area, loop.

## Design tokens used in the reference (replace with your system's equivalents)
- Accent (interactive/glow color): `#4FC3F7` (tweakable in the mock; alt options shown: `#6EE7C8`, `#B79CFF`, `#FF9E7A`)
- Background: dark radial gradient, `#0e1d2a → #081019 → #04070c`
- Button chip: `radial-gradient(36% 30%, rgba(46,72,92,0.85) 0%, rgba(14,22,30,0.95) 70%)`, 1px border `rgba(126,168,188,0.18)`, 64px diameter at base scale
- Orbit ring guide: 246px circle, 1.5px border `rgba(96,156,178,0.28)`
- Title: ~23px / 650 weight. Subtext: ~16px, `#8ba0ac`
- Font stack: `-apple-system, "SF Pro Display", "SF Pro Text", system-ui, sans-serif`

## Tunable parameters (exposed as "Tweaks" in the mock — consider exposing similarly in-app)
- `accent` — glow/thumb/particle color
- `bounce` (0–1, default 0.6) — spring damping softness; higher = more overshoot/bouncier snap
- `trail` (bool, default true) — enable/disable the particle trail
- `sway` (bool, default true) — enable/disable the idle ambient sway

## Files
- `Orbital Carousel.dc.html` — the working reference prototype. Open in any browser. All logic is in the inline `<script>` at the bottom (look for the state machine described above — variable names match this README: `th`/`theta`, `vel`, `phase`, `target`, `rotBuf`, `turboActive`, etc.) so you can read the exact source alongside this doc.

## Not in scope / left to your codebase
- Overall screen layout, navigation, headers, real clock, and the 4 buttons' real icons/copy — the mock's "Journal/Snapshot/Voice note/Mood" labels and subtext are placeholders you already have better copy for.
- The device frame/status bar shown in the mock is just prototyping chrome (an iOS frame wrapper) — ignore it entirely.
- Any backend/data wiring for what each button actually does on tap.

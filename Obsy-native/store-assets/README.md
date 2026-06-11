# Obsy — App Store Screenshot & Icon Production Kit

Owner: UX Designer (OBS-21). Source of truth for captions: OBS-1 Launch Plan §3 (board-approved 2026-06-11).

This folder is the turnkey kit for producing the iOS App Store screenshot set. The raw
screen captures must be taken on a **macOS iOS Simulator** (not possible from the Windows
dev box used for OBS-21), then framed with `caption-frame.html`.

---

## 1. App Icon — STATUS: fixed in this branch

App Store icons **must be 1024×1024 with NO alpha channel**. The shipping config pointed the
iOS icon at `assets/images/obsy.cobalt.still.png`, which is **RGBA (has alpha)** → an App Store
rejection risk.

**Fix applied (OBS-21):** generated `assets/images/obsy.icon.ios.png` — the *same* cobalt brand
still flattened onto opaque black (visually identical, verified) and re-encoded as RGB with no
alpha. `app.json` now sets `ios.icon` to it. Android's adaptive icon (which *may* keep alpha)
and the splash image are untouched.

- ✅ 1024×1024, RGB (colorType 2), no alpha — passes Apple's icon validation.
- ⚠️ Confirm `obsy.cobalt.still` is the intended brand icon (it is the one currently shipping).
  `assets/images/icon.png` is only a gray placeholder/template; `obsy icon final.png` is an
  off-brand magenta variant with heavy padding — **do not** ship either.

---

## 2. Required screenshot sizes (App Store Connect, 2026)

| Class | Device to capture in Simulator | Portrait px | Required? |
|-------|--------------------------------|-------------|-----------|
| 6.9" / 6.7" iPhone | iPhone 16 Pro Max (or 15 Pro Max) | **1290 × 2796** | **Yes — required** |
| 6.5" iPhone | iPhone 11 Pro Max / XS Max | **1242 × 2688** | Plan asks for it (Apple now auto-scales from 6.9", but we ship both) |
| 13" iPad | iPad Pro 13" (M4) | **2064 × 2752** | **Only if `ios.supportsTablet` stays `true`** — see §5 |

Min 3, max 10 screenshots per class. We ship **5** (the approved captions).

---

## 3. Caption → screen mapping (captions are locked; screens are the recommendation)

| # | Approved caption (plan §3) | Screen to capture | Notes |
|---|----------------------------|-------------------|-------|
| 1 | Capture your whole day in one calm canvas. | **Home** (daily canvas: clock + action carousel + ambient mood field) | Use a populated account so the ambient field has color. |
| 2 | Log moods, topics, and reflections in seconds. | **Quick-mood** or the **action carousel** mid-interaction (capture/journal/voice/mood) | Show the calm action ring. |
| 3 | See the patterns emerge — without the noise. | **Insights** → mood flow / patterns | Needs ~1–2 weeks of demo captures so charts are full. |
| 4 | Private by default. Your data stays yours. | **Onboarding** "Private by Default." screen (or a clean privacy still) | Already on-brand calm copy. |
| 5 | Weekly and monthly insights, quietly delivered. | **Insights** → weekly/monthly summary card | Use the weekly or monthly view with a generated summary. |

---

## 4. Export-safe capture checklist (do this before every capture run)

- [ ] Sign in with a **non-dev** account email so the orange dev-portal flask button is hidden
      (`isDevUser` gates it on Home).
- [ ] Seed a **demo account with ~10–20 captures across 1–2 weeks** so Insights/mood-flow/topic
      orbs are populated (NOT the empty states). Sparse data renders gracefully but reads poorly
      in a store shot.
- [ ] App is **dark-themed** — capture in dark to match the brand identity.
- [ ] Clean the status bar in the Simulator:
      `xcrun simctl status_bar booted override --time "9:41" --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3`
- [ ] If the paywall appears, it falls back to static prices ($5.99 / $49.99) when offerings
      don't load — already screenshot-safe; no StoreKit config needed.
- [ ] Capture: `xcrun simctl io booted screenshot screen-<n>.png` (or ⌘S in the Simulator).

---

## 5. Decision needed: iPad / `ios.supportsTablet`

`app.json` currently has `ios.supportsTablet: true`. If it stays true, **iPad 13" screenshots
become required for submission** and the app must pass iPad layout QA. The OBS-1 plan is
**iOS-first / defer breadth**. Recommendation: set `supportsTablet: false` for the v1 MVP
(iPhone-only) to drop the iPad screenshot + QA burden, and revisit iPad post-launch. This is a
build-config call owned by the CTO (OBS-19) + board — raised as an interaction on OBS-21.

---

## 6. Framing the captures

Open `caption-frame.html` in any browser. For each of the 5 captures:
1. Pick the device size (6.9"/6.7", 6.5", or iPad 13").
2. Pick the caption (presets match §3) — or type your own.
3. Load the raw `screen-<n>.png` capture.
4. Download the framed PNG at the exact required pixel size.

The tool renders a calm dark gradient, the caption in a mature sans-serif (no emoji), and the
device screen below — matching Obsy's visual identity. Output is store-ready.

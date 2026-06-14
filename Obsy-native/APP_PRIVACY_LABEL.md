# App Privacy Label — App Store Connect data inventory

**Issue:** OBS-19 (iOS release & monetization readiness) · **Date:** 2026-06-11
**Bundle:** `com.innostudio.obsy` · **ASC App ID:** 6758523822

This is the source-of-truth inventory for the **App Privacy** ("nutrition label")
section in App Store Connect. It maps each data type Obsy handles to Apple's
categories, whether it is **linked to the user's identity**, and whether it is
**used to track** the user across apps/websites (it is not). Fill the ASC form
from the tables below. **Legal/privacy owner should confirm before submission.**

> Summary for ASC: **"Data Linked to You"** = account email, user content
> (journal text, mood, photos, voice audio + transcripts), user ID, purchase
> history. **"Data Not Linked to You"** = usage + diagnostics. **"Data Used to
> Track You"** = **NONE** — no IDFA, no cross-app/website tracking, **no ATT
> prompt required.**

---

## 1. Data collected and how it is used

| Apple category | Specific data | Source in app | Linked to identity? | Used for tracking? | Purpose |
|---|---|---|---|---|---|
| Contact Info → **Email Address** | Account email | Supabase Auth (sign-up/sign-in) | **Yes** | No | App Functionality (account) |
| Identifiers → **User ID** | Supabase user UUID (also the RevenueCat `app_user_id`) | Supabase Auth / RevenueCat `logIn()` | **Yes** | No | App Functionality |
| User Content → **Other User Content** | Journal/entry text, mood selections, voice-note transcripts, tags | `entries` table (note, mood, tags), voice transcription | **Yes** | No | App Functionality (core journaling + AI insights) |
| User Content → **Photos or Videos** | Capture photos + images attached to entries/topics | Camera / photo library → `entries` storage bucket | **Yes** | No | App Functionality |
| User Content → **Audio Data** | Voice-note recordings | Microphone → private `voice-notes` bucket (signed-URL access, OBS-15) | **Yes** | No | App Functionality |
| Purchases → **Purchase History** | Plus subscription purchase/renewal/entitlement state | RevenueCat (`react-native-purchases`) + webhook → `user_settings.subscription_tier` | **Yes** | No | App Functionality (entitlement) + Developer's purchase analytics (RevenueCat) |
| Usage Data → **Product Interaction** | Feature/screen events (no PII) | `lib/analytics` façade | **No** | No | Analytics / App Functionality |
| Diagnostics → **Crash / Performance / Other Diagnostic Data** | Error + performance events (no PII) | `lib/analytics` façade | **No** | No | Analytics |

### Notes / nuances the privacy owner must weigh
- **Mood = potentially "Sensitive Info."** Mood/emotional state is core user
  content. Apple's *Sensitive Info* type can apply to mental-health-adjacent
  data. Recommend declaring mood under **User Content** and having legal confirm
  whether *Sensitive Info* must also be checked. Stored linked to identity.
- **Analytics is inert at MVP launch.** The `lib/analytics` façade's production
  sink is a **no-op** until the real provider (PostHog, EU residency) is
  activated under **OBS-20** (`registerAnalyticsSink()` + project key). It is
  **opt-out (default on)**, sends **no PII**, uses **no advertising identifier**,
  and does **no cross-app tracking** — so it triggers **no ATT prompt**.
  Declaring Usage/Diagnostics now is the safe choice because the app will begin
  collecting it once OBS-20 ships; if you prefer to declare nothing until then,
  you must re-submit the privacy label when analytics is activated.
- **Voice notes & photos are private.** Stored in private Supabase buckets;
  playback is via short-lived signed URLs (OBS-15). Not public, not shared.
- **Third parties that receive data:** Supabase (backend/storage), RevenueCat
  (purchases), the LLM provider(s) used for insights (DeepSeek for digest /
  Claude — see board decisions) receive **entry text / mood** to generate
  insights. Confirm each is reflected in the Privacy Policy and that the LLM
  data-handling is covered. (Per MVP_FEATURE_REMOVALS, the "use photo for
  insight" path was removed, so **photos are not sent to the LLM**.)

## 2. Data NOT used to track you
Obsy does **not** use the IDFA, does **not** share data with data brokers, and
does **not** track users across other companies' apps or websites. In ASC,
select **"Data Not Used to Track You."** No `NSUserTrackingUsageDescription` /
App Tracking Transparency prompt is required (none is in `app.json`).

## 3. Device permission strings (Info.plist — already set in `app.json`)
| Permission | Usage string |
|---|---|
| `NSCameraUsageDescription` | "Obsy uses your camera to capture photos for your entries and topics." |
| `NSMicrophoneUsageDescription` | "Obsy uses your microphone to record voice mood notes." |
| `NSPhotoLibraryUsageDescription` | "Obsy accesses your photo library so you can attach images to your entries and topics." |
| `NSPhotoLibraryAddUsageDescription` | "Obsy saves images to your photo library when you export them." |

## 4. Account deletion (App Store requirement)
Apps offering account creation must offer in-app account deletion. The
`delete-account` Supabase edge function exists (added on this branch). **Verify
it is reachable from in-app settings UI and that it deletes auth + storage + DB
rows** before submission — this is a common review rejection.

---

### Open items for the privacy/legal owner before submission
1. Confirm mood/emotional data classification (User Content vs. also Sensitive Info).
2. Confirm Privacy Policy lists Supabase, RevenueCat, and the LLM provider(s) as processors.
3. Decide analytics declaration timing (declare now vs. re-submit at OBS-20 activation).
4. Confirm in-app account deletion is wired and functional.

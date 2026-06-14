# Analytics (OBS-20)

Privacy-respecting launch-funnel analytics. Call sites use the provider-agnostic
façade in `lib/analytics` and never import a vendor SDK, so the provider can be
activated or swapped without touching instrumentation.

## Events (single source of truth: `events.ts`)

| Event | When | Properties |
|-------|------|-----------|
| `onboarding_started` | onboarding screen mounts (first launch) | – |
| `onboarding_completed` | finishes / skips the onboarding flow | `auth_method` (account/guest) |
| `capture_created` | any entry saved (photo/journal/voice/link) | `type` (photo/text/voice/link), `is_first` |
| `mood_logged` | a mood is attached to an entry (every entry) | – |
| `insight_viewed` | the Insights tab is opened | `period` (daily/weekly/monthly) |
| `paywall_shown` | the Plus paywall is presented | `trigger` (gated feature) |
| `purchase_started` | taps the buy CTA | `plan` (monthly/yearly) |
| `purchase_completed` | RevenueCat reports Plus active | `plan` |
| `purchase_restored` | restore finds an active Plus subscription | – |

**North-Star funnel:** install → `onboarding_completed` → first `capture_created`
→ `insight_viewed` → `purchase_completed`.

## Privacy rules (enforced by convention + the typed event map)

- **No PII** ever leaves the device in an event: no email, display name, note /
  journal text, photo, voice transcript, or other free text. Properties are
  low-cardinality enums / booleans only.
- **Opt-out** (default on). `setAnalyticsEnabled(false)` persists the choice and
  resets the provider identity. `track()` / `identifyUser()` no-op while opted out.
- **No advertising identifier and no cross-app tracking** → no App Tracking
  Transparency prompt required. Declared in the App Privacy label as
  **Usage Data + Diagnostics**, *not linked to identity, not used for tracking*.
- Data residency: PostHog **EU Cloud** (`https://eu.i.posthog.com`) to match the
  privacy policy.

## Activation (final step — needs an EAS build + board PostHog project key)

The façade ships with a no-op/dev-console sink so the funnel is fully wired and
type-checked today, with zero runtime/build dependency on the native SDK. To send
real events:

1. Install the SDK and rebuild (native module → requires an EAS/dev-client build):

   ```sh
   npx expo install posthog-react-native
   ```

2. Register the sink before `initAnalytics()` (e.g. in the analytics initializer
   in `app/_layout.tsx`). Read the **public** project key from app config / env;
   like the RevenueCat public key it is safe to ship in the client:

   ```ts
   import PostHog from 'posthog-react-native';
   import { registerAnalyticsSink } from '@/lib/analytics';

   const apiKey = process.env.EXPO_PUBLIC_POSTHOG_KEY;
   if (apiKey) {
     const ph = new PostHog(apiKey, { host: 'https://eu.i.posthog.com' });
     registerAnalyticsSink({
       capture: (event, properties) => ph.capture(event, properties),
       identify: (distinctId) => ph.identify(distinctId),
       reset: () => ph.reset(),
     });
   }
   ```

> Do not add a literal `import 'posthog-react-native'` to committed code until the
> package is installed — Metro resolves all imported modules at bundle time and an
> unresolved import breaks the build. Keep the snippet above gated behind install.

**Board input required:** a PostHog project (EU region) + public project key, set
as `EXPO_PUBLIC_POSTHOG_KEY`. Confirm the EU host satisfies the data-residency
statement in `PRIVACY_POLICY.md`.

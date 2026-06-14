# Obsy Privacy Policy

**Last Updated:** June 2026

---

## The Short Version

- **Your photos stay on your device by default.** We don't upload or store them unless you turn on cloud backup (Obsy Plus) or send a specific photo for AI analysis.
- **AI features are limited and consent-based.** Text insights use the mood tags and journal notes you write. Photo analysis is Plus-only and opt-in per capture. Voice notes are transcribed by a speech-to-text provider.
- **We don't sell your data.** Ever. No ads, no third-party data sharing for profit, and your content is never used to train AI models.
- **Analytics is privacy-respecting and optional.** We measure anonymous usage to improve the app, with no personal content in any event, and you can opt out.
- **You own your content.** Delete your account and your cloud data goes with it.

---

## What We Collect

### Information You Provide

| Data | Purpose | Storage |
|------|---------|---------|
| **Email & Password** | Account authentication | Cloud (Supabase Auth; passwords are hashed, never stored in plain text) |
| **Display Name** | Account identity | Cloud (Supabase) |
| **Profile Photo** | Optional account avatar | Cloud (Supabase Storage) |
| **Mood Tags** | Core app functionality | Cloud (synced) |
| **Journal Entries / Notes** | Optional notes on captures | Cloud (synced) |
| **Voice Notes** | Optional audio entries | Audio in Supabase Storage; transcript synced |
| **Custom AI Tones** | AI personalization | Cloud (synced) |
| **Shared Links** | Optional saved links | Cloud (synced) |

### Information Stored Locally Only

| Data | Purpose | Storage |
|------|---------|---------|
| **Photos / Captures** | Core app functionality | **Device only** (never uploaded without explicit consent) |
| **Cached Insights** | Offline access | Device only |

### Information Processed Temporarily

| Data | Purpose | Retention |
|------|---------|-----------|
| **Mood tags & journal text** | AI insight generation | Sent to our AI provider to generate an insight, then not retained for any other purpose |
| **Photos (when opted in)** | AI insight generation | Sent only with per-capture consent (Plus); processed and not stored by us |
| **Voice note audio (when recorded)** | Speech-to-text transcription | Sent to our transcription provider to produce a transcript |

### Information Collected Automatically

| Data | Purpose | Notes |
|------|---------|-------|
| **Usage & Diagnostics events** | Understand which features are used and find bugs | Anonymous product analytics — see [Analytics](#analytics). No personal content. |

---

## How We Use Your Data

### Core Functionality
- Authenticate your account and keep you signed in
- Sync your mood tags, journal entries, voice transcripts, and insights across your devices

### AI-Powered Insights
Obsy generates reflective insights and digests from your captures. AI requests are made **server-side** through a secure Supabase Edge Function so that provider API keys are never exposed in the app.

- **Text-based insights** (mood tags, journal snippets) are processed to generate daily, weekly, and monthly summaries. These are generated using third-party large-language-model providers — currently **DeepSeek** and **Anthropic (Claude)**.
- **Photo-based insights** are **Plus-only and opt-in per capture.** You must explicitly enable "use this photo for insight" on a given capture. If you don't, the AI never receives your photo.
- **Voice notes** you record are sent to **OpenAI's Whisper** speech-to-text service to produce a transcript. The transcript is then treated like any other journal text.

### What We Never Do
- ❌ Sell your data to advertisers or third parties
- ❌ Use your photos, journals, or voice notes to train AI models
- ❌ Display ads based on your content
- ❌ Send your photos to AI without explicit, per-capture consent
- ❌ Attach personal content to analytics events

---

## Data Storage & Security

### Cloud Provider
We use **Supabase** (PostgreSQL on AWS infrastructure) for authentication, database, file storage, and our server-side functions.

- Data encrypted in transit (TLS)
- Data encrypted at rest
- Row-Level Security restricts every row to its owning account

### Local Storage
Photos and captures are stored locally on your device using your operating system's secure storage APIs.

### Plus Cloud Backup
Obsy Plus subscribers may opt into cloud backup for photos. This is fully optional, encrypted in transit and at rest, and deletable at any time.

---

## Subscriptions & Payments

Obsy Plus is an auto-renewable subscription sold through the **Apple App Store**. We use **RevenueCat** to manage subscription state and entitlements.

- Your payment is processed by **Apple** and charged to your Apple ID. **We never see or store your card or payment details.**
- RevenueCat receives the App Store transaction and a pseudonymous app-user identifier so we can grant Plus access. It does not receive your card details.
- You can manage or cancel your subscription anytime in your device's App Store subscription settings.

---

## Analytics

We use **PostHog** (EU data residency) for privacy-respecting product analytics, classified in our App Store privacy label as **Usage Data** and **Diagnostics**.

- Events capture **anonymous usage only** — e.g. that an insight was viewed or a capture was created. **No personal content** (photos, journal text, voice transcripts, email, or name) is ever included.
- We do **not** use an advertising identifier and do **not** track you across other companies' apps or websites, so Obsy does not show an App Tracking Transparency prompt.
- You can **opt out** of analytics at any time; opting out stops event collection on your device.

---

## Third-Party Service Providers

We share the minimum data necessary with the following sub-processors:

| Service | Purpose | Data Shared | Region |
|---------|---------|-------------|--------|
| **Supabase** | Authentication, database, storage, server functions | Account info and your synced content | United States |
| **DeepSeek** | AI text-insight generation | Mood tags and journal snippets (no account identifiers) | China |
| **Anthropic (Claude)** | AI text-insight generation | Mood tags and journal snippets (no account identifiers) | United States |
| **OpenAI** | Voice-note transcription (Whisper) | Voice-note audio you record | United States |
| **RevenueCat** | Subscription management | App Store transaction + pseudonymous user id | United States |
| **Apple App Store** | Payment processing & subscriptions | Payment handled entirely by Apple | Per Apple |
| **Expo (EAS)** | App delivery, over-the-air updates, crash diagnostics | Device/crash diagnostics, update delivery | United States |
| **PostHog** | Product analytics | Anonymous usage/diagnostic events (no personal content) | European Union |

We do not share your data with any other third parties.

---

## International Data Transfers

Obsy is operated from the United States and works with providers located in the
United States, the European Union, and — for AI text-insight generation via
DeepSeek — **China**. Where your data is processed outside your country, it may be
subject to the laws of those jurisdictions. We only send providers the minimum
data needed to deliver the relevant feature, and never your account identifiers
with AI-insight text. If you prefer not to have journal text processed by an
overseas AI provider, you can avoid generating AI insights.

---

## Your Rights

### Access & Export
You can export your data at any time from the app settings.

### Deletion
You can delete your account at any time from settings. This permanently:
- Removes your account and synced data from our cloud servers
- Revokes your active sessions

Local data on your device remains until you uninstall the app.

### Analytics Opt-Out
You can disable analytics at any time in the app, which stops collection on your device.

---

## Children's Privacy

Obsy is not intended for users under 13 years of age. We do not knowingly collect data from children under 13. If you believe a child has provided us with personal information, please contact us so we can remove it.

---

## Changes to This Policy

We may update this policy as Obsy evolves. When we make significant changes:
- We'll update the "Last Updated" date
- We'll notify you in-app before changes take effect
- Continued use after notice constitutes acceptance

---

## Contact Us

Questions about your privacy? Concerns about your data?

**Email:** privacy@obsy.app
**Support:** support@obsy.app

---

## Summary

| Question | Answer |
|----------|--------|
| Do you store my photos? | **No** — local only, unless you opt into Plus cloud backup. |
| Does AI see my photos? | **Only if you enable it** per capture (Plus). |
| Who processes my journal text for insights? | DeepSeek and Anthropic (Claude), server-side, without your account id. |
| Who transcribes my voice notes? | OpenAI (Whisper). |
| Who handles payments? | Apple (App Store); RevenueCat manages your subscription. We never see your card. |
| Do you sell my data or run ads? | **Never.** |
| Can I opt out of analytics? | **Yes**, anytime. |
| Can I delete everything? | **Yes** — account deletion removes all cloud data. |

---

*Obsy is built on the belief that reflection is personal. Your thoughts, your photos, your data. They stay yours.*

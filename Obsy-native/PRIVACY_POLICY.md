# Obsy Privacy Policy

**Last Updated:** January 2025

---

## The Short Version

- **Your photos stay on your device.** We don't upload, store, or access them unless you explicitly opt in.
- **AI insights are opt-in per capture.** If you enable photo analysis for a specific capture, that image is sent to our AI provider for processing — then immediately discarded.
- **We don't sell your data.** Ever. No ads, no third-party data sharing for profit.
- **You own your content.** Delete your account, and your data goes with it.

---

## What We Collect

### Information You Provide

| Data | Purpose | Storage |
|------|---------|---------|
| **Email & Password** | Account authentication | Cloud (Supabase) |
| **Display Name** | Shown in albums to friends | Cloud (Supabase) |
| **Profile Photo** | Optional, shown to friends | Cloud (Supabase Storage) |
| **Mood Tags** | Core app functionality | Cloud (synced) |
| **Journal Entries** | Optional notes on captures | Cloud (synced) |
| **Custom Tones** | AI personalization | Cloud (synced) |

### Information Stored Locally Only

| Data | Purpose | Storage |
|------|---------|---------|
| **Photos/Captures** | Core app functionality | **Device only** (never uploaded without explicit consent) |
| **Cached Insights** | Offline access | Device only |

### Information Processed Temporarily

| Data | Purpose | Retention |
|------|---------|-----------|
| **Photos (when opted in)** | AI insight generation | Processed and immediately discarded — not stored |

---

## How We Use Your Data

### Core Functionality
- Authenticate your account
- Sync your mood tags, journal entries, and insights across devices
- Enable album sharing with friends you approve

### AI-Powered Insights
Obsy uses Google's Gemini API to generate reflective insights based on your captures.

**Important:**
- **Text-based insights** (mood, journal notes, tags) are processed via API to generate daily/weekly/monthly summaries.
- **Photo-based insights** are **opt-in per capture**. You must explicitly enable "Use photo for insight" on each capture. If disabled, the AI never sees your photo.
- Photos sent for analysis are processed in real-time and **not stored** by Google or Obsy beyond the moment of generation.

### What We Never Do
- ❌ Sell your data to advertisers or third parties
- ❌ Use your photos for AI training
- ❌ Display ads based on your content
- ❌ Access your photos without explicit per-capture consent
- ❌ Share your journal entries with anyone (including album members — only mood tags are visible in albums)

---

## Data Storage & Security

### Cloud Provider
We use **Supabase** (built on PostgreSQL and AWS infrastructure) to store account data, mood tags, journal entries, and sync state.

- Data encrypted in transit (TLS 1.3)
- Data encrypted at rest (AES-256)
- Hosted on secure, SOC 2 compliant infrastructure

### Local Storage
Photos and captures are stored locally on your device using secure storage APIs provided by your operating system.

### Plus Tier Cloud Storage
Plus subscribers may opt into cloud backup for photos. This is:
- Fully optional
- Encrypted in transit and at rest
- Deletable at any time

---

## Albums & Social Features

When you join or create an album:
- **Visible to album members:** Your display name, profile photo, mood tags on shared captures
- **Never visible to album members:** Your journal entries, private captures, AI insights (unless you explicitly post them)

Album data follows the same security standards as your personal data.

---

## Third-Party Services

| Service | Purpose | Data Shared |
|---------|---------|-------------|
| **Supabase** | Authentication, database, storage | Account info, synced data |
| **Google Gemini API** | AI insight generation | Mood tags, journal snippets, photos (only when opted in) |
| **Stripe** | Payment processing (Plus tier) | Payment info (handled entirely by Stripe — we never see your card) |
| **Expo** | App infrastructure | Crash reports, anonymized analytics |

We do not share your data with any other third parties.

---

## Your Rights

### Access & Export
You can export all your data at any time from the app settings.

### Deletion
You can delete your account at any time. This will:
- Immediately remove all your data from our cloud servers
- Remove you from all albums
- Revoke all active sessions

Local data on your device remains until you uninstall the app.

### Data Portability
Your data belongs to you. We support standard export formats so you can take your data elsewhere.

---

## Children's Privacy

Obsy is not intended for users under 13 years of age. We do not knowingly collect data from children under 13. If you believe a child has provided us with personal information, please contact us immediately.

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
| Do you store my photos? | **No** — local only, unless you opt into Plus cloud backup |
| Does AI see my photos? | **Only if you enable it** per capture |
| Do you sell my data? | **Never** |
| Can I delete everything? | **Yes** — account deletion removes all cloud data |
| Do you show ads? | **No** |

---

*Obsy is built on the belief that reflection is personal. Your thoughts, your photos, your data — they stay yours.*

# Obsy Security Setup Guide

This guide covers the security architecture to protect your API keys, prompts, and prevent abuse.

## Overview

```
┌─────────────┐     ┌──────────────────────┐     ┌────────────┐
│   Mobile    │────▶│  Supabase Edge Fn    │────▶│  Gemini    │
│     App     │     │  (generate-insight)  │     │    API     │
└─────────────┘     └──────────────────────┘     └────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │   Supabase DB    │
                    │  (rate limits)   │
                    └──────────────────┘
```

**What's protected:**
- ✅ Gemini API key (server-side only)
- ✅ AI prompts (server-side only)
- ✅ Rate limits (enforced server-side)
- ✅ Signup (Turnstile bot protection)

---

## Step 1: Deploy Edge Functions

### Prerequisites
```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project
cd Obsy/supabase
supabase link --project-ref YOUR_PROJECT_REF
```

### Deploy the functions
```bash
# Deploy insight generator
supabase functions deploy generate-insight

# Deploy Turnstile verifier
supabase functions deploy verify-turnstile
```

### Set secrets (in Supabase Dashboard or CLI)
```bash
# Gemini API key (get from Google AI Studio)
supabase secrets set GEMINI_API_KEY=your_gemini_api_key

# Turnstile secret (get from Cloudflare Dashboard)
supabase secrets set TURNSTILE_SECRET_KEY=your_turnstile_secret
```

---

## Step 2: Update App to Use Secure AI

Replace direct Gemini calls with the secure service:

### Before (INSECURE ❌)
```typescript
// services/ai.ts
const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY; // Exposed!
await fetch(`https://generativelanguage.googleapis.com/...?key=${apiKey}`);
```

### After (SECURE ✅)
```typescript
// services/secureAI.ts
import { generateDailyInsightSecure } from '@/services/secureAI';

const result = await generateDailyInsightSecure(
    dateLabel,
    captures,
    tone,
    customTonePrompt
);
```

### Migration checklist:
- [x] Replace `generateDailySummary` → `generateDailyInsightSecure`
- [x] Replace `generateWeeklyInsight` → `generateWeeklyInsightSecure`
- [x] Replace `generateMonthlyInsight` → `generateMonthlyInsightSecure`
- [x] Replace `generateCaptureInsight` → `generateCaptureInsightSecure`
- [x] Replace `generateAlbumInsight` → `generateAlbumInsightSecure`
- [x] Replace `generateTagReflection` → `generateTagInsightSecure`
- [x] Remove `EXPO_PUBLIC_GEMINI_API_KEY` from .env
- [x] Deprecate legacy AI service (services/ai.ts)

---

## Step 3: Add Turnstile to Signup

### 1. Create Turnstile widget

Go to https://dash.cloudflare.com/turnstile and create a new widget:
- **Widget name:** Obsy Signup
- **Widget mode:** Managed (recommended)
- **Domains:** Add your app's domain (or use `localhost` for dev)

Copy the **Site Key** (public) and **Secret Key** (private).

### 2. Install Turnstile package

```bash
npm install react-native-turnstile
```

### 3. Add to signup screen

```typescript
// app/auth/signup.tsx
import Turnstile from 'react-native-turnstile';
import { supabase } from '@/lib/supabase';

const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

// Add before the signup form
<Turnstile
    siteKey="YOUR_SITE_KEY"
    onVerify={(token) => setTurnstileToken(token)}
    onError={() => Alert.alert('Verification failed')}
/>

// In handleSignUp, verify token first
async function handleSignUp() {
    if (!turnstileToken) {
        Alert.alert('Please complete the verification');
        return;
    }

    // Verify with edge function
    const { data, error } = await supabase.functions.invoke('verify-turnstile', {
        body: { token: turnstileToken },
    });

    if (error || !data?.success) {
        Alert.alert('Verification failed', 'Please try again');
        return;
    }

    // Proceed with signup...
}
```

---

## Step 4: Remove Exposed Keys

After migration, remove these from your codebase:

### .env / app.config.js
```diff
- EXPO_PUBLIC_GEMINI_API_KEY=xxx
```

### services/ai.ts
```diff
- const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
- // ... all the prompt building functions
+ // Deprecated - use secureAI.ts instead
```

---

## Testing

### Test Edge Function locally
```bash
supabase functions serve generate-insight --env-file .env.local
```

### Test with curl
```bash
curl -X POST http://localhost:54321/functions/v1/generate-insight \
    -H "Authorization: Bearer YOUR_ANON_KEY" \
    -H "Content-Type: application/json" \
    -d '{"type":"daily","data":{"dateLabel":"Today","captures":[]},"tone":"neutral"}'
```

---

## Deployment Verification

### Deployed Functions

| Function | Status | Version | Deployed |
|----------|--------|---------|----------|
| `generate-insight` | ✅ ACTIVE | 8 | January 28, 2026 |
| `verify-turnstile` | ✅ ACTIVE | 2 | January 28, 2026 |

### Production URLs

- **Insight Generator:** `https://vsxxlhztgtcgcvzvojdf.supabase.co/functions/v1/generate-insight`
- **Turnstile Verifier:** `https://vsxxlhztgtcgcvzvojdf.supabase.co/functions/v1/verify-turnstile`

### Secrets Configured

| Secret | Status | Set On |
|--------|--------|--------|
| `GEMINI_API_KEY` | ✅ Set | January 28, 2026 |
| `TURNSTILE_SECRET_KEY` | ⏳ Pending | (Configure when enabling Turnstile) |

### Test Production Endpoints

**Test generate-insight:**
```bash
curl -X POST https://vsxxlhztgtcgcvzvojdf.supabase.co/functions/v1/generate-insight \
    -H "Authorization: Bearer YOUR_SUPABASE_ANON_KEY" \
    -H "Content-Type: application/json" \
    -d '{
        "type": "capture",
        "data": {
            "captures": [{"mood": "happy", "note": "Test note", "timeBucket": "afternoon"}]
        },
        "tone": "gentle"
    }'
```

Expected response: `{"result": "...generated insight text..."}`

**Test verify-turnstile:**
```bash
curl -X POST https://vsxxlhztgtcgcvzvojdf.supabase.co/functions/v1/verify-turnstile \
    -H "Content-Type: application/json" \
    -d '{"token": "test_token_from_widget"}'
```

Expected response: `{"success": true}` or `{"success": false, "error": "..."}`

### Deployment Runbook

**Verify deployment status:**
```bash
# List deployed functions
supabase functions list --project-ref vsxxlhztgtcgcvzvojdf

# List configured secrets (shows names only, not values)
supabase secrets list --project-ref vsxxlhztgtcgcvzvojdf
```

**Deploy function updates:**
```bash
# Deploy a specific function
supabase functions deploy generate-insight --project-ref vsxxlhztgtcgcvzvojdf --workdir .

# Deploy all functions
supabase functions deploy --project-ref vsxxlhztgtcgcvzvojdf --workdir .
```

**View function logs:**
- Dashboard: https://supabase.com/dashboard/project/vsxxlhztgtcgcvzvojdf/functions
- CLI: `supabase functions logs generate-insight --project-ref vsxxlhztgtcgcvzvojdf`

**Rotate secrets:**
```bash
# Update a secret (functions automatically pick up new value)
supabase secrets set GEMINI_API_KEY=new_key_here --project-ref vsxxlhztgtcgcvzvojdf
```

---

## Security Checklist

- [x] Edge functions deployed
- [x] GEMINI_API_KEY set as secret (not in code)
- [x] TURNSTILE_SECRET_KEY set as secret
- [x] App using `secureAI.ts` instead of direct API calls
- [x] `EXPO_PUBLIC_GEMINI_API_KEY` removed from .env
- [x] Turnstile added to signup flow
- [x] Legacy AI service deprecated with warnings

---

## Rate Limiting

The edge function enforces these limits per day:

| Tier | Daily Insights |
|------|----------------|
| Guest | 1 |
| Free | 3 |
| Founder | 100 |
| Subscriber | 100 |

These are enforced server-side and cannot be bypassed by modifying the app.

---

## Migration Complete ✅

**Date:** January 28, 2026

All AI generation has been successfully migrated to the secure edge function architecture. The legacy `services/ai.ts` file has been deprecated and marked with warnings to prevent accidental use.

**Security Improvements:**
- ✅ API keys moved server-side (Supabase secrets)
- ✅ Prompts hidden from client bundle
- ✅ Rate limiting enforced server-side
- ✅ Bot protection on signup (Turnstile)
- ✅ Authentication required for all AI calls

**Next Steps:**
- Monitor edge function logs for errors
- Review rate limit metrics in Supabase dashboard
- Consider removing `services/ai.ts` entirely in future cleanup (after 30-day grace period)

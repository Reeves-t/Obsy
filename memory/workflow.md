# Obsy Development Workflow

## Team Roles

| Agent | Role | Git Access | Supabase Access |
|-------|------|------------|-----------------|
| **Tek** (Clawdbot) | CTO, architecture, planning, code review | ✅ Yes | ❌ No |
| **Traycer** | Planning, mapping, strategy | ❌ No | ❌ No |
| **Augie** (Augment) | Direct code changes, commits, DB work | ✅ Yes | ✅ Yes |

## Workflow

1. **Tek** analyzes the codebase, creates plans, writes code drafts
2. **Traycer** maps out tasks and strategies
3. **Augie** executes: commits code, deploys Edge Functions, modifies DB

## Handoff Pattern

When Tek creates changes, Reeves pastes a summary prompt to Augie for commit/deploy.

---

## Security Migration - COMPLETED ✅

**Date:** 2026-01-28

### Deployed Edge Functions
- `generate-insight` (v8, ACTIVE) — Secure Gemini proxy
- `verify-turnstile` (v2, ACTIVE) — Bot protection (ready, not enabled)

### Production URLs
- https://vsxxlhztgtcgcvzvojdf.supabase.co/functions/v1/generate-insight
- https://vsxxlhztgtcgcvzvojdf.supabase.co/functions/v1/verify-turnstile

### Security Status
- ✅ GEMINI_API_KEY moved to Supabase secrets
- ✅ EXPO_PUBLIC_GEMINI_API_KEY removed from .env
- ✅ Legacy ai.ts deprecated (throws if called)
- ✅ Rate limiting enforced server-side for ALL tiers
- ✅ Prompts hidden from client bundle
- ⏸️ Turnstile integrated but commented out (enable when needed)

---

*Last updated: 2026-01-28*

# AI Routing

The shared AI layer routes requests through Claude first and Gemini second.

## Required secrets
- `ANTHROPIC_API_KEY`: primary provider
- `GEMINI_API_KEY`: fallback provider
- `SUPABASE_SERVICE_ROLE_KEY`: required for `public.ai_provider_runs` logging

## Optional secrets
- `AI_CLAUDE_MODEL`
- `AI_GEMINI_MODEL`

## Current rollout
- `generate-insight` now uses the shared router.
- `generate-daily-insight` now uses the shared router.
- `generate-weekly-insight` now uses the shared router.
- `generate-monthly-insight` now uses the shared router.
- `generate-mood-color` now uses the shared router.
- `generate-observed-patterns` now uses the shared router.
- `moodverse-explain` already uses Claude directly.
- Each provider attempt is logged to `public.ai_provider_runs`.
- If Claude returns an invalid response for the expected format, Gemini is tried automatically.

# Supabase Edge Functions – Environment Variables

The following environment variables are required by the `generate-insight` edge function.

## Automatically available in Supabase Edge Functions
- `SUPABASE_URL` – Provided by the platform.
- `SUPABASE_ANON_KEY` – Provided by the platform.

> No manual configuration is needed for these in deployed edge functions.

## Must be configured
- `GEMINI_API_KEY` – Required for AI generation.

Set via Supabase CLI or Dashboard:
```bash
supabase secrets set GEMINI_API_KEY=your_key
```

## Local development
- Create `supabase/functions/.env` with:
  ```
  GEMINI_API_KEY=your_key
  ```
- `.gitignore` already excludes `supabase/functions/.env` to prevent committing secrets.

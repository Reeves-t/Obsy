# Obsy demo seed — App Store screenshots (INN-3)

A repeatable, **non-PII** demo dataset so App Store / TestFlight screenshots look
polished: a realistic timeline, entries with photos, varied moods, insight cards,
and a **Plus-unlocked** account.

Everything is scoped to **one demo user**. Re-running the seed wipes that user's
prior demo rows and re-inserts, so it's safe to run repeatedly. It never touches
other users' data.

```
supabase/demo_seed/
├── seed.sql               # idempotent seed, parameterized by one user_id
├── reset.sql              # remove all demo rows, return account to 'free'
├── upload_demo_photos.sh  # push entry photos into the private `entries` bucket
├── photos/                # demo bitmaps (placeholders — swap for CC0 if desired)
│   ├── demo_morning.jpg
│   ├── demo_harbour.jpg
│   └── demo_dinner.jpg
└── README.md
```

---

## Prerequisites (board-held — see "What the Launch Director must provide")

1. **A demo account** in the prod Supabase project (`vsxxlhztgtcgcvzvojdf`):
   - Sign up in the app (or create via Supabase Auth) with a clearly-synthetic
     address, e.g. `demo@obsy.app`. This is the account you'll screenshot on.
   - Grab its **user uuid** (`auth.users.id`) → this is `DEMO_USER_ID` below.
2. **A Postgres connection string** for that project (`OBSY_DB_URL`) — used by
   `psql`. (Supabase dashboard → Project Settings → Database → Connection string.)
3. **The service role key** (`SUPABASE_SERVICE_ROLE_KEY`) — used only by the photo
   uploader (the `entries` bucket is private + RLS-scoped). **Never commit it.**

> Why these can't be self-served: `subscription_tier='plus'` is server-write-only
> (guard trigger `enforce_subscription_tier_server_only`, migration
> `20260610000002`), and the `entries` bucket is private. Both require service-role
> / direct-DB access that only the board holds.

---

## Run it (3 commands)

```bash
cd supabase/demo_seed

export OBSY_DB_URL="postgresql://postgres:<pw>@<host>:5432/postgres"
export SUPABASE_URL="https://vsxxlhztgtcgcvzvojdf.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service role key>"
export DEMO_USER_ID="<demo user uuid>"

# 1) seed the data (pass the bare uuid; the script quotes it internally)
psql "$OBSY_DB_URL" -v demo_user="$DEMO_USER_ID" -f seed.sql

# 2) upload the entry photos into the private bucket
./upload_demo_photos.sh

# 3) on the device/build: sign in as the demo account and pull to refresh
```

The seed prints verification queries at the end; you can also run:

```sql
select subscription_tier, is_premium from public.user_settings where user_id = '<DEMO_USER_ID>';
select count(*) entries, count(photo_path) with_photos from public.entries where user_id = '<DEMO_USER_ID>';
```

Expect `plus` / `t`, 14 entries, 3 with photos.

### Reset (back to a clean free account)

```bash
psql "$OBSY_DB_URL" -v demo_user="$DEMO_USER_ID" -f reset.sql
./upload_demo_photos.sh --delete   # also remove the demo photos
```

---

## Screen coverage

| Screenshot target            | Source                              | Seeded here?              |
|------------------------------|-------------------------------------|---------------------------|
| Home / timeline              | `entries`                           | ✅ 14 entries, ~12 days   |
| Entry with photo             | `entries.photo_path` + `entries` bucket | ✅ 3 photo entries     |
| Mood views (gallery / orbs)  | `entries.mood` + `moods` (custom)   | ✅ varied + 2 custom moods|
| Insights (cards)             | `daily_insights`                    | ✅ 3 narrative cards      |
| Patterns noticed             | `observed_patterns`                 | ✅ 1 row                  |
| Recommendations              | `recommendations`                   | ✅ 3 suggestions          |
| **Plus features unlocked**   | `user_settings.subscription_tier`   | ✅ set to `plus`          |

### Generated on device / not seeded by SQL (by design)

These are **derived from the seeded entries** or stored client-side, so seeding
the entries above is enough — open the relevant screen on the build and they
populate (some regenerate via edge functions on first view):

- **Daily mood flow, monthly summaries, year-in-pixels** — the client stores
  (`captureStore` / `monthlyInsightStore` / `yearInPixelsStore`) compute and upsert
  these from entries. Their `jsonb` shapes are owned by the app; hand-seeding them
  risks drift, so we let the app build them.
- **Topics** — persisted in **AsyncStorage on the device**, not in Postgres. To
  show topic views, add a couple of topics in-app on the demo device once.
- **Live "Today" / weekly / monthly AI insight** — regenerate on device from the
  seeded entries (Plus is unlocked, so generation isn't gated).

---

## Notes & safety

- **No real user data.** All notes/insights are clearly synthetic and contain no
  PII. The demo email should be an obvious throwaway (`demo@obsy.app`).
- **Photos** in `photos/` are abstract placeholders generated from app art. For
  more lifestyle-looking shots, replace them (same filenames) with CC0 / Unsplash-
  license images before running the uploader.
- **Idempotent.** `seed.sql` deletes the demo user's prior rows before inserting,
  so re-running gives the same clean result.
- **Scoped.** Every statement filters by the single `DEMO_USER_ID`. It will not
  affect any other account.
- Coordinate timing with the **build/verification issue** so the demo account is
  seeded on the same dev/native build used for screenshots.

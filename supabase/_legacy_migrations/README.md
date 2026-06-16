# Supabase Migrations

This directory contains SQL migrations for the Obsy database schema.

## Migration Application Instructions

Migrations must be applied to your Supabase instance in chronological order. There are two ways to apply them:

### Option 1: Supabase CLI (Recommended)

```bash
# Push all migrations to your linked Supabase project
supabase db push
```

### Option 2: Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy the contents of each migration file
4. Run them in chronological order

## Schema Cache Reload (Fixing PGRST205 Error)

After applying migrations, you may encounter the error:
```
pgrst205: could not find the table [table_name] in the schema cache
```

This occurs because PostgREST caches the database schema. To fix it:

1. Open the SQL Editor in Supabase Dashboard
2. Run: `NOTIFY pgrst, 'reload schema';`

Alternatively, you can restart the PostgREST service from the dashboard.

## Migration Order

Apply migrations in this exact order:

| Order | File | Description |
|-------|------|-------------|
| 1 | `20251201_create_base_schema.sql` | Base tables (profiles, entries, user_settings) |
| 2 | `20251203_fix_rls_recursion.sql` | Helper functions for RLS |
| 3 | `20251203_album_insights.sql` | Albums system tables |
| 4 | `20251204_fix_album_storage_access.sql` | Storage policies for album photos |
| 5 | `20251204_insights_archive.sql` | Insights archive functionality |
| 6 | `20251205_fix_album_creator_membership.sql` | Album creator membership fix |
| 7 | `20251205_friends_table.sql` | Friends table and policies |
| 8 | `20251205_add_friend_code.sql` | Friend code generation |
| 9 | `20251206_friends_album_integration.sql` | Friends + Albums integration |
| 10 | `20260107_custom_ai_tones.sql` | Custom AI tones for personalized reflections |
| 11 | `20260126_update_entries_mood_fields.sql` | Add mood_id and mood_name_snapshot to entries |
| 12 | `20260127_create_moods_table.sql` | Centralized moods table (system + custom moods) |
| 13 | `20260128_ensure_mood_data_integrity.sql` | Backfill snapshots, add constraints, validation trigger |
| 14 | `20260128_handle_orphaned_moods.sql` | Fix orphaned mood references |
| 15 | `20260119_archive_tags_saved_at.sql` | Add tags array and saved_at timestamp to insights_archive |
| 16 | `20260120_archive_recycle_bin.sql` | Add deleted_at for soft delete/recycle bin support |

## Schema Overview

### Core Tables

- **profiles** - User profile data (name, avatar, friend_code)
- **entries** - User captures/photos with mood, notes, and AI summaries
- **user_settings** - Per-user preferences and premium status
- **daily_insights** - AI-generated daily narratives
- **moods** - System and custom moods (single source of truth for mood data)

### Friends System

- **friends** - Bidirectional friendships (two rows per friendship: A→B and B→A)

### Albums System

- **albums** - Album containers with creator reference
- **album_members** - Users who can access an album
- **album_entries** - Links entries to albums (many-to-many)
- **album_daily_insights** - Album-specific AI narratives

### Access Model

```
+-------------+     +------------------+     +-----------------+
|  Friends    | --> |  Album Discovery | --> |  Album Content  |
| (friends)   |     |    (albums)      |     | (album_entries) |
+-------------+     +------------------+     +-----------------+
      |                     |                        |
      v                     v                        v
  Friendship          See album names          View photos/entries
  enables             and metadata             requires membership
  discovery
```

## Troubleshooting

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `pgrst205` | Schema cache outdated | Run `NOTIFY pgrst, 'reload schema';` |
| `42P01` | Table doesn't exist | Apply migrations in order |
| `42501` | RLS policy violation | Check user authentication and ownership |
| `42703` | Column doesn't exist | Apply missing migrations (tags, saved_at, deleted_at) |
| `23505` | Unique constraint violation | Record already exists |

### Archive Feature Troubleshooting

The insights archive feature requires all migrations to be applied. If archiving fails:

1. **"Column does not exist" errors** → Apply migrations #15 and #16:
   - `20260119_archive_tags_saved_at.sql` - Adds `tags` and `saved_at` columns
   - `20260120_archive_recycle_bin.sql` - Adds `deleted_at` column

2. **"RLS policy violation" errors** → Verify user authentication:
   - Check that `auth.uid()` returns a valid user ID
   - Confirm user is logged in before saving

3. **"Archive full" message** → User has reached 150 item limit:
   - User can delete old items from the archive
   - Soft-deleted items (in recycle bin) don't count toward limit

4. **Verify archive schema:**
   ```sql
   SELECT column_name, data_type
   FROM information_schema.columns
   WHERE table_name = 'insights_archive'
   ORDER BY ordinal_position;
   ```

5. **Verify RLS policies for archive:**
   ```sql
   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'insights_archive';
   ```
   Expected policies: INSERT, SELECT, UPDATE, DELETE (4 total)

### Verify Migrations

Check which migrations have been applied:

```sql
SELECT * FROM supabase_migrations.schema_migrations ORDER BY version;
```

### Check RLS Policies

View all policies for a table:

```sql
SELECT * FROM pg_policies WHERE tablename = 'your_table_name';
```

## Storage Buckets

The `entries` bucket stores user photos. Policies:

1. Users can CRUD their own photos
2. Album members can view shared photos (via `is_entry_in_user_album` function)

## Mood Data Integrity

### Relationship Between entries.mood and moods.id

The `entries.mood` column stores a reference to `moods.id`. However, we intentionally **do not use foreign key constraints** for the following reasons:

1. **Historical Data Preservation**: When a custom mood is deleted (soft delete via `deleted_at`), existing entries should retain their data without cascading effects.

2. **Backward Compatibility**: Legacy entries may have mood values that don't exist in the new `moods` table.

3. **Data Recovery**: Without hard FK constraints, we can recover from orphaned references without data loss.

### The Role of mood_name_snapshot

The `mood_name_snapshot` column is the **primary source for displaying mood names** in the UI. It:

- Captures the mood name at the time of entry creation
- Preserves historical accuracy even if the mood is later renamed or deleted
- Has a NOT NULL constraint with default value 'Neutral'
- Is automatically populated by the `validate_entry_mood_trigger` if missing

### Validation Infrastructure

| Component | Purpose |
|-----------|---------|
| `validate_mood_reference()` | Function that checks if a mood ID exists in the moods table |
| `validate_entry_mood_trigger` | BEFORE INSERT/UPDATE trigger that validates mood references |
| `idx_entries_mood` | Index for faster mood lookups |
| `idx_entries_custom_moods` | Partial index for custom mood queries |

The validation is **soft**: it logs warnings for invalid references but allows the operation to proceed, relying on `mood_name_snapshot` for display.

### Valid vs Invalid Mood References

**Valid:**
- `mood = 'happy'` → exists in moods table as system mood
- `mood = 'custom_abc123'` → exists in moods table as custom mood for the user

**Invalid (but allowed with warning):**
- `mood = 'old_mood_name'` → doesn't exist in moods table, uses snapshot for display
- `mood = 'custom_deleted123'` → deleted custom mood, uses snapshot for display

### Validation Script

Use `scripts/validateMoodReferences.ts` to validate and fix mood data:

```bash
# Validate only
npx ts-node scripts/validateMoodReferences.ts

# Preview fixes
npx ts-node scripts/validateMoodReferences.ts --dry-run --fix

# Apply fixes
npx ts-node scripts/validateMoodReferences.ts --fix
```

### Migration Checklist

When applying mood-related migrations:

1. [ ] Backup the database before running migrations
2. [ ] Apply migrations in order (13, then 14)
3. [ ] Run `NOTIFY pgrst, 'reload schema';` after each migration
4. [ ] Run the validation script to verify data integrity
5. [ ] Check for any warnings in the trigger logs
6. [ ] Test capture creation with both system and custom moods

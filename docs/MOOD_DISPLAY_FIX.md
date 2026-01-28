# Custom Mood Display Fix

**Issue:** Custom moods showing as "Custom Mood" instead of their actual name in Insights sections.

---

## Root Cause

In `lib/moodUtils.ts`, the `getMoodLabel()` function has this fallback:

```typescript
if (moodId.startsWith('custom_')) return nameSnapshot || 'Custom Mood';
```

When a custom mood's `mood_name_snapshot` is missing or invalid, it falls back to the generic "Custom Mood" string.

---

## Architecture: How Mood Names Flow

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  Mood Selection │ ──▶ │  Capture Created │ ──▶ │  mood_id +          │
│  (user picks)   │     │  (captureStore)  │     │  mood_name_snapshot │
└─────────────────┘     └──────────────────┘     └─────────────────────┘
                                                           │
                                                           ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  Insights UI    │ ◀── │  getMoodLabel()  │ ◀── │  Display resolution │
│  (MoodChart,    │     │  (moodUtils.ts)  │     │  priority:          │
│   MoodFlow)     │     │                  │     │  1. nameSnapshot    │
└─────────────────┘     └──────────────────┘     │  2. moodCache       │
                                                 │  3. "Custom Mood"   │
                                                 └─────────────────────┘
```

---

## Key Files

| File | Purpose |
|------|---------|
| `lib/moodUtils.ts` | `getMoodLabel()` resolves mood ID → display name |
| `lib/captureStore.ts` | Saves captures with `mood_id` and `mood_name_snapshot` |
| `lib/customMoodStore.ts` | CRUD for custom moods in DB |
| `lib/moodCache.ts` | Caches mood data for fast lookup |
| `components/insights/MoodChart.tsx` | Displays mood distribution |
| `lib/moodSignals.ts` | Processes moods for insights |

---

## The Fix

### Option 1: Ensure `mood_name_snapshot` is Always Saved (Recommended)

In `captureStore.ts`, when creating a capture, make sure `mood_name_snapshot` is resolved before saving:

```typescript
// In addCapture function
const moodName = await resolveMoodNameBeforeSave(data.mood_id);
const captureData = {
    ...data,
    mood_name_snapshot: moodName || data.mood_name_snapshot
};
```

### Option 2: Improve Fallback in getMoodLabel

In `lib/moodUtils.ts`, try harder to resolve custom moods:

```typescript
export function getMoodLabel(moodId: string, nameSnapshot?: string): string {
    // 1. If we have a valid snapshot, use it
    if (nameSnapshot && nameSnapshot !== moodId && !nameSnapshot.startsWith('custom_')) {
        return nameSnapshot;
    }

    // 2. Try resolving from mood cache (includes custom moods)
    const mood = resolveMood(moodId);
    if (mood) return mood.name;

    // 3. For custom moods, try to extract name from ID pattern
    if (moodId.startsWith('custom_')) {
        // Custom mood IDs are UUIDs, can't extract name
        // Last resort: use snapshot if available, even if it looks like an ID
        if (nameSnapshot && nameSnapshot.length > 0) {
            return nameSnapshot;
        }
        // Only show "Custom Mood" if truly nothing else available
        return 'Custom Mood';
    }

    // 4. Capitalize the ID for system moods
    return moodId.charAt(0).toUpperCase() + moodId.slice(1);
}
```

### Option 3: Backfill Missing Snapshots

Create a migration to fix existing captures with missing `mood_name_snapshot`:

```sql
-- Find captures with custom moods but invalid snapshots
UPDATE captures c
SET mood_name_snapshot = m.name
FROM moods m
WHERE c.mood_id = m.id
AND c.mood_id LIKE 'custom_%'
AND (c.mood_name_snapshot IS NULL OR c.mood_name_snapshot LIKE 'custom_%');
```

---

## Validation in captureStore.ts

Current validation (lines 143-144, 105-106):

```typescript
// Warning for invalid snapshots
if (!entry.mood_name_snapshot || entry.mood_name_snapshot.startsWith('custom_')) {
    console.warn(`[captureStore] Entry ${entry.id} has invalid mood_name_snapshot`);
}

// Validation before save
if (!data.mood_name_snapshot || data.mood_name_snapshot.trim() === '') {
    throw new Error('mood_name_snapshot is required');
}
```

The validation exists but might not be catching all cases where the snapshot is the mood ID instead of the mood name.

---

## Verification Checklist

After applying fix:

- [ ] Create a new custom mood (e.g., "Vibing")
- [ ] Create a capture with that custom mood
- [ ] Check Daily Insight shows "Vibing" (not "Custom Mood")
- [ ] Check MoodChart shows "Vibing" (not "Custom Mood")
- [ ] Check MoodFlow shows "Vibing" (not "Custom Mood")
- [ ] Check Weekly/Monthly insights show correct custom mood names
- [ ] Existing captures with custom moods display correctly

---

## Logging for Debugging

Add logging to trace mood resolution:

```typescript
// In getMoodLabel
export function getMoodLabel(moodId: string, nameSnapshot?: string): string {
    console.log(`[getMoodLabel] id=${moodId}, snapshot=${nameSnapshot}`);
    // ... resolution logic
    console.log(`[getMoodLabel] resolved to: ${result}`);
    return result;
}
```

Check logs when viewing insights to see where resolution fails.

---

## Related: Mood Name Snapshot Field

The `mood_name_snapshot` field on captures serves as the "historical truth" of what the mood was called at the time of capture. This is important because:

1. Custom moods can be deleted
2. Custom mood names can be changed
3. The snapshot preserves the original name forever

**Always save the human-readable name, never the ID, in `mood_name_snapshot`.**

# Insight Formatting Fix Summary

**Date:** January 28, 2026  
**Branch:** `fix/insight-formatting-no-dashes`  
**Base:** `tek/light-theme-docs`

---

## Issues Identified

From screenshots showing the Insights page, three problems were visible:

1. **Dashes appearing in AI output** — The AI was using em dashes (—) in sentences like "a wave of gratitude washed over — perhaps a reward for wrangling those digital beasts."

2. **Line breaks between sentences** — Insights were displaying with visible paragraph breaks between individual sentences instead of flowing as continuous prose.

3. **Capture order not respected** — The narrative wasn't consistently following the chronological order of mood captures throughout the day.

---

## Changes Made

### 1. Edge Function (`supabase/functions/generate-insight/index.ts`)

**Added explicit BANNED PUNCTUATION section:**
```
BANNED PUNCTUATION:
• Exclamation marks (!)
• Questions of any kind (?)
• Dashes of ANY kind: em dash (—), en dash (–), hyphen used as punctuation (-)
• ONLY allowed punctuation: periods (.), commas (,), colons (:), semicolons (;), parentheses (), apostrophes (')
```

**Updated VOICE & FORMAT RULES:**
- Changed "CONTINUOUS PARAGRAPHS" to "CONTINUOUS PROSE" with emphasis on NO line breaks
- Replaced arrow notation (→) with "to" to avoid confusion

**Updated OUTPUT REQUIREMENTS:**
- Added: `NO LINE BREAKS: Output must be continuous flowing text. NO newlines (\n) within paragraphs.`
- Added: `NO DASHES: Never use em dashes, en dashes, or hyphens as punctuation. Use commas, colons, or semicolons instead.`

**Fixed examples:**
- Removed dashes from GOOD examples
- Added BAD examples showing dash usage is forbidden:
  - `BAD WEEKLY EXAMPLE (contains dashes): "By midweek, a shift emerged — Wednesday brought frustration." (DASH IS BANNED)`
  - `BAD MONTHLY EXAMPLE (contains dashes): "A rhythm emerged — moments of focus punctuated by restlessness." (DASH IS BANNED)`

### 2. Client (`Obsy-native/components/insights/InsightText.tsx`)

**Added text normalization:**
```typescript
// Normalize text: collapse all newlines into single spaces for flowing prose
const normalizedText = React.useMemo(() => {
    return fallbackText
        .replace(/\n+/g, ' ')  // Replace all newlines with spaces
        .replace(/\s+/g, ' ')  // Collapse multiple spaces into one
        .trim();
}, [fallbackText]);
```

**Changed paragraph handling:**
- Instead of splitting on `\n\n` to create multiple paragraph blocks, now keeps text as single flowing block
- This ensures even if AI returns newlines, they render as continuous prose

**Changed structured sentences rendering:**
- Instead of stacking each sentence as a separate View with spacing, now joins all sentences with spaces into one flowing text block

---

## Files Changed

| File | Change Type |
|------|-------------|
| `supabase/functions/generate-insight/index.ts` | Modified prompts |
| `Obsy-native/components/insights/InsightText.tsx` | Modified rendering |

---

## Deployment Steps

1. **Pull the branch:**
   ```bash
   git fetch origin
   git checkout fix/insight-formatting-no-dashes
   ```

2. **Merge into working branch (if needed):**
   ```bash
   git checkout tek/light-theme-docs
   git merge fix/insight-formatting-no-dashes
   ```

3. **Deploy Edge Function:**
   ```bash
   cd supabase
   supabase functions deploy generate-insight --no-verify-jwt
   ```

4. **Rebuild the app** to get the InsightText.tsx changes

---

## Expected Results After Fix

### Before:
```
The day kicked off with a rumbling tummy and the valiant pursuit of progress.

It seems the database decided to cooperate, which then paved the way for a much-deserved sense of relaxation.

By day's end, a wave of gratitude washed over — perhaps a reward for wrangling those digital beasts.
```

### After:
```
The day kicked off with a rumbling tummy and the valiant pursuit of progress. It seems the database decided to cooperate, which then paved the way for a much deserved sense of relaxation. By day's end, a wave of gratitude washed over, perhaps a reward for wrangling those digital beasts.
```

---

## Verification Checklist

- [ ] No dashes (—, –, -) appear in generated insights
- [ ] Insights display as continuous flowing text (no line breaks between sentences)
- [ ] Daily insights follow morning → afternoon → evening order
- [ ] Weekly insights follow Sunday → Saturday order
- [ ] Tones still apply correctly (test with different tone settings)

---

## Notes

- The client-side normalization is a safety net — the AI should output clean text, but if it doesn't, the client will fix it
- The edge function changes require deployment to Supabase
- The client changes require an app rebuild

# Obsy Tone System Guide

**Purpose:** Reference for how AI tones work, how to troubleshoot issues, and how to make changes.

---

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  ToneSelector   │ ──▶ │  User Profile    │ ──▶ │  secureAI.ts        │
│  (UI Component) │     │  (DB: profiles)  │     │  resolveTonePrompt  │
└─────────────────┘     └──────────────────┘     └─────────────────────┘
                                                           │
                                                           ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  Edge Function  │ ◀── │  InsightRequest  │ ◀── │  tone + prompt      │
│  generate-insight     │  { tone, prompt } │     │  resolution         │
└─────────────────┘     └──────────────────┘     └─────────────────────┘
```

---

## Key Files

| File | Purpose |
|------|---------|
| `lib/aiTone.ts` | Preset tone definitions (id, label, styleGuidelines) |
| `lib/customTone.ts` | Custom tone CRUD + validation rules |
| `services/secureAI.ts` | Resolves tone ID → actual prompt, calls edge function |
| `components/insights/ToneSelector.tsx` | UI for selecting tones |
| `hooks/useCustomTones.ts` | React hook for custom tones |
| `supabase/functions/generate-insight/index.ts` | Edge function with TONE_STYLES map |

---

## How Tones Flow

### 1. User Selects Tone (ToneSelector.tsx)
- User picks from preset tones OR custom tones
- Selection saved to `profiles.ai_tone` (preset ID) or `profiles.selected_custom_tone_id` (UUID)

### 2. Tone Resolution (secureAI.ts → resolveTonePrompt)

```typescript
// For preset tones:
if (isPresetTone(toneId)) {
    const definition = getToneDefinition(toneId);
    return {
        resolvedTone: toneId,           // e.g., "cinematic"
        resolvedPrompt: definition.styleGuidelines,
        toneName: definition.label      // e.g., "Cinematic"
    };
}

// For custom tones:
if (selectedCustomToneId) {
    const customTone = await getCustomToneById(selectedCustomToneId);
    return {
        resolvedTone: customTone.name,  // e.g., "I'm a god" (the actual name!)
        resolvedPrompt: customTone.prompt,
        toneName: customTone.name
    };
}
```

### 3. Edge Function Receives Request

```typescript
interface InsightRequest {
    type: 'daily' | 'weekly' | 'monthly' | ...;
    data: { captures, dateLabel, ... };
    tone: string;              // Tone name (preset ID or custom name)
    customTonePrompt?: string; // The actual style prompt text
}
```

### 4. Edge Function Applies Tone

```typescript
// In buildDailyPrompt, buildWeeklyPrompt, etc.:
const toneStyle = customTonePrompt || TONE_STYLES[tone] || TONE_STYLES.neutral;
```

**IMPORTANT:** If `customTonePrompt` is provided, it uses that. Otherwise it looks up `tone` in the `TONE_STYLES` map.

---

## Preset Tones

| ID | Label | Description |
|----|-------|-------------|
| `neutral` | Neutral | Plain, observant, balanced |
| `stoic_calm` | Stoic / Calm | Restrained, grounded, steady |
| `dry_humor` | Dry Humor | Subtle, intelligent humor |
| `mystery_noir` | Mystery / Noir | Atmospheric, shadowed |
| `cinematic` | Cinematic | Narrative, visual |
| `dreamlike` | Dreamlike | Soft, abstract, fluid |
| `romantic` | Romantic | Warm, intimate |
| `gentle_roast` | Gentle Roast | Light teasing, affectionate |
| `inspiring` | Inspiring | Uplifting but grounded |

---

## Custom Tones

### Database Table: `custom_ai_tones`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | Owner |
| `name` | TEXT | Display name (max 50 chars) |
| `prompt` | TEXT | Style guidelines (max 250 chars) |
| `created_at` | TIMESTAMP | Creation time |
| `updated_at` | TIMESTAMP | Last update |

### Validation Rules (customTone.ts)

```typescript
const CUSTOM_TONE_RULES = {
    MAX_NAME_LENGTH: 50,
    MAX_PROMPT_LENGTH: 250,
    BANNED_PHRASES: ['act as', 'pretend', 'you are', 'roleplay', 'impersonate', 'system prompt'],
    MARKDOWN_CHARS: ['*', '_', '#', '[', ']', '`'],
    EMOJI_REGEX: /[\u{1F300}-\u{1F9FF}]/u,
};
```

---

## Troubleshooting

### Issue: Custom tone shows "custom" instead of actual name

**Cause:** The tone name isn't being passed correctly to the edge function.

**Check:**
1. `resolveTonePrompt()` returns `resolvedTone: customTone.name` (not "custom")
2. The calling code passes `resolvedTone` as the `tone` parameter
3. Edge function logs show the correct tone name

**Fix locations:**
- `services/secureAI.ts` → `resolveTonePrompt()`
- Wherever `generateDailyInsightSecure()` etc. are called

### Issue: Tone not applying to insights

**Cause:** Either `customTonePrompt` is empty, or the tone ID doesn't match `TONE_STYLES`.

**Check:**
1. Add logging to edge function: `console.log('Tone:', tone, 'CustomPrompt:', customTonePrompt?.substring(0, 50))`
2. Verify `TONE_STYLES` in edge function has all preset IDs
3. For custom tones, verify `customTonePrompt` is being sent

### Issue: Settings not saving

**Check:**
1. Profile update succeeds: `updateProfile({ ai_tone: ..., selected_custom_tone_id: ... })`
2. RLS policies allow update
3. Check for Supabase errors in logs

---

## Adding a New Preset Tone

1. **Add to `lib/aiTone.ts`:**
   ```typescript
   {
       id: 'new_tone_id',
       label: 'New Tone',
       shortDescription: 'Brief description.',
       styleGuidelines: `
   Your style guidelines here.
   Keep it concise and clear.
   `,
   },
   ```

2. **Add to `PRESET_TONE_IDS` array** in same file

3. **Add to Edge Function `TONE_STYLES`:**
   ```typescript
   new_tone_id: `Same style guidelines as above.`,
   ```

4. **Deploy edge function**

---

## Modifying Insight Behavior

### To change how insights are written:

1. **Edit `SYSTEM_PROMPT`** in edge function for global rules
2. **Edit `TONE_STYLES`** for tone-specific behavior
3. **Edit prompt builders** (`buildDailyPrompt`, `buildWeeklyPrompt`, etc.) for structure

### Common changes:

| Want to... | Edit... |
|------------|---------|
| Ban certain words/phrases | `SYSTEM_PROMPT` → ABSOLUTE NO-GO LIST |
| Change sentence count | Prompt builders → RULES section |
| Change tone personality | `TONE_STYLES` map |
| Fix chronological order | Prompt builders → sorting logic |
| Change output format | Prompt builders → JSON structure |

---

## Testing Checklist

After making tone/insight changes:

- [ ] Preset tone "Neutral" generates correct insight
- [ ] Preset tone "Gentle Roast" has humor
- [ ] Custom tone with name "I'm a god" shows that name (not "custom")
- [ ] Custom tone prompt actually affects insight style
- [ ] Tone changes persist after app restart
- [ ] Edge function logs show correct tone info

---

## Quick Reference: Where Things Live

```
TONE DEFINITIONS:
  Presets  → lib/aiTone.ts
  Custom   → DB: custom_ai_tones

TONE UI:
  Selector → components/insights/ToneSelector.tsx
  Modal    → components/insights/CustomToneModal.tsx

TONE RESOLUTION:
  Client   → services/secureAI.ts → resolveTonePrompt()

INSIGHT GENERATION:
  Client   → services/secureAI.ts → generate*InsightSecure()
  Server   → supabase/functions/generate-insight/index.ts

INSIGHT DISPLAY:
  Text     → components/insights/InsightText.tsx
  Cards    → components/insights/TodayInsightCard.tsx
           → components/insights/WeeklySummaryCard.tsx
           → components/insights/MonthView.tsx
```

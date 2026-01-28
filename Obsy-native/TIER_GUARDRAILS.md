# Obsy Tier Guardrails Specification

**Last Updated:** January 2025

This document defines what each user tier can access. Use this as the source of truth when implementing feature gates.

---

## Tier Overview

| Feature | Guest | Free | Plus |
|---------|-------|------|------|
| **Insights (total/day)** | 1 per session | 3 per day | Unlimited |
| **Daily Insights** | ✅ (counts toward limit) | ✅ (counts toward limit) | ✅ |
| **Weekly Insights** | ❌ | ✅ (counts toward limit) | ✅ |
| **Monthly Tab** | ❌ | ❌ | ✅ |
| **Tag Reflections** | ❌ | ✅ (counts toward limit) | ✅ |
| **AI Tones** | Neutral only | Neutral, Gentle Roast, +1 other | All tones |
| **Custom Tones** | ❌ | 1 custom tone | Unlimited |
| **Albums** | View only (signup prompt) | Full access | Full access |
| **Album Insights** | ❌ | ✅ (counts toward limit) | ✅ |
| **Floating Backgrounds** | Obsy Float only | Obsy Float only | All modes |
| **Year in Pixels** | ✅ | ✅ | ✅ |
| **Storage** | Local only | Local only | Local + Cloud (hybrid) |
| **Archive Limit** | ❌ No archiving | 50 insights | 150 insights |

---

## Detailed Breakdown

### Insights

**Guest:**
- 1 insight per session (daily insight only)
- Once used, they see upgrade prompt
- No weekly, monthly, or tag reflections

**Free:**
- 3 insights per day (shared pool)
- Can use: Daily, Weekly, Tag Reflections, Album Insights
- Cannot use: Monthly Tab
- Counter resets at midnight

**Plus:**
- Unlimited insights
- All types available

---

### AI Tones

**Guest:**
- Neutral tone only
- No tone selector visible (or show locked state)

**Free:**
- Available: Neutral, Gentle Roast, Inspiring
- Can create 1 custom tone
- Other tones show locked state

**Plus:**
- All preset tones unlocked
- Unlimited custom tone creation

---

### Albums

**Guest:**
- Can navigate to Albums screen
- First interaction shows "Create account to use Albums" prompt
- Cannot: create albums, join albums, add friends, view album content, generate album insights

**Free:**
- Full album functionality
- Album insights count toward their 3/day limit

**Plus:**
- Full album functionality
- Unlimited album insights

---

### Floating Backgrounds

**Guest & Free:**
- Only "Obsy Drift" mode available
- Other modes (Static Drift, Orbital Float, Parallax Float) show locked state

**Plus:**
- All floating background modes unlocked

---

### Storage

**Guest & Free:**
- Local storage only
- Photos never leave device
- No cloud backup option

**Plus:**
- Hybrid mode: Local + Cloud sync
- Can toggle between local-only and cloud backup
- Cloud backup is opt-in

---

### Archive

**Guest:**
- Cannot archive insights
- Archive button hidden or shows upgrade prompt

**Free:**
- Can archive up to 50 insights
- Shows counter: "12/50 archived"
- At limit: prompt to upgrade or delete old archives

**Plus:**
- Can archive up to 150 insights
- Shows counter: "45/150 archived"

---

## Implementation Checklist

### Files to Update

1. **`hooks/useSubscription.ts`**
   - Update LIMITS object to match this spec
   - Add monthly_insight tracking
   - Add archive_count tracking

2. **`components/PremiumGate.tsx`**
   - Already exists, verify all features use it

3. **Insights Tab (`app/(tabs)/insights.tsx`)**
   - Gate Monthly tab for Plus only
   - Gate Tag Reflections for Free+ only
   - Show remaining insight count for Free users

4. **Tone Selector**
   - Lock tones based on tier
   - Limit custom tone creation for Free (1 max)

5. **Albums (`app/albums/`)**
   - Gate all interactions for Guest
   - Allow Free users full access

6. **Floating Backgrounds (`components/backgrounds/`)**
   - Lock non-Obsy modes for Guest/Free

7. **Archive**
   - Implement archive limits (50 Free, 150 Plus)
   - Block archiving for Guest

8. **Storage Settings**
   - Hide cloud option for Guest/Free
   - Show hybrid toggle for Plus only

---

## UX Guidelines

1. **Don't be annoying.** Show upgrade prompts at natural friction points, not constantly.

2. **Be transparent.** Show "2/3 insights remaining" so users know where they stand.

3. **Fail gracefully.** If a feature is locked, explain why and what tier unlocks it.

4. **Guest experience matters.** Let them feel the app before asking for signup.

5. **Free is generous.** 3 insights/day is enough to form a habit. Don't cripple the core experience.

---

## Open Questions

- [x] Which third tone for Free users? **Neutral, Gentle Roast, Inspiring**
- [ ] Should weekly insights be available for Guest? (Currently spec says no)
- [ ] Archive limit UX: hard block or soft warning?

---

*Philosophy: Obsy is understanding, not greedy. The goal is users who love the app, not users who feel nickel-and-dimed.*

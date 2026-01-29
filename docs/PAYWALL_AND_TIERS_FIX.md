# Paywall Text & Tier Guardrails

## 1. Paywall Text Fix

**File:** `components/paywall/VanguardPaywall.tsx`

**Issue:** Founder's Pass benefits list includes features that won't be implemented:
- "GOLD AVATAR RING" (Social Flex)
- "FOUNDER ALBUMS ACCESS" (Exclusive Community)

**Fix:** Remove these two benefit items. Founder's Pass = Lifetime Plus, nothing extra.

### Current Code (lines ~207-227):
```tsx
<View style={styles.benefitsList}>
    <View style={styles.benefitItem}>
        <View style={styles.benefitIconContainer}>
            <Ionicons name="trophy" size={14} color="#fbbf24" />
        </View>
        <Text style={styles.benefitText}>
            <Text style={styles.benefitHighlight}>LIFETIME ACCESS TO ALL FEATURES</Text> (One-time payment $29.99)
        </Text>
    </View>
    <View style={styles.benefitItem}>
        <View style={styles.benefitIconContainer}>
            <Ionicons name="sparkles" size={14} color="#fbbf24" />
        </View>
        <Text style={styles.benefitText}>
            <Text style={styles.benefitHighlight}>GOLD AVATAR RING</Text> (Social Flex)
        </Text>
    </View>
    <View style={styles.benefitItem}>
        <View style={styles.benefitIconContainer}>
            <Ionicons name="planet" size={14} color="#818cf8" />
        </View>
        <Text style={styles.benefitText}>
            <Text style={styles.benefitHighlight}>FOUNDER ALBUMS ACCESS</Text> (Exclusive Community)
        </Text>
    </View>
</View>
```

### Fixed Code:
```tsx
<View style={styles.benefitsList}>
    <View style={styles.benefitItem}>
        <View style={styles.benefitIconContainer}>
            <Ionicons name="trophy" size={14} color="#fbbf24" />
        </View>
        <Text style={styles.benefitText}>
            <Text style={styles.benefitHighlight}>LIFETIME ACCESS TO ALL FEATURES</Text> (One-time payment $29.99)
        </Text>
    </View>
    <View style={styles.benefitItem}>
        <View style={styles.benefitIconContainer}>
            <Ionicons name="infinite" size={14} color="#fbbf24" />
        </View>
        <Text style={styles.benefitText}>
            <Text style={styles.benefitHighlight}>UNLIMITED INSIGHTS</Text> (Daily, Weekly, Monthly)
        </Text>
    </View>
    <View style={styles.benefitItem}>
        <View style={styles.benefitIconContainer}>
            <Ionicons name="color-palette" size={14} color="#fbbf24" />
        </View>
        <Text style={styles.benefitText}>
            <Text style={styles.benefitHighlight}>ALL AI TONES</Text> (Including Custom Tones)
        </Text>
    </View>
</View>
```

---

## 2. Tier Guardrails Implementation

### Proposed Limits

| Feature | Guest | Free | Founder/Subscriber |
|---------|-------|------|-------------------|
| Captures/day | 3 | 10 | Unlimited |
| Local storage | 50 captures | 200 captures | Unlimited |
| Cloud backup | ❌ | ❌ | ✅ |
| Archive slots | 0 | 30 | 150 |
| Daily insights | 1 | 3 | Unlimited |
| Weekly insights | 0 | 1 | Unlimited |
| Custom tones | ❌ | ❌ | ✅ |

### Files to Modify

#### A. Update `hooks/useSubscription.ts`

Add new limits to the LIMITS object:

```typescript
const LIMITS = {
    guest: {
        daily_insight: 1,
        group_insight: 0,
        weekly_insight: 0,
        captures_per_day: 3,
        max_local_captures: 50,
        archive_slots: 0,
        cloud_backup: false,
    },
    free: {
        daily_insight: 3,
        group_insight: 3,
        weekly_insight: 1,
        captures_per_day: 10,
        max_local_captures: 200,
        archive_slots: 30,
        cloud_backup: false,
    },
    founder: {
        daily_insight: Infinity,
        group_insight: Infinity,
        weekly_insight: Infinity,
        captures_per_day: Infinity,
        max_local_captures: Infinity,
        archive_slots: 150,
        cloud_backup: true,
    },
    subscriber: {
        daily_insight: Infinity,
        group_insight: Infinity,
        weekly_insight: Infinity,
        captures_per_day: Infinity,
        max_local_captures: Infinity,
        archive_slots: 150,
        cloud_backup: true,
    },
};
```

#### B. Update `lib/captureStore.ts`

Add capture limit check before creating:

```typescript
// In addCapture function, before creating
const { tier } = useSubscription(); // or pass as param
const todayCaptures = captures.filter(c => 
    getLocalDayKey(new Date(c.created_at)) === getLocalDayKey(new Date())
).length;

if (todayCaptures >= LIMITS[tier].captures_per_day) {
    throw new Error('Daily capture limit reached. Upgrade for unlimited captures.');
}

// Check total local storage
if (captures.length >= LIMITS[tier].max_local_captures) {
    throw new Error('Storage limit reached. Delete old captures or upgrade.');
}
```

#### C. Update `services/storage.ts`

Only upload to cloud for paid tiers:

```typescript
export async function uploadCaptureImage(
    localUri: string, 
    userId: string,
    tier: SubscriptionTier
): Promise<string | null> {
    // Skip cloud upload for free/guest tiers
    if (tier === 'guest' || tier === 'free') {
        console.log('[Storage] Skipping cloud upload for', tier, 'tier');
        return null;
    }
    
    // ... existing upload logic
}
```

#### D. Update Database Schema

Add columns to track limits in `user_settings`:

```sql
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS
    daily_capture_count INTEGER DEFAULT 0;

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS
    capture_count_reset_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
```

Add reset function similar to insight limits:

```sql
CREATE OR REPLACE FUNCTION check_and_reset_capture_limits(user_uuid UUID)
RETURNS void AS $$
BEGIN
    UPDATE user_settings
    SET daily_capture_count = 0,
        capture_count_reset_at = NOW()
    WHERE user_id = user_uuid
    AND capture_count_reset_at < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;
```

---

## 3. Storage Optimization

### Current State (Already Implemented)
- ✅ 3-tier image optimization (thumb 200px, preview 800px, full 1440px)
- ✅ WebP format (~30% smaller than JPEG)
- ✅ Original image deletion after processing
- ✅ Storage stats tracking

### Recommended Additions

#### A. Conditional Cloud Upload
Only upload to Supabase Storage for paid tiers (see section 2C above).

#### B. Auto-Cleanup for Free Tier
Add cleanup job that removes captures older than 30 days for free tier:

```typescript
// In captureStore or a scheduled job
async function cleanupOldCaptures(userId: string, tier: SubscriptionTier) {
    if (tier !== 'free') return;
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Delete captures older than 30 days
    const oldCaptures = captures.filter(c => 
        new Date(c.created_at) < thirtyDaysAgo
    );
    
    for (const capture of oldCaptures) {
        await deleteCapture(capture.id);
    }
}
```

#### C. Storage Warning UI
Show warning when approaching limits:

```typescript
// In Gallery or Home screen
const storagePercent = (captures.length / LIMITS[tier].max_local_captures) * 100;

if (storagePercent > 80) {
    // Show warning banner
}
```

---

## Testing Checklist

### Paywall
- [ ] Founder's Pass shows only "Lifetime Access", "Unlimited Insights", "All AI Tones"
- [ ] No mention of golden ring or founder albums

### Tier Limits
- [ ] Guest can only capture 3 times per day
- [ ] Free can only capture 10 times per day
- [ ] Free shows upgrade prompt at limit
- [ ] Founder/Subscriber has no capture limits
- [ ] Cloud backup only happens for paid tiers

### Storage
- [ ] Free tier doesn't upload to Supabase Storage
- [ ] Paid tier uploads work correctly
- [ ] Storage warnings appear at 80% capacity

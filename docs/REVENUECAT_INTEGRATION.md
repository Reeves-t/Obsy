# RevenueCat Integration Guide

Obsy payment integration for iOS App Store purchases.

**Products:**
- `obsy_plus_monthly` — $1.99/month subscription
- `obsy_plus_yearly` — $18.99/year subscription
- `obsy_founder_pass` — $29.99 one-time (non-consumable)

---

## 1. RevenueCat Account Setup

### A. Create Account
1. Go to https://app.revenuecat.com
2. Sign up (free tier works until $2.5k/month revenue)
3. Create a new Project called "Obsy"

### B. Create App in RevenueCat
1. In your project, click "Add App"
2. Select "App Store"
3. Enter your App Bundle ID (e.g., `com.obsy.app`)
4. You'll need your **App Store Connect Shared Secret** later

### C. Get API Keys
1. Go to Project Settings → API Keys
2. Copy the **Public SDK Key** (starts with `appl_`)
3. You'll use this in the app

---

## 2. App Store Connect Setup

### A. Create In-App Purchases

Go to App Store Connect → Your App → In-App Purchases

**Product 1: Monthly Subscription**
- Type: Auto-Renewable Subscription
- Reference Name: Obsy Plus Monthly
- Product ID: `obsy_plus_monthly`
- Subscription Group: "Obsy Plus"
- Price: $1.99

**Product 2: Yearly Subscription**
- Type: Auto-Renewable Subscription
- Reference Name: Obsy Plus Yearly
- Product ID: `obsy_plus_yearly`
- Subscription Group: "Obsy Plus"
- Price: $18.99

**Product 3: Founder's Pass**
- Type: Non-Consumable
- Reference Name: Obsy Founder's Pass
- Product ID: `obsy_founder_pass`
- Price: $29.99

### B. Get Shared Secret
1. App Store Connect → Users and Access → Integrations → In-App Purchase
2. Generate App-Specific Shared Secret
3. Copy and add to RevenueCat dashboard

### C. Configure RevenueCat Products

In RevenueCat dashboard:
1. Go to Products → Entitlements
2. Create entitlement: `plus` (for all premium features)
3. Attach all 3 products to this entitlement
4. Go to Products → Offerings
5. Create offering: `default`
6. Add all 3 products as packages

---

## 3. Install SDK

```bash
cd Obsy-native
npx expo install react-native-purchases
```

For Expo managed workflow, add to `app.json`:
```json
{
  "expo": {
    "plugins": [
      [
        "react-native-purchases",
        {
          "ios": {
            "usesStoreKit2": true
          }
        }
      ]
    ]
  }
}
```

---

## 4. Implementation

### A. Create RevenueCat Service

**File:** `services/purchases.ts`

```typescript
import Purchases, {
  PurchasesPackage,
  CustomerInfo,
  LOG_LEVEL,
} from 'react-native-purchases';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

// RevenueCat API Key (Public - safe to include in app)
const REVENUECAT_API_KEY = 'appl_YOUR_API_KEY_HERE'; // Replace with your key

// Product identifiers
export const PRODUCT_IDS = {
  MONTHLY: 'obsy_plus_monthly',
  YEARLY: 'obsy_plus_yearly',
  FOUNDER: 'obsy_founder_pass',
} as const;

// Entitlement identifier
export const ENTITLEMENT_ID = 'plus';

/**
 * Initialize RevenueCat SDK
 * Call this once on app startup (e.g., in _layout.tsx)
 */
export async function initializePurchases(userId?: string): Promise<void> {
  if (Platform.OS === 'web') return;

  Purchases.setLogLevel(LOG_LEVEL.DEBUG); // Remove in production

  await Purchases.configure({
    apiKey: REVENUECAT_API_KEY,
    appUserID: userId || undefined, // Links to Supabase user
  });

  console.log('[Purchases] RevenueCat initialized');
}

/**
 * Login user to RevenueCat (call after Supabase auth)
 */
export async function loginPurchases(userId: string): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.logIn(userId);
  console.log('[Purchases] User logged in:', userId);
  return customerInfo;
}

/**
 * Logout user from RevenueCat
 */
export async function logoutPurchases(): Promise<void> {
  await Purchases.logOut();
  console.log('[Purchases] User logged out');
}

/**
 * Get available packages (products) to display in paywall
 */
export async function getOfferings(): Promise<PurchasesPackage[]> {
  try {
    const offerings = await Purchases.getOfferings();
    
    if (!offerings.current) {
      console.warn('[Purchases] No current offering found');
      return [];
    }

    return offerings.current.availablePackages;
  } catch (error) {
    console.error('[Purchases] Error fetching offerings:', error);
    return [];
  }
}

/**
 * Purchase a package
 */
export async function purchasePackage(
  pkg: PurchasesPackage
): Promise<{ success: boolean; customerInfo?: CustomerInfo; error?: string }> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    
    // Check if user now has entitlement
    const hasPlus = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
    
    if (hasPlus) {
      // Sync to Supabase
      await syncSubscriptionToSupabase(customerInfo);
      return { success: true, customerInfo };
    }

    return { success: false, error: 'Purchase completed but entitlement not found' };
  } catch (error: any) {
    // User cancelled
    if (error.userCancelled) {
      return { success: false, error: 'cancelled' };
    }
    
    console.error('[Purchases] Purchase error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check if user has active subscription/purchase
 */
export async function checkSubscriptionStatus(): Promise<{
  hasPlus: boolean;
  isFounder: boolean;
  expirationDate?: string;
}> {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    const plusEntitlement = customerInfo.entitlements.active[ENTITLEMENT_ID];
    
    if (!plusEntitlement) {
      return { hasPlus: false, isFounder: false };
    }

    // Check if it's a founder (lifetime) purchase
    const isFounder = plusEntitlement.productIdentifier === PRODUCT_IDS.FOUNDER;
    
    return {
      hasPlus: true,
      isFounder,
      expirationDate: isFounder ? undefined : plusEntitlement.expirationDate || undefined,
    };
  } catch (error) {
    console.error('[Purchases] Error checking subscription:', error);
    return { hasPlus: false, isFounder: false };
  }
}

/**
 * Restore purchases (for users who reinstall or switch devices)
 */
export async function restorePurchases(): Promise<{
  success: boolean;
  hasPlus: boolean;
  error?: string;
}> {
  try {
    const customerInfo = await Purchases.restorePurchases();
    const hasPlus = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
    
    if (hasPlus) {
      await syncSubscriptionToSupabase(customerInfo);
    }
    
    return { success: true, hasPlus };
  } catch (error: any) {
    console.error('[Purchases] Restore error:', error);
    return { success: false, hasPlus: false, error: error.message };
  }
}

/**
 * Sync subscription status to Supabase
 */
async function syncSubscriptionToSupabase(customerInfo: CustomerInfo): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const plusEntitlement = customerInfo.entitlements.active[ENTITLEMENT_ID];
  if (!plusEntitlement) return;

  const isFounder = plusEntitlement.productIdentifier === PRODUCT_IDS.FOUNDER;
  
  // Update user_settings with subscription info
  const { error } = await supabase
    .from('user_settings')
    .update({
      subscription_tier: isFounder ? 'founder' : 'subscriber',
      is_founder: isFounder,
      subscription_expires_at: isFounder ? null : plusEntitlement.expirationDate,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id);

  if (error) {
    console.error('[Purchases] Failed to sync to Supabase:', error);
  } else {
    console.log('[Purchases] Subscription synced to Supabase');
  }

  // If founder, increment the founder count
  if (isFounder) {
    await supabase.rpc('increment_founder_count');
  }
}
```

### B. Create Purchases Hook

**File:** `hooks/usePurchases.ts`

```typescript
import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import { PurchasesPackage } from 'react-native-purchases';
import {
  getOfferings,
  purchasePackage,
  checkSubscriptionStatus,
  restorePurchases,
  PRODUCT_IDS,
} from '@/services/purchases';

export function usePurchases() {
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [hasPlus, setHasPlus] = useState(false);
  const [isFounder, setIsFounder] = useState(false);

  // Load offerings on mount
  useEffect(() => {
    if (Platform.OS === 'web') {
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);
      try {
        const [pkgs, status] = await Promise.all([
          getOfferings(),
          checkSubscriptionStatus(),
        ]);
        setPackages(pkgs);
        setHasPlus(status.hasPlus);
        setIsFounder(status.isFounder);
      } catch (error) {
        console.error('[usePurchases] Load error:', error);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  // Get specific packages
  const monthlyPackage = packages.find(
    (p) => p.product.identifier === PRODUCT_IDS.MONTHLY
  );
  const yearlyPackage = packages.find(
    (p) => p.product.identifier === PRODUCT_IDS.YEARLY
  );
  const founderPackage = packages.find(
    (p) => p.product.identifier === PRODUCT_IDS.FOUNDER
  );

  // Purchase handler
  const purchase = useCallback(async (pkg: PurchasesPackage) => {
    setPurchasing(true);
    try {
      const result = await purchasePackage(pkg);
      if (result.success) {
        const status = await checkSubscriptionStatus();
        setHasPlus(status.hasPlus);
        setIsFounder(status.isFounder);
      }
      return result;
    } finally {
      setPurchasing(false);
    }
  }, []);

  // Restore handler
  const restore = useCallback(async () => {
    setPurchasing(true);
    try {
      const result = await restorePurchases();
      if (result.hasPlus) {
        setHasPlus(true);
        const status = await checkSubscriptionStatus();
        setIsFounder(status.isFounder);
      }
      return result;
    } finally {
      setPurchasing(false);
    }
  }, []);

  return {
    packages,
    monthlyPackage,
    yearlyPackage,
    founderPackage,
    loading,
    purchasing,
    hasPlus,
    isFounder,
    purchase,
    restore,
  };
}
```

### C. Initialize in App Layout

**File:** `app/_layout.tsx` (add to existing)

```typescript
import { useEffect } from 'react';
import { initializePurchases, loginPurchases, logoutPurchases } from '@/services/purchases';
import { useAuth } from '@/contexts/AuthContext';

// Inside RootLayout component:
const { user } = useAuth();

useEffect(() => {
  initializePurchases();
}, []);

// Sync RevenueCat user with Supabase user
useEffect(() => {
  if (user) {
    loginPurchases(user.id);
  } else {
    logoutPurchases();
  }
}, [user?.id]);
```

### D. Update VanguardPaywall

**File:** `components/paywall/VanguardPaywall.tsx`

```typescript
import { usePurchases } from '@/hooks/usePurchases';
import { Alert } from 'react-native';

// Inside component:
const {
  monthlyPackage,
  yearlyPackage,
  founderPackage,
  loading,
  purchasing,
  purchase,
  restore,
} = usePurchases();

// Replace handlePurchase:
const handlePurchase = async () => {
  let pkg;
  switch (selectedPlan) {
    case 'founder':
      pkg = founderPackage;
      break;
    case 'yearly':
      pkg = yearlyPackage;
      break;
    case 'monthly':
      pkg = monthlyPackage;
      break;
  }

  if (!pkg) {
    Alert.alert('Error', 'Product not available. Please try again.');
    return;
  }

  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  
  const result = await purchase(pkg);
  
  if (result.success) {
    Alert.alert('Welcome!', 'Your purchase was successful.');
    onClose();
  } else if (result.error !== 'cancelled') {
    Alert.alert('Purchase Failed', result.error || 'Please try again.');
  }
};

// Add restore button somewhere in the UI:
const handleRestore = async () => {
  const result = await restore();
  if (result.hasPlus) {
    Alert.alert('Restored!', 'Your purchases have been restored.');
    onClose();
  } else {
    Alert.alert('No Purchases', 'No previous purchases found.');
  }
};

// Update CTA button to show loading state:
<TouchableOpacity
  style={[styles.submitButton, purchasing && styles.buttonDisabled]}
  onPress={handlePurchase}
  disabled={purchasing || loading}
  activeOpacity={0.9}
>
  {purchasing ? (
    <ActivityIndicator color="black" />
  ) : (
    <Text style={styles.submitText}>{ctaLabel}</Text>
  )}
</TouchableOpacity>

// Add restore link:
<TouchableOpacity onPress={handleRestore} disabled={purchasing}>
  <Text style={styles.restoreText}>Restore Purchases</Text>
</TouchableOpacity>
```

---

## 5. Database Updates

### Add columns to user_settings

```sql
-- Add subscription tracking columns
ALTER TABLE user_settings 
ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS revenuecat_id TEXT;

-- Function to increment founder count
CREATE OR REPLACE FUNCTION increment_founder_count()
RETURNS void AS $$
BEGIN
  INSERT INTO system_stats (key, value)
  VALUES ('founder_count', jsonb_build_object('count', 1))
  ON CONFLICT (key)
  DO UPDATE SET value = jsonb_build_object(
    'count', (COALESCE((system_stats.value->>'count')::int, 0) + 1)
  );
END;
$$ LANGUAGE plpgsql;
```

---

## 6. Testing

### A. Sandbox Testing

1. Create a Sandbox Tester in App Store Connect:
   - Users and Access → Sandbox → Testers
   - Add a test Apple ID (use a unique email)

2. Sign out of App Store on device:
   - Settings → App Store → Sign Out

3. When prompted in-app, sign in with sandbox account

4. Purchases use sandbox (no real charges)

### B. Test Scenarios

- [ ] Monthly purchase completes
- [ ] Yearly purchase completes  
- [ ] Founder's Pass purchase completes
- [ ] User shows as subscribed after purchase
- [ ] Subscription syncs to Supabase
- [ ] Restore purchases works
- [ ] Cancel and resubscribe works

---

## 7. Production Checklist

- [ ] Replace debug API key with production key
- [ ] Remove `LOG_LEVEL.DEBUG`
- [ ] Configure webhooks in RevenueCat for server-side sync
- [ ] Test full purchase flow with sandbox account
- [ ] Submit products for App Store review
- [ ] Products must be "Ready to Submit" status

---

## Troubleshooting

### "No offerings found"
- Check products are active in App Store Connect
- Verify products are attached to offerings in RevenueCat
- Wait a few minutes after creating products (propagation delay)

### "Purchase cancelled"
- Normal if user taps cancel
- Check sandbox account is properly signed in

### Subscription not syncing to Supabase
- Check Supabase RLS policies allow update
- Verify user is authenticated
- Check console for sync errors

---

## Price Display

Use RevenueCat's localized prices instead of hardcoded:

```typescript
// Instead of hardcoded "$1.99"
const price = monthlyPackage?.product.priceString; // "US$1.99" or localized
```

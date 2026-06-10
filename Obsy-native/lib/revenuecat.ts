import Purchases, {
    CustomerInfo,
    LOG_LEVEL,
    PACKAGE_TYPE,
    PurchasesPackage,
} from 'react-native-purchases';
import {
    ENTITLEMENT_ID,
    OFFERING_ID,
    PRODUCT_ID_MONTHLY,
    PRODUCT_ID_YEARLY,
    REVENUECAT_API_KEY,
} from '@/constants/revenuecat';

/**
 * Thin RevenueCat wrapper (OBS-16). Purchase + restore happen here; the
 * authoritative entitlement is written server-side by the RevenueCat webhook
 * (OBS-17). Client entitlement reads are for immediate UX only.
 */

let configured = false;

export function configureRevenueCat(): void {
    if (configured || !REVENUECAT_API_KEY) return;
    if (__DEV__) {
        Purchases.setLogLevel(LOG_LEVEL.WARN);
    }
    Purchases.configure({ apiKey: REVENUECAT_API_KEY });
    configured = true;
}

export function isRevenueCatConfigured(): boolean {
    return configured;
}

/** Tie the RevenueCat app user to the Supabase user id so the webhook can map them. */
export async function identifyRevenueCatUser(userId: string): Promise<void> {
    if (!configured) return;
    try {
        await Purchases.logIn(userId);
    } catch (err) {
        console.warn('[RevenueCat] logIn failed:', err);
    }
}

/** Reset to an anonymous RevenueCat user on sign-out. */
export async function resetRevenueCatUser(): Promise<void> {
    if (!configured) return;
    try {
        await Purchases.logOut();
    } catch {
        // logOut throws if the current user is already anonymous — safe to ignore.
    }
}

export function hasPlusEntitlement(info: CustomerInfo | null | undefined): boolean {
    return !!info?.entitlements.active[ENTITLEMENT_ID];
}

export async function isPlusActive(): Promise<boolean> {
    if (!configured) return false;
    try {
        return hasPlusEntitlement(await Purchases.getCustomerInfo());
    } catch (err) {
        console.warn('[RevenueCat] getCustomerInfo failed:', err);
        return false;
    }
}

/** Packages from the configured "default" offering (falls back to the current offering). */
export async function getPlusPackages(): Promise<PurchasesPackage[]> {
    if (!configured) return [];
    const offerings = await Purchases.getOfferings();
    const offering = offerings.all[OFFERING_ID] ?? offerings.current;
    return offering?.availablePackages ?? [];
}

/** Resolve the monthly/yearly package by package type, then by product id as a fallback. */
export function findPackage(
    packages: PurchasesPackage[],
    plan: 'monthly' | 'yearly',
): PurchasesPackage | undefined {
    const wantType = plan === 'monthly' ? PACKAGE_TYPE.MONTHLY : PACKAGE_TYPE.ANNUAL;
    const wantProduct = plan === 'monthly' ? PRODUCT_ID_MONTHLY : PRODUCT_ID_YEARLY;
    return (
        packages.find((p) => p.packageType === wantType) ??
        packages.find((p) => p.product.identifier === wantProduct)
    );
}

export type PurchaseResult = {
    ok: boolean;
    isPlus: boolean;
    userCancelled?: boolean;
    error?: string;
};

export async function purchasePlusPackage(pkg: PurchasesPackage): Promise<PurchaseResult> {
    try {
        const { customerInfo } = await Purchases.purchasePackage(pkg);
        return { ok: true, isPlus: hasPlusEntitlement(customerInfo) };
    } catch (err: any) {
        if (err?.userCancelled) {
            return { ok: false, isPlus: false, userCancelled: true };
        }
        return { ok: false, isPlus: false, error: err?.message ?? 'Purchase failed' };
    }
}

export async function restorePurchases(): Promise<PurchaseResult> {
    try {
        const info = await Purchases.restorePurchases();
        return { ok: true, isPlus: hasPlusEntitlement(info) };
    } catch (err: any) {
        return { ok: false, isPlus: false, error: err?.message ?? 'Restore failed' };
    }
}

import { Platform } from 'react-native';

/**
 * RevenueCat configuration (OBS-10 Cluster B / OBS-16 / OBS-19).
 *
 * Final values confirmed by the board on 2026-06-10. Public SDK keys are safe to
 * ship in the client.
 *
 * PRODUCTION KEY WIRING (OBS-19): the production iOS public key (`appl_…`) is
 * injected at build time from the EAS secret / env var
 * `EXPO_PUBLIC_REVENUECAT_IOS_KEY`. To go live, the board only needs to set that
 * secret (`eas secret:create --name EXPO_PUBLIC_REVENUECAT_IOS_KEY --value appl_…`)
 * — no code edit required. When the env var is unset (local/dev), we fall back to
 * the board's TEST key so the purchase flow still works in development. Android is
 * deferred per board; `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` is wired the same way
 * for when it ships.
 */

const RC_TEST_KEY = 'test_PHqXuLhLtHr1PIEnkFrCadoHyLp';

// EXPO_PUBLIC_* vars are inlined by Expo at build time from the build env (EAS
// secrets are available there). Undefined → falls back to the TEST key.
const RC_IOS_PROD_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
const RC_ANDROID_PROD_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

export const REVENUECAT_API_KEY: string = Platform.select({
  ios: RC_IOS_PROD_KEY || RC_TEST_KEY,
  android: RC_ANDROID_PROD_KEY || RC_TEST_KEY,
  default: RC_TEST_KEY,
}) as string;

/** True when a real production key is in use (not the dev/test fallback). */
export const IS_PRODUCTION_REVENUECAT_KEY: boolean =
  REVENUECAT_API_KEY !== RC_TEST_KEY;

/** Entitlement identifier checked in code (display name: "Obsy Plus"). */
export const ENTITLEMENT_ID = 'plus';

/** RevenueCat offering id holding the Plus packages. */
export const OFFERING_ID = 'default';

/** App Store Connect / RevenueCat product identifiers (source of truth). */
export const PRODUCT_ID_MONTHLY = 'obsy.plus.monthly';
export const PRODUCT_ID_YEARLY = 'obsy.plus.yearly';

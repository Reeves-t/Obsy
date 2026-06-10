import { Platform } from 'react-native';

/**
 * RevenueCat configuration (OBS-10 Cluster B / OBS-16).
 *
 * Final values confirmed by the board on 2026-06-10. Public SDK keys are safe to
 * ship in the client. The board supplied a single TEST key; production per-platform
 * keys (appl_… / goog_…) must replace these before release.
 */

// TODO(OBS-16): replace with production iOS / Android public SDK keys before launch.
const RC_TEST_KEY = 'test_PHqXuLhLtHr1PIEnkFrCadoHyLp';

export const REVENUECAT_API_KEY: string = Platform.select({
  ios: RC_TEST_KEY,
  android: RC_TEST_KEY,
  default: RC_TEST_KEY,
}) as string;

/** Entitlement identifier checked in code (display name: "Obsy Plus"). */
export const ENTITLEMENT_ID = 'plus';

/** RevenueCat offering id holding the Plus packages. */
export const OFFERING_ID = 'default';

/** App Store Connect / RevenueCat product identifiers (source of truth). */
export const PRODUCT_ID_MONTHLY = 'obsy.plus.monthly';
export const PRODUCT_ID_YEARLY = 'obsy.plus.yearly';

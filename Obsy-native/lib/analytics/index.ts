import AsyncStorage from '@react-native-async-storage/async-storage';
import { AnalyticsEventMap, AnalyticsEventName } from './events';

/**
 * Provider-agnostic analytics façade (OBS-20).
 *
 * Call sites use `track()` and never import a vendor SDK directly, so the
 * provider can be swapped or activated without touching instrumentation. The
 * default sink is a no-op in production / a console logger in development. The
 * real provider (PostHog, EU data residency) is injected at startup via
 * `registerAnalyticsSink()` once the SDK is installed and a project key is
 * configured — see lib/analytics/README.md for the 2-step activation.
 *
 * Privacy: analytics is opt-out (default on), classified as Usage / Diagnostics
 * data, sends NO PII, and uses no advertising identifier or cross-app tracking,
 * so it does not require an App Tracking Transparency prompt.
 */

export type AnalyticsSink = {
    capture: (event: string, properties?: Record<string, unknown>) => void;
    identify?: (distinctId: string) => void;
    reset?: () => void;
};

const OPT_OUT_KEY = 'analytics_opt_out';

let sink: AnalyticsSink | null = null;
let enabled = true; // opt-out model: flips to false only if the user opts out
let initialized = false;

const devSink: AnalyticsSink = {
    capture: (event, properties) => console.log('[analytics]', event, properties ?? {}),
};

/**
 * Inject the real provider sink (e.g. PostHog). Call once, before initAnalytics,
 * from the SDK activation point. Passing null falls back to the default sink.
 */
export function registerAnalyticsSink(next: AnalyticsSink | null): void {
    sink = next;
}

/** Resolve the persisted opt-out and pick a default sink. Idempotent. */
export async function initAnalytics(): Promise<void> {
    if (initialized) return;
    initialized = true;
    try {
        const optedOut = await AsyncStorage.getItem(OPT_OUT_KEY);
        enabled = optedOut !== 'true';
    } catch {
        enabled = true;
    }
    // If no provider sink was registered, log to the console in dev and stay
    // silent in production.
    if (!sink && __DEV__) sink = devSink;
}

export function isAnalyticsEnabled(): boolean {
    return enabled;
}

/** Toggle analytics consent (opt-out). Persists across launches. */
export async function setAnalyticsEnabled(next: boolean): Promise<void> {
    enabled = next;
    try {
        await AsyncStorage.setItem(OPT_OUT_KEY, next ? 'false' : 'true');
    } catch {
        // best-effort persistence
    }
    if (!next) {
        try {
            sink?.reset?.();
        } catch {
            // ignore
        }
    }
}

/**
 * Type-safe funnel event. Required properties are enforced per event by
 * AnalyticsEventMap. No-ops when the user has opted out or no sink is active.
 */
export function track<E extends AnalyticsEventName>(
    event: E,
    ...args: AnalyticsEventMap[E] extends undefined ? [] : [properties: AnalyticsEventMap[E]]
): void {
    if (!enabled || !sink) return;
    const properties = args[0] as Record<string, unknown> | undefined;
    try {
        sink.capture(event, properties);
    } catch (err) {
        if (__DEV__) console.warn('[analytics] capture failed:', err);
    }
}

/** Associate subsequent events with a stable user id (Supabase user id). */
export function identifyUser(distinctId: string): void {
    if (!enabled || !sink) return;
    try {
        sink.identify?.(distinctId);
    } catch {
        // best-effort
    }
}

/** Clear the identity (sign-out). */
export function resetAnalytics(): void {
    try {
        sink?.reset?.();
    } catch {
        // best-effort
    }
}

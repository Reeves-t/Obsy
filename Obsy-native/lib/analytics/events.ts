/**
 * Launch-funnel analytics events (OBS-20 / OBS-1 launch plan §4).
 *
 * Single source of truth for the event names + property shapes we instrument.
 * Keep this minimal and privacy-respecting: NO PII in any property
 * (no email, display name, note/journal text, photo, transcript, or free text).
 * Properties are low-cardinality enums / booleans only.
 *
 * North-Star funnel:
 *   install -> onboarding_completed -> first capture_created -> insight_viewed -> purchase_completed
 */

export type AuthMethod = 'account' | 'guest';
export type CaptureType = 'photo' | 'text' | 'voice' | 'link';
export type InsightPeriod = 'daily' | 'weekly' | 'monthly';
export type PlanInterval = 'monthly' | 'yearly';

/**
 * Map of event name -> allowed property shape.
 * `undefined` means the event takes no properties.
 */
export type AnalyticsEventMap = {
    onboarding_started: undefined;
    onboarding_completed: { auth_method: AuthMethod };
    capture_created: { type: CaptureType; is_first: boolean };
    mood_logged: undefined;
    insight_viewed: { period: InsightPeriod };
    paywall_shown: { trigger: string };
    purchase_started: { plan: PlanInterval };
    purchase_completed: { plan: PlanInterval };
    purchase_restored: undefined;
};

export type AnalyticsEventName = keyof AnalyticsEventMap;

/**
 * Canonical, externally-hosted legal document URLs.
 *
 * Apple requires a LIVE, publicly reachable Privacy Policy URL (App Store
 * Connect metadata) and a functional EULA/Terms link adjacent to the paywall.
 *
 * These are published on the Daystruct site (the parent company), which hosts
 * legal and support for every Daystruct app. The source content lives in
 * PRIVACY_POLICY.md / TERMS_OF_SERVICE.md — when either changes, update the
 * published page in the Daystruct repo to match.
 *
 * Previously pointed at obsy.app, which is registered but serves 403 on every
 * path; the links were dead in-app and would have failed App Review.
 */
export const PRIVACY_POLICY_URL = 'https://www.daystruct.ai/legal/obsy/privacy';
export const TERMS_OF_SERVICE_URL = 'https://www.daystruct.ai/legal/obsy/terms';

/** Support hub for Obsy — the App Store Connect Support URL. */
export const SUPPORT_URL = 'https://www.daystruct.ai/support/obsy';

/** Sign-in, password reset, and account recovery help. */
export const LOGIN_HELP_URL = 'https://www.daystruct.ai/support/login-help';

/** Export, deletion, analytics opt-out, and written data requests. */
export const DATA_CONTROLS_URL = 'https://www.daystruct.ai/support/obsy/data';

/** Published support mailbox, shown in the legal documents. */
export const SUPPORT_EMAIL = 'support@daystruct.ai';

/**
 * Deep link that opens the App Store review sheet for Obsy.
 * The id is the ASC app id also configured as `submit.production.ios.ascAppId`
 * in eas.json — keep the two in sync if the listing ever changes.
 */
export const APP_STORE_APP_ID = '6758523822';
export const APP_STORE_REVIEW_URL = `https://apps.apple.com/app/id${APP_STORE_APP_ID}?action=write-review`;

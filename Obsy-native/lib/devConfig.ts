/**
 * Dev configuration for in-app developer tooling.
 *
 * Features gated behind this module are only visible to dev accounts.
 * No subscription tier changes or DB migrations needed — purely client-side.
 *
 * To add a dev account: append the lowercase email to DEV_EMAILS.
 */

const DEV_EMAILS: string[] = [
    'darrellreeves@icloud.com',
];

/**
 * Returns true if the given email belongs to a dev account.
 * Case-insensitive comparison.
 */
export function isDevUser(email: string | null | undefined): boolean {
    if (!email) return false;
    return DEV_EMAILS.includes(email.toLowerCase().trim());
}

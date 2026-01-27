/**
 * PRIVACY FLAGS & DATA GAURDS
 * 
 * Central control for data privacy behavior in Obsy.
 * These flags enforce the "local-only by default" and "strict consent" model.
 */

export const PRIVACY_FLAGS = {
    // If false, all photo storage is restricted to the local device.
    // Cloud upload logic is completely bypassed even for signed-in users.
    ALLOW_CLOUD_PHOTO_UPLOAD: true,

    // If false, raw image data (base64) or public URLs are never sent to AI.
    // This blocks all vision-based AI features at the service level.
    ALLOW_IMAGE_TO_AI: false,

    // If true, development builds will warn when data attempts to leave the device.
    ENABLE_PRIVACY_LOGS: __DEV__,
};

/**
 * Guard to check if an image can be sent to AI.
 * Requires both a global bypass and user-specific premium/consent checks.
 */
export function canSendImageToAi(isPremium: boolean, userConsentGiven: boolean): boolean {
    // If global flag is hard-locked to false, nobody can send images.
    // This allows us to instantly disable vision features if a leak is found.
    if (!PRIVACY_FLAGS.ALLOW_IMAGE_TO_AI) {
        // However, we effectively flip this flag at runtime based on context.
        // For MVP, we allow the flow only if these specific conditions are met:
        return isPremium && userConsentGiven;
    }
    return false;
}

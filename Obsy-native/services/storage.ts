import { supabase } from '@/lib/supabase';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';

type SubscriptionTier = 'free' | 'plus'; // OBS-19: free|plus only

/**
 * Uploads a local capture image to Supabase Storage.
 * Only the paid Plus tier gets cloud backup.
 *
 * @param localUri - Local file URI of the image
 * @param userId - User ID for storage path
 * @param tier - Subscription tier (optional, defaults to allowing upload for backwards compatibility)
 */
export async function uploadCaptureImage(
    localUri: string,
    userId: string,
    tier?: SubscriptionTier
): Promise<string | null> {
    // Cloud backup is Plus-only; skip upload for the free tier.
    if (tier === 'free') {
        console.log('[Storage] Skipping cloud upload for', tier, 'tier');
        return null;
    }
    try {
        console.log('[Storage] Starting upload for:', localUri);
        console.log('[Storage] User ID:', userId);

        // 0. Verify file exists before attempting upload
        const fileInfo = await FileSystem.getInfoAsync(localUri);
        const directoryPath = localUri.substring(0, localUri.lastIndexOf('/'));
        console.log('[Storage] Full URI:', localUri);
        console.log('[Storage] Directory:', directoryPath);

        if (!fileInfo.exists) {
            console.error('[Storage] File does not exist at path:', localUri);
            // Try to list directory contents to diagnose path issues
            try {
                const dirContents = await FileSystem.readDirectoryAsync(directoryPath);
                console.log('[Storage] Directory contents:', dirContents.slice(0, 10));
            } catch (dirError) {
                console.error('[Storage] Could not read directory:', dirError);
            }
            return null;
        }
        console.log('[Storage] File exists, size:', fileInfo.size, 'bytes');

        // 1. Read file as base64
        const base64 = await FileSystem.readAsStringAsync(localUri, {
            encoding: FileSystem.EncodingType.Base64,
        });
        console.log('[Storage] File read as base64, length:', base64.length);

        // 2. Extract filename and extension with proper content type mapping
        const filename = localUri.split('/').pop() || `capture_${Date.now()}.jpg`;
        const fileExt = (filename.split('.').pop() || 'jpg').toLowerCase();
        // Map common image extensions to MIME types
        const typeMap: Record<string, string> = {
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            heic: 'image/heic',
            heif: 'image/heif',
            webp: 'image/webp',
            gif: 'image/gif'
        };
        const contentType = typeMap[fileExt] || 'image/jpeg';
        console.log('[Storage] Filename:', filename, 'Extension:', fileExt, 'Content-Type:', contentType);

        // 3. Construct path: userId/filename (first segment must be the owner uid for storage RLS)
        const storagePath = `${userId}/${filename}`;
        console.log('[Storage] Storage path:', storagePath);

        // 4. Upload to 'entries' bucket
        const { data, error } = await supabase.storage
            .from('entries')
            .upload(storagePath, decode(base64), {
                contentType,
                upsert: true
            });

        if (error) {
            console.error('[Storage] Upload error:', error.message);
            console.error('[Storage] Upload error details:', JSON.stringify(error));
            return null;
        }

        console.log('[Storage] Upload success. Path:', data.path);
        // Verify the returned path contains '/' (owner uid prefix required for storage RLS)
        if (!data.path.includes('/')) {
            console.warn('[Storage] Warning: Returned path does not contain "/" - may cause access-policy issues');
        }
        return data.path;

    } catch (error) {
        console.error('[Storage] Unexpected error during upload:', error);
        if (error instanceof Error) {
            console.error('[Storage] Error name:', error.name);
            console.error('[Storage] Error message:', error.message);
            console.error('[Storage] Error stack:', error.stack);
        }
        return null;
    }
}

// --- Entry image access (private `entries` bucket → signed URLs) ---------------
// The `entries` bucket is PRIVATE (OBS-20, migration 20260616000002). Photos must
// be read via short-lived signed URLs minted with the owner's JWT, authorised by
// the "Authenticated users can read own entries" storage policy. Mirrors the
// voice-notes pattern in services/voiceNotes.ts.
const ENTRY_BUCKET = 'entries';
// 7 days: long enough that URLs persisted in the capture store survive across
// sessions until the next fetch refreshes them, while keeping access revocable.
const ENTRY_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;

/** Normalise a stored `photo_path` (bare path or legacy public URL) to a storage path. */
export function entryStoragePath(photoPath: string | null | undefined): string | null {
    if (!photoPath) return null;
    // New format: already a bare storage path (`<uid>/<file>`).
    if (!/^https?:\/\//i.test(photoPath)) {
        return photoPath.replace(/^\/+/, '') || null;
    }
    // Legacy format: .../object/public/entries/<path>?<query> -> <path>.
    const marker = `/${ENTRY_BUCKET}/`;
    const idx = photoPath.indexOf(marker);
    if (idx === -1) return null;
    let p = photoPath.slice(idx + marker.length);
    const q = p.indexOf('?');
    if (q !== -1) p = p.slice(0, q);
    try { p = decodeURIComponent(p); } catch { /* leave as-is */ }
    return p || null;
}

/** Resolve a single cloud-backed entry photo to a signed URL (null if unresolvable). */
export async function getEntryImageUrl(photoPath: string | null | undefined): Promise<string | null> {
    const path = entryStoragePath(photoPath);
    if (!path) return null;
    const { data, error } = await supabase.storage
        .from(ENTRY_BUCKET)
        .createSignedUrl(path, ENTRY_SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) {
        console.warn('[storage] entry signed url error:', error?.message);
        return null;
    }
    return data.signedUrl;
}

/**
 * Batch-resolve cloud-backed entry photos to signed URLs in a single request.
 * Returns a Map keyed by the ORIGINAL `photo_path` passed in.
 */
export async function getEntryImageUrls(photoPaths: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const items = photoPaths
        .map((original) => ({ original, path: entryStoragePath(original) }))
        .filter((x): x is { original: string; path: string } => !!x.path);
    if (items.length === 0) return result;

    const { data, error } = await supabase.storage
        .from(ENTRY_BUCKET)
        .createSignedUrls(items.map((i) => i.path), ENTRY_SIGNED_URL_TTL_SECONDS);
    if (error || !data) {
        console.warn('[storage] entry signed urls error:', error?.message);
        return result;
    }
    data.forEach((row, i) => {
        if (row?.signedUrl && !row.error) result.set(items[i].original, row.signedUrl);
    });
    return result;
}

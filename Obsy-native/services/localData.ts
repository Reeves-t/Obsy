import * as FileSystem from 'expo-file-system/legacy';
import { useCaptureStore } from '@/lib/captureStore';
import { useInsightCardStore } from '@/lib/insightCardStore';

/**
 * Local data maintenance.
 *
 * Photos live on the device, not in our cloud (see PRIVACY_POLICY.md) — these
 * directories are the whole of it. "Clear local data" in Settings promises to
 * remove them, so this is what has to actually run.
 *
 * Deliberately NOT touched here:
 *  - Cloud entries. Signed-in users keep their journal; the Settings copy says so.
 *  - Saved insight cards (`savedCards`). Those are user-created artifacts stored
 *    only on the device, so clearing them would be silent data loss. Only the
 *    generation `cache` — recomputable by definition — is dropped.
 *  - Preferences: theme, aurora background, time format, and so on.
 */

const CAPTURES_DIR = `${FileSystem.documentDirectory}captures/`;
const THUMBNAILS_DIR = `${FileSystem.documentDirectory}thumbnails/`;

export interface LocalDataUsage {
    /** Total bytes held by locally stored images. */
    bytes: number;
    /** Number of image files on disk (captures + thumbnails). */
    fileCount: number;
}

async function directoryUsage(dir: string): Promise<LocalDataUsage> {
    try {
        const info = await FileSystem.getInfoAsync(dir);
        if (!info.exists) return { bytes: 0, fileCount: 0 };

        const entries = await FileSystem.readDirectoryAsync(dir);
        let bytes = 0;
        let fileCount = 0;
        for (const name of entries) {
            const fileInfo = await FileSystem.getInfoAsync(`${dir}${name}`);
            if (fileInfo.exists && !fileInfo.isDirectory) {
                bytes += fileInfo.size ?? 0;
                fileCount += 1;
            }
        }
        return { bytes, fileCount };
    } catch (error) {
        console.warn('[LocalData] Failed to size', dir, error);
        return { bytes: 0, fileCount: 0 };
    }
}

/** How much space locally stored images currently occupy. */
export async function getLocalDataUsage(): Promise<LocalDataUsage> {
    const [captures, thumbnails] = await Promise.all([
        directoryUsage(CAPTURES_DIR),
        directoryUsage(THUMBNAILS_DIR),
    ]);
    return {
        bytes: captures.bytes + thumbnails.bytes,
        fileCount: captures.fileCount + thumbnails.fileCount,
    };
}

async function clearDirectory(dir: string): Promise<void> {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) return;
    // Delete the directory outright, then recreate it — deleting entries one by
    // one leaves the app in a half-cleared state if any single delete throws.
    await FileSystem.deleteAsync(dir, { idempotent: true });
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
}

export interface ClearLocalDataResult {
    /** Bytes reclaimed from the device. */
    bytesFreed: number;
    /** Image files removed. */
    filesRemoved: number;
}

/**
 * Delete locally stored photos and drop recomputable caches.
 *
 * Callers are responsible for warning the user first — this is irreversible for
 * any photo that was never backed up to the cloud, which is the default.
 *
 * @param options.resetCaptureState clear in-memory capture rows too. Pass true
 *   for signed-in users, whose entries re-sync from the cloud on next fetch;
 *   pass false when signed out, where the local rows are the only copy and
 *   dropping them would destroy the journal along with the photos.
 */
export async function clearLocalData(
    options: { resetCaptureState: boolean } = { resetCaptureState: false },
): Promise<ClearLocalDataResult> {
    const before = await getLocalDataUsage();

    await clearDirectory(CAPTURES_DIR);
    await clearDirectory(THUMBNAILS_DIR);

    // Drop memoized insight-card generations; saved cards are left in place.
    useInsightCardStore.setState({ cache: {} });

    if (options.resetCaptureState) {
        useCaptureStore.getState().clearCaptures();
    }

    const after = await getLocalDataUsage();

    return {
        bytesFreed: Math.max(0, before.bytes - after.bytes),
        filesRemoved: Math.max(0, before.fileCount - after.fileCount),
    };
}

/** Human-readable byte size, e.g. "12.4 MB". */
export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

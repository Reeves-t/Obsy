import { supabase } from '@/lib/supabase';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';

/**
 * Uploads a local capture image to Supabase Storage.
 * Essential for album sharing so other users can see the photo.
 */
export async function uploadCaptureImage(localUri: string, userId: string): Promise<string | null> {
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

        // 3. Construct path: userId/filename (this format is required for album display)
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
        // Verify the returned path contains '/' (required for SharedCanvas filtering)
        if (!data.path.includes('/')) {
            console.warn('[Storage] Warning: Returned path does not contain "/" - may cause album display issues');
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

import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

/**
 * Image Optimization Service
 * 
 * Implements tiered storage like BeReal:
 * - Thumbnail (200px): Grid views, floating backgrounds (~10KB)
 * - Preview (800px): Detail views, insights (~80KB)  
 * - Full-res (1440px max): Cloud storage, export (~200KB)
 * 
 * Total storage reduction: ~90% vs raw camera output
 */

// Directory for optimized images
const CAPTURES_DIR = `${FileSystem.documentDirectory}captures/`;
const THUMBNAILS_DIR = `${FileSystem.documentDirectory}thumbnails/`;

// Quality settings (WebP/HEIC where supported, JPEG fallback)
const QUALITY_THUMBNAIL = 0.6;
const QUALITY_PREVIEW = 0.75;
const QUALITY_FULL = 0.8;

// Resolution tiers
const SIZE_THUMBNAIL = 200;
const SIZE_PREVIEW = 800;
const SIZE_FULL = 1440;

// Use modern format where supported
const getOutputFormat = (): ImageManipulator.SaveFormat => {
    // expo-image-manipulator supports jpeg, png, webp
    // WebP is ~30% smaller than JPEG with same quality
    // Note: HEIC would need a separate library
    return 'webp';
};

export interface OptimizedImages {
    thumbnail: string;  // Local path to thumbnail
    preview: string;    // Local path to preview
    fullRes: string;    // Local path to full-res (for upload)
    originalDeleted: boolean;
}

export interface ImageTier {
    path: string;
    width: number;
    height: number;
    size: number; // bytes
}

/**
 * Ensure directories exist
 */
async function ensureDirectories(): Promise<void> {
    const capturesInfo = await FileSystem.getInfoAsync(CAPTURES_DIR);
    if (!capturesInfo.exists) {
        await FileSystem.makeDirectoryAsync(CAPTURES_DIR, { intermediates: true });
    }
    
    const thumbnailsInfo = await FileSystem.getInfoAsync(THUMBNAILS_DIR);
    if (!thumbnailsInfo.exists) {
        await FileSystem.makeDirectoryAsync(THUMBNAILS_DIR, { intermediates: true });
    }
}

/**
 * Generate a unique filename with timestamp
 */
function generateFilename(extension: string = 'webp'): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `capture_${timestamp}_${random}.${extension}`;
}

/**
 * Resize and compress an image to a target size
 */
async function resizeImage(
    sourceUri: string,
    maxDimension: number,
    quality: number,
    outputPath: string
): Promise<ImageTier> {
    const format = getOutputFormat();
    
    // Get original dimensions to maintain aspect ratio
    const manipResult = await ImageManipulator.manipulateAsync(
        sourceUri,
        [{ resize: { width: maxDimension } }], // Resize maintaining aspect ratio
        {
            compress: quality,
            format: format === 'webp' ? ImageManipulator.SaveFormat.WEBP : ImageManipulator.SaveFormat.JPEG,
        }
    );
    
    // Move to final destination
    await FileSystem.moveAsync({
        from: manipResult.uri,
        to: outputPath
    });
    
    // Get file size
    const fileInfo = await FileSystem.getInfoAsync(outputPath);
    
    return {
        path: outputPath,
        width: manipResult.width,
        height: manipResult.height,
        size: fileInfo.exists && 'size' in fileInfo ? fileInfo.size : 0
    };
}

/**
 * Process a raw camera image into optimized tiers
 * 
 * @param rawImageUri - URI from camera (file://)
 * @returns Paths to thumbnail, preview, and full-res versions
 */
export async function optimizeCapture(rawImageUri: string): Promise<OptimizedImages> {
    await ensureDirectories();
    
    const baseFilename = generateFilename();
    const thumbnailFilename = `thumb_${baseFilename}`;
    const previewFilename = `prev_${baseFilename}`;
    const fullFilename = `full_${baseFilename}`;
    
    console.log('[ImageOptimizer] Processing:', rawImageUri);
    
    try {
        // Generate all three tiers in parallel
        const [thumbnail, preview, fullRes] = await Promise.all([
            // Thumbnail: 200px, low quality
            resizeImage(
                rawImageUri,
                SIZE_THUMBNAIL,
                QUALITY_THUMBNAIL,
                `${THUMBNAILS_DIR}${thumbnailFilename}`
            ),
            // Preview: 800px, medium quality
            resizeImage(
                rawImageUri,
                SIZE_PREVIEW,
                QUALITY_PREVIEW,
                `${CAPTURES_DIR}${previewFilename}`
            ),
            // Full-res: 1440px, higher quality (for cloud upload)
            resizeImage(
                rawImageUri,
                SIZE_FULL,
                QUALITY_FULL,
                `${CAPTURES_DIR}${fullFilename}`
            ),
        ]);
        
        console.log('[ImageOptimizer] Generated tiers:');
        console.log(`  Thumbnail: ${thumbnail.width}x${thumbnail.height}, ${(thumbnail.size / 1024).toFixed(1)}KB`);
        console.log(`  Preview: ${preview.width}x${preview.height}, ${(preview.size / 1024).toFixed(1)}KB`);
        console.log(`  Full-res: ${fullRes.width}x${fullRes.height}, ${(fullRes.size / 1024).toFixed(1)}KB`);
        
        // Delete the original raw image to save space
        try {
            await FileSystem.deleteAsync(rawImageUri, { idempotent: true });
            console.log('[ImageOptimizer] Deleted original raw image');
        } catch (deleteError) {
            console.warn('[ImageOptimizer] Could not delete original:', deleteError);
        }
        
        return {
            thumbnail: thumbnail.path,
            preview: preview.path,
            fullRes: fullRes.path,
            originalDeleted: true
        };
        
    } catch (error) {
        console.error('[ImageOptimizer] Error processing image:', error);
        throw error;
    }
}

/**
 * Get the thumbnail path for a preview image
 */
export function getThumbnailPath(previewPath: string): string {
    const filename = previewPath.split('/').pop() || '';
    return `${THUMBNAILS_DIR}thumb_${filename.replace('prev_', '')}`;
}

/**
 * Check if a thumbnail exists for a capture
 */
export async function thumbnailExists(previewPath: string): Promise<boolean> {
    const thumbPath = getThumbnailPath(previewPath);
    const info = await FileSystem.getInfoAsync(thumbPath);
    return info.exists;
}

/**
 * Clean up old thumbnails not associated with any capture
 * Call this periodically (e.g., on app startup)
 */
export async function cleanupOrphanedThumbnails(validCaptureIds: string[]): Promise<number> {
    try {
        const thumbnails = await FileSystem.readDirectoryAsync(THUMBNAILS_DIR);
        let cleaned = 0;
        
        for (const thumb of thumbnails) {
            // Extract capture ID from thumbnail filename
            const isOrphaned = !validCaptureIds.some(id => thumb.includes(id));
            if (isOrphaned) {
                await FileSystem.deleteAsync(`${THUMBNAILS_DIR}${thumb}`, { idempotent: true });
                cleaned++;
            }
        }
        
        console.log(`[ImageOptimizer] Cleaned ${cleaned} orphaned thumbnails`);
        return cleaned;
    } catch (error) {
        console.warn('[ImageOptimizer] Cleanup error:', error);
        return 0;
    }
}

/**
 * Get storage usage stats
 */
export async function getStorageStats(): Promise<{
    thumbnailsSize: number;
    capturesSize: number;
    totalSize: number;
    thumbnailCount: number;
    captureCount: number;
}> {
    let thumbnailsSize = 0;
    let capturesSize = 0;
    let thumbnailCount = 0;
    let captureCount = 0;
    
    try {
        const thumbnails = await FileSystem.readDirectoryAsync(THUMBNAILS_DIR);
        for (const file of thumbnails) {
            const info = await FileSystem.getInfoAsync(`${THUMBNAILS_DIR}${file}`);
            if (info.exists && 'size' in info) {
                thumbnailsSize += info.size;
                thumbnailCount++;
            }
        }
    } catch {}
    
    try {
        const captures = await FileSystem.readDirectoryAsync(CAPTURES_DIR);
        for (const file of captures) {
            const info = await FileSystem.getInfoAsync(`${CAPTURES_DIR}${file}`);
            if (info.exists && 'size' in info) {
                capturesSize += info.size;
                captureCount++;
            }
        }
    } catch {}
    
    return {
        thumbnailsSize,
        capturesSize,
        totalSize: thumbnailsSize + capturesSize,
        thumbnailCount,
        captureCount
    };
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

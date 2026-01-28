import { supabase } from "@/lib/supabase";
import { ArchiveInsight, ArchiveInsightType } from "@/types/insights";
import { format, startOfWeek, endOfWeek } from "date-fns";

// Error codes for specific database errors
export const ARCHIVE_ERROR_CODES = {
    COLUMN_NOT_FOUND: '42703',
    RLS_VIOLATION: '42501',
    UNIQUE_CONSTRAINT: '23505',
    TABLE_NOT_FOUND: '42P01',
    INVALID_INPUT: 'VALIDATION_ERROR',
    AUTH_REQUIRED: 'AUTH_REQUIRED',
    UNKNOWN: 'UNKNOWN_ERROR',
} as const;

export interface ArchiveError {
    code: string;
    message: string;
    details?: string;
    hint?: string;
}

export interface ArchiveResult {
    data: ArchiveInsight | null;
    error: ArchiveError | null;
}

export interface ArchiveInput {
    userId: string;
    type: ArchiveInsightType;
    insightText: string;
    relatedCaptureIds: string[];
    date: Date; // The reference date (e.g., the day, or any day in the week/month)
    tone?: string;
    albumId?: string;
    albumName?: string;
    tagName?: string;
    tagGroupId?: string;
    tags?: string[];
}

// UUID v4 validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(str: string): boolean {
    return UUID_REGEX.test(str);
}

function generateErrorId(): string {
    return `ERR_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function formatSupabaseError(error: any, context: { type: ArchiveInsightType; userId: string }): ArchiveError {
    const errorId = generateErrorId();
    const userIdPrefix = context.userId.substring(0, 8);

    console.error(`[Archive Error ${errorId}]`, {
        type: context.type,
        userIdPrefix,
        timestamp: new Date().toISOString(),
        code: error?.code,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
    });

    // Map Supabase error codes to user-friendly messages
    switch (error?.code) {
        case ARCHIVE_ERROR_CODES.COLUMN_NOT_FOUND:
            return {
                code: error.code,
                message: 'Database schema is outdated. Please contact support.',
                details: `Column "${error.message?.match(/column "(\w+)"/)?.[1] || 'unknown'}" not found. Migration may be pending.`,
                hint: 'Apply pending database migrations.',
            };
        case ARCHIVE_ERROR_CODES.RLS_VIOLATION:
            return {
                code: error.code,
                message: 'You do not have permission to save this insight.',
                details: 'Row Level Security policy violation.',
                hint: 'Ensure you are logged in with the correct account.',
            };
        case ARCHIVE_ERROR_CODES.UNIQUE_CONSTRAINT:
            return {
                code: error.code,
                message: 'This insight has already been saved.',
                details: 'Duplicate entry detected.',
            };
        case ARCHIVE_ERROR_CODES.TABLE_NOT_FOUND:
            return {
                code: error.code,
                message: 'Archive feature is not available. Please contact support.',
                details: 'The insights_archive table does not exist.',
                hint: 'Apply the insights_archive migration.',
            };
        default:
            return {
                code: error?.code || ARCHIVE_ERROR_CODES.UNKNOWN,
                message: error?.message || 'An unexpected error occurred while saving the insight.',
                details: error?.details,
                hint: error?.hint,
            };
    }
}

function validateArchiveInput(input: ArchiveInput): ArchiveError | null {
    // Validate userId
    if (!input.userId || !isValidUUID(input.userId)) {
        return {
            code: ARCHIVE_ERROR_CODES.INVALID_INPUT,
            message: 'Invalid user ID format.',
            details: 'User ID must be a valid UUID.',
        };
    }

    // Validate type
    const validTypes: ArchiveInsightType[] = ['daily', 'weekly', 'monthly', 'album', 'tagging'];
    if (!validTypes.includes(input.type)) {
        return {
            code: ARCHIVE_ERROR_CODES.INVALID_INPUT,
            message: 'Invalid insight type.',
            details: `Type must be one of: ${validTypes.join(', ')}`,
        };
    }

    // Validate insightText
    if (!input.insightText || input.insightText.trim().length === 0) {
        return {
            code: ARCHIVE_ERROR_CODES.INVALID_INPUT,
            message: 'Insight text cannot be empty.',
        };
    }

    // Validate relatedCaptureIds is an array
    if (!Array.isArray(input.relatedCaptureIds)) {
        return {
            code: ARCHIVE_ERROR_CODES.INVALID_INPUT,
            message: 'Related capture IDs must be an array.',
        };
    }

    // Validate date
    if (!(input.date instanceof Date) || isNaN(input.date.getTime())) {
        return {
            code: ARCHIVE_ERROR_CODES.INVALID_INPUT,
            message: 'Invalid date provided.',
        };
    }

    return null;
}

/**
 * Check database connectivity and authentication status
 */
export async function checkArchiveConnection(): Promise<{ connected: boolean; authenticated: boolean; error?: string }> {
    try {
        const { data: session } = await supabase.auth.getSession();

        if (!session?.session?.user) {
            return { connected: true, authenticated: false, error: 'User not authenticated' };
        }

        // Test a simple query to verify table access
        const { error } = await supabase
            .from('insights_archive')
            .select('id')
            .limit(1);

        if (error) {
            return { connected: false, authenticated: true, error: error.message };
        }

        return { connected: true, authenticated: true };
    } catch (err) {
        return { connected: false, authenticated: false, error: String(err) };
    }
}

/**
 * Archive an insight with detailed error handling.
 * Returns a structured result with either the archived insight or an error.
 */
export async function archiveInsightWithResult(input: ArchiveInput): Promise<ArchiveResult> {
    // Validate input before attempting database operation
    const validationError = validateArchiveInput(input);
    if (validationError) {
        console.error('[Archive Validation Error]', {
            type: input.type,
            userIdPrefix: input.userId?.substring(0, 8) || 'missing',
            error: validationError,
        });
        return { data: null, error: validationError };
    }

    const {
        userId,
        type,
        insightText,
        relatedCaptureIds,
        date,
        tone,
        albumId,
        albumName,
        tagName,
        tagGroupId
    } = input;

    // 1. Build Title & Date Scope
    let title = "";
    let dateScope = "";

    const dateStr = format(date, "MMM d");

    switch (type) {
        case 'daily':
            title = `Daily Insight • ${dateStr}`;
            dateScope = format(date, "yyyy-MM-dd");
            break;
        case 'weekly':
            const start = startOfWeek(date, { weekStartsOn: 0 });
            const end = endOfWeek(date, { weekStartsOn: 0 });
            const startStr = format(start, "MMM d");
            const endStr = format(end, "MMM d");
            title = `Weekly Insight • ${startStr}–${endStr}`;
            dateScope = `${format(start, "yyyy-MM-dd")} to ${format(end, "yyyy-MM-dd")}`;
            break;
        case 'monthly':
            title = `Monthly Insight • ${format(date, "MMMM")}`;
            dateScope = format(date, "yyyy-MM");
            break;
        case 'album':
            title = `Album Insight • ${albumName || 'Album'}`;
            dateScope = format(date, "yyyy-MM-dd");
            break;
        case 'tagging':
            title = `Tagging Insight • ${tagName || 'Tag'}`;
            dateScope = format(date, "yyyy-MM-dd");
            break;
    }

    // 2. Build Summary (first ~160 chars)
    const summary = insightText.length > 160
        ? insightText.substring(0, 160).trim() + "..."
        : insightText;

    // 3. Insert into DB
    const { data, error } = await supabase
        .from('insights_archive')
        .insert({
            user_id: userId,
            type,
            title,
            summary,
            body: insightText,
            date_scope: dateScope,
            album_id: albumId || null,
            tag_group_id: tagGroupId || null,
            related_capture_ids: relatedCaptureIds,
            tone: tone || null,
            tags: input.tags || [],
            saved_at: new Date().toISOString()
        })
        .select()
        .single();

    if (error) {
        return {
            data: null,
            error: formatSupabaseError(error, { type, userId })
        };
    }

    return { data: data as ArchiveInsight, error: null };
}

/**
 * Archive an insight (backward compatible version).
 * Returns the archived insight or null on error.
 * Use archiveInsightWithResult for detailed error information.
 */
export async function archiveInsight(input: ArchiveInput): Promise<ArchiveInsight | null> {
    const result = await archiveInsightWithResult(input);
    return result.data;
}

export async function fetchArchives(userId: string): Promise<ArchiveInsight[]> {
    const { data, error } = await supabase
        .from('insights_archive')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error fetching archives:", error);
        return [];
    }

    return data as ArchiveInsight[];
}

export async function fetchArchiveById(id: string): Promise<ArchiveInsight | null> {
    const { data, error } = await supabase
        .from('insights_archive')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        console.error("Error fetching archive detail:", error);
        return null;
    }

    return data as ArchiveInsight;
}

export async function countArchivedInsights(userId: string): Promise<number> {
    const { count, error } = await supabase
        .from('insights_archive')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('deleted_at', null);

    if (error) {
        console.error("Error counting archived insights:", error);
        return 0;
    }

    return count || 0;
}

export async function deleteArchivedInsight(id: string): Promise<boolean> {
    const { error } = await supabase
        .from('insights_archive')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);

    if (error) {
        console.error("Error soft-deleting archived insight:", error);
        return false;
    }

    return true;
}

export async function fetchRecycleBin(userId: string): Promise<ArchiveInsight[]> {
    const { data, error } = await supabase
        .from('insights_archive')
        .select('*')
        .eq('user_id', userId)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

    if (error) {
        console.error("Error fetching recycle bin:", error);
        return [];
    }

    return data as ArchiveInsight[];
}

export async function restoreArchivedInsight(id: string): Promise<boolean> {
    const { error } = await supabase
        .from('insights_archive')
        .update({ deleted_at: null })
        .eq('id', id);

    if (error) {
        console.error("Error restoring archived insight:", error);
        return false;
    }

    return true;
}

export async function permanentlyDeleteInsight(id: string): Promise<boolean> {
    const { error } = await supabase
        .from('insights_archive')
        .delete()
        .eq('id', id);

    if (error) {
        console.error("Error permanently deleting insight:", error);
        return false;
    }

    return true;
}

export async function purgeExpiredRecycleBin(userId: string): Promise<void> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { error } = await supabase
        .from('insights_archive')
        .delete()
        .eq('user_id', userId)
        .lt('deleted_at', thirtyDaysAgo.toISOString());

    if (error) {
        console.error("Error purging recycle bin:", error);
    }
}

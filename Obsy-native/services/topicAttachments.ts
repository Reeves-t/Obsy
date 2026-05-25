import { supabase } from '@/lib/supabase';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import { decode } from 'base64-arraybuffer';

export type AttachmentKind = 'document' | 'image';
export type ExtractionStatus = 'pending' | 'processing' | 'done' | 'failed' | 'skipped';

export interface TopicAttachment {
    id: string;
    user_id: string;
    topic_id: string;
    file_name: string;
    storage_path: string;
    mime_type: string | null;
    size_bytes: number | null;
    kind: AttachmentKind;
    created_at: string;
    deleted_at: string | null;
    extracted_text: string | null;
    extraction_status: ExtractionStatus;
    extraction_error: string | null;
    extracted_at: string | null;
}

export interface PickedFile {
    uri: string;
    name: string;
    mimeType: string | null;
    size: number | null;
    kind: AttachmentKind;
}

const BUCKET = 'topic-attachments';

// ── Pickers ─────────────────────────────────────────────────

export async function pickDocument(): Promise<PickedFile | null> {
    const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
    });
    if (result.canceled || !result.assets?.length) return null;
    const asset = result.assets[0];
    return {
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType ?? null,
        size: asset.size ?? null,
        kind: 'document',
    };
}

export async function pickImage(): Promise<PickedFile | null> {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return null;

    const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
        allowsMultipleSelection: false,
    });
    if (result.canceled || !result.assets?.length) return null;
    const asset = result.assets[0];
    const name = asset.fileName || `photo_${Date.now()}.jpg`;
    return {
        uri: asset.uri,
        name,
        mimeType: asset.mimeType ?? 'image/jpeg',
        size: asset.fileSize ?? null,
        kind: 'image',
    };
}

// ── Upload + DB row ─────────────────────────────────────────

function extOf(name: string, fallback = 'bin'): string {
    const dot = name.lastIndexOf('.');
    if (dot < 0 || dot === name.length - 1) return fallback;
    return name.slice(dot + 1).toLowerCase();
}

export interface UploadResult {
    ok: boolean;
    attachment?: TopicAttachment;
    error?: string;
}

/**
 * Uploads a picked file to Supabase Storage and inserts a row in
 * `topic_attachments`. Returns the persisted attachment record on success.
 *
 * Storage layout: <user_id>/<topic_id>/<attachment_id>.<ext>
 */
export async function uploadTopicAttachment(
    topicId: string,
    file: PickedFile,
): Promise<UploadResult> {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) {
        return { ok: false, error: 'You need to be signed in to upload files.' };
    }

    // 1. Read file as base64 (expo-file-system legacy API).
    let base64: string;
    try {
        const info = await FileSystem.getInfoAsync(file.uri);
        if (!info.exists) {
            return { ok: false, error: 'File no longer exists on device.' };
        }
        base64 = await FileSystem.readAsStringAsync(file.uri, {
            encoding: FileSystem.EncodingType.Base64,
        });
    } catch (err: any) {
        return { ok: false, error: `Could not read file: ${err?.message || 'unknown error'}` };
    }

    // 2. Generate a stable storage path. The id will also be the DB row id —
    // must be a valid UUID since the column type is `uuid`. expo-crypto is
    // used here because globalThis.crypto.randomUUID isn't reliably present
    // in React Native's runtime.
    const attachmentId = Crypto.randomUUID();
    const ext = extOf(file.name, file.kind === 'image' ? 'jpg' : 'bin');
    const storagePath = `${userId}/${topicId}/${attachmentId}.${ext}`;
    const contentType = file.mimeType || (file.kind === 'image' ? 'image/jpeg' : 'application/octet-stream');

    // 3. Upload to storage.
    const uploadRes = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, decode(base64), { contentType, upsert: false });
    if (uploadRes.error) {
        return { ok: false, error: uploadRes.error.message };
    }

    // 4. Insert DB row.
    const insertRes = await supabase
        .from('topic_attachments')
        .insert({
            id: attachmentId,
            user_id: userId,
            topic_id: topicId,
            file_name: file.name,
            storage_path: storagePath,
            mime_type: contentType,
            size_bytes: file.size,
            kind: file.kind,
        })
        .select()
        .single();

    if (insertRes.error) {
        // Best-effort cleanup if DB insert fails after a successful upload.
        await supabase.storage.from(BUCKET).remove([storagePath]);
        return { ok: false, error: insertRes.error.message };
    }

    return { ok: true, attachment: insertRes.data as TopicAttachment };
}

// ── Fetch / signed URLs / delete ────────────────────────────

export async function fetchTopicAttachments(topicId: string): Promise<TopicAttachment[]> {
    const { data, error } = await supabase
        .from('topic_attachments')
        .select('*')
        .eq('topic_id', topicId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('[topicAttachments] fetch error:', error.message);
        return [];
    }
    return (data ?? []) as TopicAttachment[];
}

export async function createSignedUrl(storagePath: string, expiresInSec = 3600): Promise<string | null> {
    const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(storagePath, expiresInSec);
    if (error || !data?.signedUrl) {
        console.error('[topicAttachments] signed url error:', error?.message);
        return null;
    }
    return data.signedUrl;
}

/**
 * Invokes the `extract-attachment` edge function to populate
 * extracted_text / extraction_status on the row. The edge function updates
 * the DB directly; this client call awaits the response so we can return
 * the freshest attachment view to the caller.
 */
export async function extractAttachment(attachmentId: string): Promise<TopicAttachment | null> {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) return null;

    const { data, error } = await supabase.functions.invoke('extract-attachment', {
        body: { attachmentId },
        headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (error) {
        console.error('[topicAttachments] extract error:', error.message);
    }

    // Re-fetch the row from DB regardless of function response so we have the
    // canonical post-extraction state.
    const { data: refreshed } = await supabase
        .from('topic_attachments')
        .select('*')
        .eq('id', attachmentId)
        .single();

    // Silence unused warning — the function response is informational only.
    void data;

    return (refreshed as TopicAttachment) ?? null;
}

export async function deleteTopicAttachment(attachment: TopicAttachment): Promise<boolean> {
    // Soft-delete the DB row first; if that fails, leave the object in place.
    const { error: dbError } = await supabase
        .from('topic_attachments')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', attachment.id);

    if (dbError) {
        console.error('[topicAttachments] delete error:', dbError.message);
        return false;
    }

    // Best-effort hard delete of the storage object.
    await supabase.storage.from(BUCKET).remove([attachment.storage_path]);
    return true;
}

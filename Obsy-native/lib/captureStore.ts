import { create } from "zustand";
import { persist, createJSONStorage } from 'zustand/middleware';
import { supabase } from "@/lib/supabase";
import { User } from "@supabase/supabase-js";
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { computeDailyMoodFlow, formatDateKey, filterCapturesForDate } from "@/lib/dailyMoodFlows";
import { upsertDailyMoodFlow } from "@/services/dailyMoodFlows";
import { requestLinkDigest } from "@/services/linkDigestClient";
import { getEntryImageUrls } from "@/services/storage";
import { PRIVACY_FLAGS } from "@/lib/privacyFlags";
import { Capture } from "@/types/capture";
import type { UnpackPayload } from "@/lib/unpack/types";
import { getMoodLabel } from "@/lib/moodUtils";
import { moodCache } from "@/lib/moodCache";
import type { MoodGradient } from "@/lib/moods";
import { generateOrbEffect } from "@/lib/moods/orbEffects";
import { useTodayInsight } from "./todayInsightStore";
import { useWeeklyInsight } from "./weeklyInsightStore";
import { useMonthlyInsight } from "./monthlyInsightStore";
import { decode } from 'base64-arraybuffer';
import { getTierLimits } from "@/hooks/useSubscription";
import { getLocalDayKey } from "@/lib/utils";
import { track } from "@/lib/analytics";
import type { CaptureType } from "@/lib/analytics/events";

type SubscriptionTier = 'free' | 'plus'; // OBS-19: free|plus only

/**
 * Copy a local image into the app's captures dir and, for cloud-backup tiers,
 * upload it to the private `entries` bucket. Returns the local uri to display
 * and the storage path to persist. Mirrors the persistence half of
 * createCapture; used by Unpack photo entries which bypass the capture flow.
 */
async function persistLocalCaptureImage(
    imageUri: string,
    tier: SubscriptionTier,
    user: User | null
): Promise<{ localUri: string; storagePath: string }> {
    const limits = getTierLimits(tier);
    const CAPTURE_DIR = FileSystem.documentDirectory + 'captures';
    await FileSystem.makeDirectoryAsync(CAPTURE_DIR, { intermediates: true }).catch((error: any) => {
        if (error?.code !== 'ERR_FILESYSTEM_PATH_ALREADY_EXISTS') throw error;
    });

    const id = Crypto.randomUUID();
    const uriFilename = imageUri.split('/').pop() || '';
    const sanitizedFilename = uriFilename.split('?')[0].split('#')[0];
    const rawExt = sanitizedFilename.includes('.') ? sanitizedFilename.split('.').pop() : null;
    const fileExt = rawExt ? rawExt.toLowerCase() : 'jpg';
    const filename = `${id}.${fileExt}`;
    const destUri = CAPTURE_DIR + '/' + filename;

    await FileSystem.copyAsync({ from: imageUri, to: destUri });

    let finalStoragePath = filename;
    const canCloudBackup = limits.cloud_backup && user && PRIVACY_FLAGS.ALLOW_CLOUD_PHOTO_UPLOAD;
    if (canCloudBackup) {
        try {
            const base64 = await FileSystem.readAsStringAsync(destUri, { encoding: FileSystem.EncodingType.Base64 });
            const storagePath = `${user.id}/${filename}`;
            const { error: uploadError } = await supabase.storage
                .from('entries')
                .upload(storagePath, decode(base64), { contentType: `image/${fileExt}`, upsert: true });
            if (uploadError) throw uploadError;
            finalStoragePath = storagePath;
        } catch (err) {
            console.warn('[captureStore] Unpack photo cloud upload failed, using local-only:', err);
        }
    }

    return { localUri: destUri, storagePath: finalStoragePath };
}

type CaptureState = {
    captures: Capture[];
    loading: boolean;
    fetchCaptures: (user: User | null) => Promise<void>;
    addCapture: (
        user: User | null,
        data: Omit<Capture, "id" | "user_id" | "created_at" | "tags" | "includeInInsights" | "usePhotoForInsight" | "mood_id" | "mood_name_snapshot"> & {
            /** Null only for a shared link saved without reflecting yet. */
            mood_id: string | null,
            mood_name_snapshot: string | null,
            tags?: string[],
            includeInInsights?: boolean,
            usePhotoForInsight?: boolean,
            challengeId?: string,
            challengeTemplateId?: string,
            obsy_note?: string | null,
            source_type?: 'capture' | 'journal' | 'voice' | 'shared_link' | 'unpack',
            audio_url?: string | null,
            shared_link_url?: string | null,
            shared_link_platform?: string | null,
            shared_link_title?: string | null,
            shared_link_thumbnail_url?: string | null,
            shared_link_thumbnail_path?: string | null,
            shared_link_author?: string | null,
            shared_link_text?: string | null,
            shared_link_processed_at?: string | null,
            shared_link_digest?: string | null,
            shared_link_media_type?: string | null,
            unpack_payload?: UnpackPayload | null,
        }
    ) => Promise<string | null>;
    createJournalEntry: (
        user: User | null,
        moodId: string,
        moodName: string,
        note: string,
        tags?: string[],
        includeInInsights?: boolean
    ) => Promise<string | null>;
    createVoiceEntry: (
        user: User | null,
        moodId: string,
        moodName: string,
        transcript: string,
        audioUrl: string,
        tags?: string[],
        includeInInsights?: boolean
    ) => Promise<string | null>;
    createSharedLinkEntry: (
        user: User | null,
        /** Null when saved from the share sheet — the mood comes at reflection time. */
        moodId: string | null,
        moodName: string | null,
        url: string,
        platform: string,
        title: string | null,
        thumbnailUrl: string | null,
        note?: string | null,
        includeInInsights?: boolean
    ) => Promise<string | null>;
    /**
     * Persist a confirmed Unpack reflection as a new entry. The polished
     * reflection text is written to both `note` and `ai_summary` so insights read
     * it with no changes; the full trail (questions, answers, themes, signals)
     * lives in `unpack_payload`. Original media columns are mirrored so the entry
     * renders richly in the grid/detail views.
     */
    createUnpackEntry: (
        user: User | null,
        moodId: string,
        moodName: string,
        reflectionText: string,
        payload: UnpackPayload,
        media?: {
            /** Local URI of the source photo; persisted (copied + optional cloud) on save. */
            imageLocalUri?: string | null;
            tier?: SubscriptionTier;
            audioUrl?: string | null;
            sharedLinkUrl?: string | null;
            sharedLinkPlatform?: string | null;
            sharedLinkTitle?: string | null;
            sharedLinkThumbnailUrl?: string | null;
            sharedLinkDigest?: string | null;
            sharedLinkMediaType?: string | null;
        },
        includeInInsights?: boolean
    ) => Promise<string | null>;
    /**
     * Reflect on a queued shared link: attach the mood (and optionally a note
     * and topic) the user skipped at capture time. Marks the link processed, so
     * it leaves the inbox and enters mood history.
     */
    reflectSharedLink: (
        id: string,
        moodId: string,
        moodName: string,
        note?: string | null,
        topicTag?: string | null,
    ) => Promise<void>;
    /**
     * Keep a queued shared link without attaching a feeling to it. A decision in
     * its own right: the link leaves the inbox and stays in the library, but
     * carries no mood and so never reaches mood aggregation.
     */
    keepSharedLink: (id: string) => Promise<void>;
    /** Patch a shared-link capture in local state once its background digest resolves. */
    applySharedLinkDigest: (
        id: string,
        fields: {
            digest?: string | null;
            mediaType?: string | null;
            title?: string | null;
            thumbnailUrl?: string | null;
            thumbnailPath?: string | null;
            author?: string | null;
            text?: string | null;
        }
    ) => void;
    createCapture: (
        imageUri: string,
        moodId: string,
        moodName: string,
        note: string,
        tags?: string[],
        challengeContext?: { challengeId: string, templateId: string },
        tier?: SubscriptionTier,
        includeInInsights?: boolean
    ) => Promise<string | null>;
    deleteCapture: (id: string) => Promise<void>;
    getAllTags: () => string[];
    clearCaptures: () => void;
    // Save animation: set imageUri to trigger animation on home screen
    pendingSaveAnimationUri: string | null;
    setPendingSaveAnimationUri: (uri: string | null) => void;
    pendingSaveMoodGradient: MoodGradient | null;
    setPendingSaveMoodGradient: (gradient: MoodGradient | null) => void;
    pendingSaveComplete: boolean;
    setPendingSaveComplete: (complete: boolean) => void;
};

export const useCaptureStore = create<CaptureState>()(
    persist(
        (set, get) => ({
            captures: [],
            loading: false,

            fetchCaptures: async (user) => {
                set({ loading: true });
                try {
                    if (user) {
                        const { data, error } = await supabase
                            .from("entries")
                            .select("*")
                            .eq("user_id", user.id)
                            .order("created_at", { ascending: false });

                        if (error) throw error;

                        // The `entries` bucket is PRIVATE (OBS-20, migration
                        // 20260616000002_entries_private_bucket.sql). Pre-sign cloud-backed photos
                        // in one batched request; new captures already display from the local file.
                        const rows = data ?? [];
                        const signedByPath = await getEntryImageUrls(
                            rows.map((e) => e.photo_path).filter((p): p is string => !!p && p.includes('/'))
                        );

                        const mappedCaptures: Capture[] = rows.map(entry => {
                            let resolvedUrl = '';

                            const CAPTURE_DIR = FileSystem.documentDirectory + 'captures';
                            const localPath = entry.photo_path?.includes('/')
                                ? entry.photo_path.split('/').pop()
                                : entry.photo_path;

                            const localUri = CAPTURE_DIR + '/' + localPath;

                            if (entry.photo_path && entry.photo_path.includes('/')) {
                                // Cloud path → signed URL (private bucket); fall back to the local
                                // file if signing failed (e.g. offline).
                                resolvedUrl = signedByPath.get(entry.photo_path) ?? localUri;
                            } else {
                                // Local or just filename
                                resolvedUrl = localUri;
                            }

                            /**
                             * A shared link saved from the share sheet has no mood until
                             * the user reflects on it. That null must survive the round
                             * trip — coercing it to 'neutral' here would silently mark
                             * every pending save as reflected on the next fetch, and feed
                             * a mood the user never chose into their history.
                             */
                            const isUnreflectedLink = entry.source_type === 'shared_link' && !entry.mood;
                            const moodId: string | null = isUnreflectedLink ? null : (entry.mood || 'neutral');

                            // Resolve mood name: if snapshot looks like a raw ID (e.g., "custom_abc123"),
                            // try to resolve it to the actual mood name
                            let moodSnapshot = entry.mood_name_snapshot;
                            if (moodId && (!moodSnapshot || moodSnapshot.startsWith('custom_') || moodSnapshot === moodId)) {
                                // Snapshot is missing or appears to be a raw ID - resolve it
                                moodSnapshot = getMoodLabel(moodId, entry.mood_name_snapshot);
                            }

                            // Log warning if we had to use fallback values
                            if (moodId && (!entry.mood_name_snapshot || entry.mood_name_snapshot.startsWith('custom_'))) {
                                console.warn(`[captureStore] Entry ${entry.id} has invalid mood_name_snapshot "${entry.mood_name_snapshot}", resolved to: ${moodSnapshot}`);
                            }

                            return {
                                id: entry.id,
                                user_id: entry.user_id,
                                created_at: entry.created_at,
                                mood_id: moodId,
                                mood_name_snapshot: moodSnapshot || 'Neutral',
                                note: entry.note,
                                image_url: resolvedUrl,
                                image_path: entry.photo_path,
                                tags: entry.tags || [],
                                includeInInsights: entry.include_in_insights ?? true,
                                obsy_note: entry.ai_summary || null,
                                usePhotoForInsight: entry.use_photo_for_insight ?? false,
                                source_type: (entry.source_type as Capture['source_type']) || 'capture',
                                audio_url: entry.audio_url || null,
                                orb_effect: (entry.orb_effect as Capture['orb_effect']) || null,
                                shared_link_url: entry.shared_link_url || null,
                                shared_link_platform: entry.shared_link_platform || null,
                                shared_link_title: entry.shared_link_title || null,
                                shared_link_thumbnail_url: entry.shared_link_thumbnail_url || null,
                                shared_link_thumbnail_path: entry.shared_link_thumbnail_path || null,
                                shared_link_author: entry.shared_link_author || null,
                                shared_link_text: entry.shared_link_text || null,
                                shared_link_processed_at: entry.shared_link_processed_at || null,
                                shared_link_digest: entry.shared_link_digest || null,
                                shared_link_media_type: entry.shared_link_media_type || null,
                                unpack_payload: (entry.unpack_payload as Capture['unpack_payload']) || null,
                            };
                        });
                        set({ captures: mappedCaptures });

                        // Backfill orb_effect for legacy rows in background (non-blocking)
                        const missingEffects = mappedCaptures.filter((c) => !c.orb_effect && c.user_id);
                        if (missingEffects.length > 0) {
                            const generatedById = new Map<string, ReturnType<typeof generateOrbEffect>>();
                            for (const capture of missingEffects) {
                                generatedById.set(capture.id, generateOrbEffect(capture.mood_name_snapshot || capture.mood_id || 'Neutral'));
                            }
                            Promise.allSettled(
                                missingEffects.map(async (capture) => {
                                    const generated = generatedById.get(capture.id);
                                    if (!generated) return;
                                    await supabase
                                        .from('entries')
                                        .update({ orb_effect: generated })
                                        .eq('id', capture.id);
                                })
                            ).then((results) => {
                                const successfulIds = new Set<string>();
                                results.forEach((result, idx) => {
                                    if (result.status === 'fulfilled') {
                                        const capture = missingEffects[idx];
                                        if (capture) successfulIds.add(capture.id);
                                    }
                                });
                                if (successfulIds.size > 0) {
                                    set((state) => ({
                                        captures: state.captures.map((capture) => {
                                            if (capture.orb_effect || !successfulIds.has(capture.id)) return capture;
                                            const generated = generatedById.get(capture.id);
                                            return generated ? { ...capture, orb_effect: generated } : capture;
                                        }),
                                    }));
                                }
                            });
                        }
                    }
                } catch (error) {
                    console.error("Error fetching captures:", error);
                } finally {
                    set({ loading: false });
                }
            },

            addCapture: async (user, data) => {
                const tags = data.tags || [];
                const includeInInsights = data.includeInInsights ?? true;
                const usePhotoForInsight = data.usePhotoForInsight ?? false;
                const orbEffect = generateOrbEffect(data.mood_name_snapshot || data.mood_id || 'Neutral');
                let newCaptureId: string | null = null;
                // Capture funnel: is this the user's first entry? (read before insert)
                const isFirstCapture = get().captures.length === 0;

                /**
                 * A shared link may be saved with no mood at all: the share-sheet
                 * flow defers the mood to the reflection step, because asking for
                 * a feeling mid-scroll is what stops the save from happening. Every
                 * other entry type still requires one.
                 */
                const moodOptional = data.source_type === 'shared_link';
                const hasMood = !!data.mood_id && data.mood_id.trim() !== '';

                if (!hasMood && !moodOptional) {
                    throw new Error('Mood ID is required. Please select a mood before saving.');
                }
                if (hasMood && (!data.mood_name_snapshot || data.mood_name_snapshot.trim() === '')) {
                    throw new Error('Mood name snapshot is required. Please select a valid mood.');
                }

                if (hasMood) {
                    // Ensure cache is fresh before validating mood ID
                    if (!moodCache.isInitialized() || moodCache.isStale()) {
                        await moodCache.fetchAllMoods(user?.id ?? null);
                    }

                    // Validate mood ID exists in cache before saving
                    const mood = moodCache.getMoodById(data.mood_id!);
                    if (!mood) {
                        throw new Error(`Invalid mood ID: ${data.mood_id}. The selected mood no longer exists. Please select a different mood.`);
                    }

                    // Diagnostic: Verify mood exists in database before insert
                    const { data: moodCheck, error: moodCheckError } = await supabase
                        .from('moods')
                        .select('id, name, type')
                        .eq('id', data.mood_id!)
                        .maybeSingle();

                    console.log('[captureStore] Mood validation check:', {
                        moodId: data.mood_id,
                        moodSnapshot: data.mood_name_snapshot,
                        foundInDB: !!moodCheck,
                        moodData: moodCheck,
                        error: moodCheckError
                    });

                    if (!moodCheck) {
                        throw new Error(`Mood ID "${data.mood_id}" not found in database. Please refresh and try again.`);
                    }
                }

                if (user) {
                    const dbPayload = {
                        // Null for an unreflected shared link. The entries trigger
                        // fills mood_name_snapshot with 'Neutral' when it is null,
                        // which is why `mood` is the only reliable "has a mood" signal.
                        mood: hasMood ? data.mood_id : null,
                        mood_name_snapshot: hasMood ? data.mood_name_snapshot : null,
                        note: data.note,
                        photo_path: data.image_path ?? '',
                        user_id: user.id,
                        captured_at: new Date().toISOString(),
                        day_date: getLocalDayKey(),
                        tags: tags,
                        include_in_insights: includeInInsights,
                        ai_summary: data.obsy_note || null,
                        use_photo_for_insight: usePhotoForInsight,
                        source_type: data.source_type || 'capture',
                        audio_url: data.audio_url || null,
                        orb_effect: orbEffect,
                        shared_link_url: data.shared_link_url || null,
                        shared_link_platform: data.shared_link_platform || null,
                        shared_link_title: data.shared_link_title || null,
                        shared_link_thumbnail_url: data.shared_link_thumbnail_url || null,
                        shared_link_thumbnail_path: data.shared_link_thumbnail_path || null,
                        shared_link_author: data.shared_link_author || null,
                        shared_link_text: data.shared_link_text || null,
                        shared_link_processed_at: data.shared_link_processed_at || null,
                        shared_link_digest: data.shared_link_digest || null,
                        shared_link_media_type: data.shared_link_media_type || null,
                        unpack_payload: data.unpack_payload ?? null,
                    };

                    const { data: inserted, error } = await supabase
                        .from("entries")
                        .insert(dbPayload)
                        .select()
                        .single();

                    if (error) throw error;

                    const newCapture: Capture = {
                        id: inserted.id,
                        user_id: inserted.user_id,
                        created_at: inserted.created_at,
                        mood_id: inserted.mood,
                        mood_name_snapshot: inserted.mood_name_snapshot || data.mood_name_snapshot || 'Neutral',
                        note: inserted.note,
                        image_url: data.image_url || '',
                        image_path: inserted.photo_path,
                        tags: inserted.tags || [],
                        includeInInsights: inserted.include_in_insights ?? true,
                        challengeId: data.challengeId,
                        challengeTemplateId: data.challengeTemplateId,
                        obsy_note: inserted.ai_summary || null,
                        usePhotoForInsight: inserted.use_photo_for_insight ?? false,
                        source_type: (inserted.source_type as Capture['source_type']) || 'capture',
                        audio_url: inserted.audio_url || null,
                        orb_effect: (inserted.orb_effect as Capture['orb_effect']) || orbEffect,
                        shared_link_url: inserted.shared_link_url || null,
                        shared_link_platform: inserted.shared_link_platform || null,
                        shared_link_title: inserted.shared_link_title || null,
                        shared_link_thumbnail_url: inserted.shared_link_thumbnail_url || null,
                        shared_link_thumbnail_path: inserted.shared_link_thumbnail_path || null,
                        shared_link_author: inserted.shared_link_author || null,
                        shared_link_text: inserted.shared_link_text || null,
                        shared_link_processed_at: inserted.shared_link_processed_at || null,
                        shared_link_digest: inserted.shared_link_digest || null,
                        shared_link_media_type: inserted.shared_link_media_type || null,
                        unpack_payload: (inserted.unpack_payload as Capture['unpack_payload']) ?? data.unpack_payload ?? null,
                    };

                    set((state) => ({ captures: [newCapture, ...state.captures] }));
                    newCaptureId = inserted.id;

                    const updatedCaptures = get().captures;
                    useTodayInsight.getState().computePending(updatedCaptures);
                    useWeeklyInsight.getState().computePending(updatedCaptures);
                    useMonthlyInsight.getState().computePending(updatedCaptures);

                    const dateKey = formatDateKey(new Date(inserted.created_at));
                    const currentCaptures = get().captures;
                    const dayCaptures = filterCapturesForDate(currentCaptures, dateKey);
                    const flowData = computeDailyMoodFlow(dayCaptures);
                    upsertDailyMoodFlow(user.id, dateKey, flowData).catch((err) => {
                        console.error("[captureStore] Failed to upsert daily mood flow:", err);
                    });
                } else {
                    const id = Crypto.randomUUID();
                    const newCapture: Capture = {
                        id,
                        user_id: null,
                        created_at: new Date().toISOString(),
                        ...data,
                        // Mirrors the server trigger's default so a guest entry
                        // has a displayable name while mood_id stays null.
                        mood_name_snapshot: data.mood_name_snapshot || 'Neutral',
                        tags,
                        includeInInsights,
                        usePhotoForInsight,
                        orb_effect: orbEffect,
                    };

                    set((state) => ({ captures: [newCapture, ...state.captures] }));
                    newCaptureId = id;

                    const updatedCaptures = get().captures;
                    useTodayInsight.getState().computePending(updatedCaptures);
                    useWeeklyInsight.getState().computePending(updatedCaptures);
                    useMonthlyInsight.getState().computePending(updatedCaptures);
                }

                // Launch-funnel analytics (no PII — type + first-capture flag only).
                if (newCaptureId) {
                    const captureType: CaptureType =
                        data.source_type === 'unpack' ? 'unpack'
                            : data.source_type === 'voice' ? 'voice'
                                : data.source_type === 'journal' ? 'text'
                                    : data.source_type === 'shared_link' ? 'link'
                                        : 'photo';
                    track('capture_created', { type: captureType, is_first: isFirstCapture });
                    track('mood_logged');
                }
                return newCaptureId;
            },

            deleteCapture: async (id) => {
                const { data: { user } } = await supabase.auth.getUser();
                const capture = get().captures.find(c => c.id === id);
                if (!capture) return;

                if (user) {
                    await supabase.from("entries").delete().eq("id", id);

                    // Also delete from Cloud if it was uploaded
                    if (capture.image_path?.includes('/')) {
                        await supabase.storage.from('entries').remove([capture.image_path]);
                    }
                }

                if (capture.image_url.startsWith('file://')) {
                    await FileSystem.deleteAsync(capture.image_url, { idempotent: true });
                }

                set((state) => ({
                    captures: state.captures.filter(c => c.id !== id)
                }));

                const remainingCaptures = get().captures;
                useTodayInsight.getState().computePending(remainingCaptures);
                useWeeklyInsight.getState().computePending(remainingCaptures);
                useMonthlyInsight.getState().computePending(remainingCaptures);
            },

            /**
             * Creates a new capture with image, mood, and optional note.
             * @param imageUri - Required. Local URI of the captured image.
             * @param moodId - Required. The mood ID (system or custom_uuid format).
             * @param moodName - Required. The mood name to snapshot for historical preservation.
             * @param note - Optional text note.
             * @param tags - Optional array of tag strings.
             * @param challengeContext - Optional challenge context object.
             * @param tier - User's subscription tier for limit enforcement.
             * @throws Error if imageUri, moodId, or moodName is missing or invalid.
             * @throws Error if capture limits are exceeded for the user's tier.
             */
            createCapture: async (imageUri, moodId, moodName, note, tags = [], challengeContext, tier = 'free' as SubscriptionTier, includeInInsights = true) => {
                const { data: { user } } = await supabase.auth.getUser();
                const currentCaptures = get().captures;
                const limits = getTierLimits(tier);

                // Check daily capture limit
                const todayKey = getLocalDayKey(new Date());
                const todayCaptures = currentCaptures.filter(c =>
                    getLocalDayKey(new Date(c.created_at)) === todayKey
                ).length;

                if (todayCaptures >= limits.captures_per_day) {
                    throw new Error('Daily capture limit reached. Upgrade for unlimited captures.');
                }

                // Check total local storage limit
                if (currentCaptures.length >= limits.max_local_captures) {
                    throw new Error('Storage limit reached. Delete old captures or upgrade.');
                }

                // Validate required parameters
                if (!imageUri) {
                    throw new Error('Image URI is required to save capture');
                }
                if (!moodId || moodId.trim() === '') {
                    throw new Error('Mood ID is required. Please select a mood before saving.');
                }
                if (!moodName || moodName.trim() === '') {
                    throw new Error('Mood name is required. Please select a valid mood.');
                }

                // Ensure cache is fresh before validating mood ID
                if (!moodCache.isInitialized() || moodCache.isStale()) {
                    await moodCache.fetchAllMoods(user?.id ?? null);
                }

                // Validate mood ID exists in cache before saving
                const mood = moodCache.getMoodById(moodId);
                if (!mood) {
                    throw new Error(`Invalid mood ID: ${moodId}. The selected mood no longer exists. Please select a different mood.`);
                }

                const CAPTURE_DIR = FileSystem.documentDirectory + 'captures';
                await FileSystem.makeDirectoryAsync(CAPTURE_DIR, { intermediates: true }).catch((error) => {
                    if (error?.code !== 'ERR_FILESYSTEM_PATH_ALREADY_EXISTS') {
                        throw error;
                    }
                });

                const captureId = Crypto.randomUUID();
                // Extract filename first, strip query/hash fragments, then get lowercased extension
                // This handles URIs with query parameters, hash fragments, or uppercase extensions
                const uriFilename = imageUri.split('/').pop() || '';
                // Remove query string (?...) and hash fragment (#...) from filename
                const sanitizedFilename = uriFilename.split('?')[0].split('#')[0];
                // Extract extension and lowercase it, default to 'jpg' if not found
                const rawExt = sanitizedFilename.includes('.') ? sanitizedFilename.split('.').pop() : null;
                const fileExt = rawExt ? rawExt.toLowerCase() : 'jpg';
                const filename = `${captureId}.${fileExt}`;
                const destUri = CAPTURE_DIR + '/' + filename;

                console.log('[captureStore] Copying image:', { from: imageUri, to: destUri, fileExt });

                // 1. Move to local storage for instant availability
                await FileSystem.copyAsync({
                    from: imageUri,
                    to: destUri
                });

                // Verify the file was actually created
                const copyVerify = await FileSystem.getInfoAsync(destUri);
                if (!copyVerify.exists) {
                    throw new Error(`Failed to copy image to local storage. File does not exist at: ${destUri}`);
                }
                if (copyVerify.size === 0) {
                    throw new Error(`Failed to copy image to local storage. File has zero size at: ${destUri}`);
                }
                console.log('[captureStore] File copied successfully, size:', copyVerify.size, 'bytes');

                let finalStoragePath = filename;

                // 2. Cloud Backup - only for the paid Plus tier
                const canCloudBackup = limits.cloud_backup && user && PRIVACY_FLAGS.ALLOW_CLOUD_PHOTO_UPLOAD;
                if (canCloudBackup) {
                    try {
                        const base64 = await FileSystem.readAsStringAsync(destUri, { encoding: FileSystem.EncodingType.Base64 });
                        const storagePath = `${user.id}/${filename}`;

                        const { error: uploadError } = await supabase.storage
                            .from('entries')
                            .upload(storagePath, decode(base64), {
                                contentType: `image/${fileExt}`,
                                upsert: true
                            });

                        if (uploadError) throw uploadError;
                        finalStoragePath = storagePath;
                    } catch (err) {
                        console.warn("[captureStore] Cloud upload failed, falling back to local-only reference:", err);
                    }
                } else if (!limits.cloud_backup) {
                    console.log('[captureStore] Skipping cloud backup for', tier, 'tier');
                }

                // 3. Save to Store/DB
                if (user) {
                    return await get().addCapture(user, {
                        mood_id: moodId,
                        mood_name_snapshot: moodName,
                        note: note,
                        image_url: destUri,
                        image_path: finalStoragePath,
                        tags: tags,
                        challengeId: challengeContext?.challengeId,
                        challengeTemplateId: challengeContext?.templateId,
                        includeInInsights,
                    });
                } else {
                    return await get().addCapture(null, {
                        mood_id: moodId,
                        mood_name_snapshot: moodName,
                        note: note,
                        image_url: destUri,
                        image_path: finalStoragePath,
                        tags: tags,
                        challengeId: challengeContext?.challengeId,
                        challengeTemplateId: challengeContext?.templateId,
                        includeInInsights,
                    });
                }
            },

            createJournalEntry: async (user, moodId, moodName, note, tags = [], includeInInsights = true) => {
                // Ensure mood cache is fresh
                if (!moodCache.isInitialized() || moodCache.isStale()) {
                    await moodCache.fetchAllMoods(user?.id ?? null);
                }
                return get().addCapture(user, {
                    mood_id: moodId,
                    mood_name_snapshot: moodName,
                    note: note,
                    image_url: '',
                    image_path: null,
                    tags,
                    source_type: 'journal',
                    audio_url: null,
                    usePhotoForInsight: false,
                    includeInInsights,
                });
            },

            createVoiceEntry: async (user, moodId, moodName, transcript, audioUrl, tags = [], includeInInsights = true) => {
                if (!moodCache.isInitialized() || moodCache.isStale()) {
                    await moodCache.fetchAllMoods(user?.id ?? null);
                }
                return get().addCapture(user, {
                    mood_id: moodId,
                    mood_name_snapshot: moodName,
                    note: transcript,
                    image_url: '',
                    image_path: null,
                    tags,
                    source_type: 'voice',
                    audio_url: audioUrl,
                    usePhotoForInsight: false,
                    includeInInsights,
                });
            },

            createSharedLinkEntry: async (user, moodId, moodName, url, platform, title, thumbnailUrl, note = null, includeInInsights = true) => {
                if (moodId && (!moodCache.isInitialized() || moodCache.isStale())) {
                    await moodCache.fetchAllMoods(user?.id ?? null);
                }
                const tags: string[] = [];
                const newId = await get().addCapture(user, {
                    mood_id: moodId,
                    mood_name_snapshot: moodName,
                    note: note ?? null,
                    image_url: thumbnailUrl ?? '',
                    image_path: null,
                    tags,
                    source_type: 'shared_link',
                    audio_url: null,
                    usePhotoForInsight: false,
                    includeInInsights,
                    shared_link_url: url,
                    shared_link_platform: platform,
                    shared_link_title: title,
                    shared_link_thumbnail_url: thumbnailUrl,
                });

                // Background: enrich the link with a Gemini digest (content summary,
                // media type, real title, thumbnail). Fire-and-forget — never blocks save.
                if (newId && user) {
                    requestLinkDigest(newId)
                        .then((res) => {
                            if (res.ok) {
                                get().applySharedLinkDigest(newId, {
                                    digest: res.digest,
                                    mediaType: res.mediaType,
                                    title: res.title,
                                    thumbnailUrl: res.thumbnailUrl,
                                    thumbnailPath: res.thumbnailPath,
                                    author: res.author,
                                    text: res.text,
                                });
                            }
                        })
                        .catch(() => { /* best-effort enrichment */ });
                }

                return newId;
            },

            createUnpackEntry: async (user, moodId, moodName, reflectionText, payload, media = {}, includeInInsights = true) => {
                if (!moodCache.isInitialized() || moodCache.isStale()) {
                    await moodCache.fetchAllMoods(user?.id ?? null);
                }

                // Persist the source photo (copy + optional cloud) so it renders after reload.
                let imageUrl = '';
                let imagePath: string | null = null;
                if (media.imageLocalUri) {
                    try {
                        const persisted = await persistLocalCaptureImage(
                            media.imageLocalUri,
                            media.tier ?? 'free',
                            user
                        );
                        imageUrl = persisted.localUri;
                        imagePath = persisted.storagePath;
                    } catch (err) {
                        console.warn('[captureStore] Failed to persist Unpack photo:', err);
                    }
                }

                return get().addCapture(user, {
                    mood_id: moodId,
                    mood_name_snapshot: moodName,
                    // Reflection text lives in `note` (journal read path) and `ai_summary`
                    // (obsy_note / insights read path) so Unpack entries feed insights for free.
                    note: reflectionText,
                    obsy_note: reflectionText,
                    image_url: imageUrl || media.sharedLinkThumbnailUrl || '',
                    image_path: imagePath,
                    tags: payload.themes ?? [],
                    source_type: 'unpack',
                    audio_url: media.audioUrl ?? null,
                    usePhotoForInsight: false,
                    includeInInsights,
                    unpack_payload: payload,
                    shared_link_url: media.sharedLinkUrl ?? null,
                    shared_link_platform: media.sharedLinkPlatform ?? null,
                    shared_link_title: media.sharedLinkTitle ?? null,
                    shared_link_thumbnail_url: media.sharedLinkThumbnailUrl ?? null,
                    shared_link_digest: media.sharedLinkDigest ?? null,
                    shared_link_media_type: media.sharedLinkMediaType ?? null,
                });
            },

            reflectSharedLink: async (id, moodId, moodName, note = null, topicTag = null) => {
                const capture = get().captures.find(c => c.id === id);
                if (!capture) return;

                const tags = topicTag && !capture.tags.includes(topicTag)
                    ? [...capture.tags, topicTag]
                    : capture.tags;

                const processedAt = new Date().toISOString();

                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    const { error } = await supabase
                        .from('entries')
                        .update({
                            mood: moodId,
                            mood_name_snapshot: moodName,
                            note: note ?? capture.note,
                            tags,
                            shared_link_processed_at: processedAt,
                        })
                        .eq('id', id);
                    if (error) throw error;
                }

                set((state) => ({
                    captures: state.captures.map(c => c.id === id
                        ? {
                            ...c,
                            mood_id: moodId,
                            mood_name_snapshot: moodName,
                            note: note ?? c.note,
                            tags,
                            shared_link_processed_at: processedAt,
                            orb_effect: c.orb_effect ?? generateOrbEffect(moodName || moodId),
                        }
                        : c),
                }));

                // The entry now carries a mood, so it counts toward insights for
                // the first time — recompute what was gated on it.
                const updated = get().captures;
                useTodayInsight.getState().computePending(updated);
                useWeeklyInsight.getState().computePending(updated);
                useMonthlyInsight.getState().computePending(updated);
            },

            keepSharedLink: async (id) => {
                const capture = get().captures.find(c => c.id === id);
                if (!capture) return;

                const processedAt = new Date().toISOString();

                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    const { error } = await supabase
                        .from('entries')
                        .update({ shared_link_processed_at: processedAt })
                        .eq('id', id);
                    if (error) throw error;
                }

                set((state) => ({
                    captures: state.captures.map(c => c.id === id
                        ? { ...c, shared_link_processed_at: processedAt }
                        : c),
                }));

                // Deliberately no insight recompute: keeping a link attaches no
                // mood, so nothing that aggregates on mood has changed.
            },

            applySharedLinkDigest: (id, fields) => {
                set((state) => ({
                    captures: state.captures.map((c) => {
                        if (c.id !== id) return c;
                        return {
                            ...c,
                            shared_link_digest: fields.digest ?? c.shared_link_digest ?? null,
                            shared_link_media_type: fields.mediaType ?? c.shared_link_media_type ?? null,
                            shared_link_title: fields.title ?? c.shared_link_title ?? null,
                            shared_link_thumbnail_url: fields.thumbnailUrl ?? c.shared_link_thumbnail_url ?? null,
                            shared_link_thumbnail_path: fields.thumbnailPath ?? c.shared_link_thumbnail_path ?? null,
                            shared_link_author: fields.author ?? c.shared_link_author ?? null,
                            shared_link_text: fields.text ?? c.shared_link_text ?? null,
                        };
                    }),
                }));
            },

            getAllTags: () => {
                const allTags = new Set<string>();
                get().captures.forEach(c => c.tags?.forEach(t => allTags.add(t)));
                return Array.from(allTags).sort();
            },

            clearCaptures: () => set({ captures: [] }),

            pendingSaveAnimationUri: null,
            setPendingSaveAnimationUri: (uri) => set({ pendingSaveAnimationUri: uri }),
            pendingSaveMoodGradient: null,
            setPendingSaveMoodGradient: (gradient) => set({ pendingSaveMoodGradient: gradient }),
            pendingSaveComplete: false,
            setPendingSaveComplete: (complete) => set({ pendingSaveComplete: complete }),
        }),
        {
            name: 'obsy-capture-storage',
            storage: createJSONStorage(() => AsyncStorage),
            partialize: (state) => ({
                captures: state.captures,
                // Exclude transient animation state from persistence
            }),
        }
    )
);

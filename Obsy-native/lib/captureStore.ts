import { create } from "zustand";
import { persist, createJSONStorage } from 'zustand/middleware';
import { supabase } from "@/lib/supabase";
import { User } from "@supabase/supabase-js";
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { computeDailyMoodFlow, formatDateKey, filterCapturesForDate } from "@/lib/dailyMoodFlows";
import { upsertDailyMoodFlow } from "@/services/dailyMoodFlows";
import { PRIVACY_FLAGS } from "@/lib/privacyFlags";
import { Capture } from "@/types/capture";
import { getMoodLabel } from "@/lib/moodUtils";
import { moodCache } from "@/lib/moodCache";
import { useTodayInsight } from "./todayInsightStore";
import { useWeeklyInsight } from "./weeklyInsightStore";
import { useMonthlyInsight } from "./monthlyInsightStore";
import { decode } from 'base64-arraybuffer';
import { getTierLimits } from "@/hooks/useSubscription";
import { getLocalDayKey } from "@/lib/utils";

type SubscriptionTier = 'guest' | 'free' | 'founder' | 'subscriber';

type CaptureState = {
    captures: Capture[];
    loading: boolean;
    fetchCaptures: (user: User | null) => Promise<void>;
    addCapture: (
        user: User | null,
        data: Omit<Capture, "id" | "user_id" | "created_at" | "tags" | "includeInInsights" | "usePhotoForInsight" | "mood_id" | "mood_name_snapshot"> & {
            mood_id: string,
            mood_name_snapshot: string,
            tags?: string[],
            includeInInsights?: boolean,
            usePhotoForInsight?: boolean,
            challengeId?: string,
            challengeTemplateId?: string,
            obsy_note?: string | null,
        }
    ) => Promise<string | null>;
    createCapture: (
        imageUri: string,
        moodId: string,
        moodName: string,
        note: string,
        tags?: string[],
        challengeContext?: { challengeId: string, templateId: string },
        obsyNote?: string | null,
        usePhotoForInsight?: boolean,
        tier?: SubscriptionTier
    ) => Promise<string | null>;
    deleteCapture: (id: string) => Promise<void>;
    getAllTags: () => string[];
    clearCaptures: () => void;
    lastUsedAlbumId: string | null;
    setLastUsedAlbumId: (id: string | null) => void;
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

                        const mappedCaptures: Capture[] = (data ?? []).map(entry => {
                            let resolvedUrl = '';

                            // 1. Try resolving as a local file first (for speed)
                            const CAPTURE_DIR = FileSystem.documentDirectory + 'captures';
                            const localPath = entry.photo_path?.includes('/')
                                ? entry.photo_path.split('/').pop()
                                : entry.photo_path;

                            const localUri = CAPTURE_DIR + '/' + localPath;

                            // Note: we can't easily check file existence synchronously here in map,
                            // but we can default to local and fallback to cloud if image fails to load in UI.
                            // For simplicity, if it's a supabase path (has /), generate public URL.
                            if (entry.photo_path && entry.photo_path.includes('/')) {
                                // Cloud path
                                resolvedUrl = supabase.storage.from('entries').getPublicUrl(entry.photo_path).data.publicUrl;
                            } else {
                                // Local or just filename
                                resolvedUrl = localUri;
                            }

                            // Ensure required mood fields are populated
                            const moodId = entry.mood || 'neutral';

                            // Resolve mood name: if snapshot looks like a raw ID (e.g., "custom_abc123"),
                            // try to resolve it to the actual mood name
                            let moodSnapshot = entry.mood_name_snapshot;
                            if (!moodSnapshot || moodSnapshot.startsWith('custom_') || moodSnapshot === moodId) {
                                // Snapshot is missing or appears to be a raw ID - resolve it
                                moodSnapshot = getMoodLabel(moodId, entry.mood_name_snapshot);
                            }

                            // Log warning if we had to use fallback values
                            if (!entry.mood_name_snapshot || entry.mood_name_snapshot.startsWith('custom_')) {
                                console.warn(`[captureStore] Entry ${entry.id} has invalid mood_name_snapshot "${entry.mood_name_snapshot}", resolved to: ${moodSnapshot}`);
                            }

                            return {
                                id: entry.id,
                                user_id: entry.user_id,
                                created_at: entry.created_at,
                                mood_id: moodId,
                                mood_name_snapshot: moodSnapshot,
                                note: entry.note,
                                image_url: resolvedUrl,
                                image_path: entry.photo_path,
                                tags: entry.tags || [],
                                includeInInsights: entry.include_in_insights ?? true,
                                obsy_note: entry.ai_summary || null,
                                usePhotoForInsight: entry.use_photo_for_insight ?? false,
                            };
                        });
                        set({ captures: mappedCaptures });
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
                let newCaptureId: string | null = null;

                // Validate required mood fields
                if (!data.mood_id || data.mood_id.trim() === '') {
                    throw new Error('Mood ID is required. Please select a mood before saving.');
                }
                if (!data.mood_name_snapshot || data.mood_name_snapshot.trim() === '') {
                    throw new Error('Mood name snapshot is required. Please select a valid mood.');
                }

                // Ensure cache is fresh before validating mood ID
                if (!moodCache.isInitialized() || moodCache.isStale()) {
                    await moodCache.fetchAllMoods(user?.id ?? null);
                }

                // Validate mood ID exists in cache before saving
                const mood = moodCache.getMoodById(data.mood_id);
                if (!mood) {
                    throw new Error(`Invalid mood ID: ${data.mood_id}. The selected mood no longer exists. Please select a different mood.`);
                }

                // Diagnostic: Verify mood exists in database before insert
                const { data: moodCheck, error: moodCheckError } = await supabase
                    .from('moods')
                    .select('id, name, type')
                    .eq('id', data.mood_id)
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

                if (user) {
                    const dbPayload = {
                        mood: data.mood_id,
                        mood_name_snapshot: data.mood_name_snapshot,
                        note: data.note,
                        photo_path: data.image_path,
                        user_id: user.id,
                        captured_at: new Date().toISOString(),
                        day_date: new Date().toISOString().split('T')[0],
                        tags: tags,
                        include_in_insights: includeInInsights,
                        ai_summary: data.obsy_note || null,
                        use_photo_for_insight: usePhotoForInsight,
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
                        mood_name_snapshot: inserted.mood_name_snapshot || data.mood_name_snapshot,
                        note: inserted.note,
                        image_url: data.image_url,
                        image_path: inserted.photo_path,
                        tags: inserted.tags || [],
                        includeInInsights: inserted.include_in_insights ?? true,
                        challengeId: data.challengeId,
                        challengeTemplateId: data.challengeTemplateId,
                        obsy_note: inserted.ai_summary || null,
                        usePhotoForInsight: inserted.use_photo_for_insight ?? false,
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
                        tags,
                        includeInInsights,
                        usePhotoForInsight,
                    };

                    set((state) => ({ captures: [newCapture, ...state.captures] }));
                    newCaptureId = id;

                    const updatedCaptures = get().captures;
                    useTodayInsight.getState().computePending(updatedCaptures);
                    useWeeklyInsight.getState().computePending(updatedCaptures);
                    useMonthlyInsight.getState().computePending(updatedCaptures);
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
             * @param obsyNote - Optional AI-generated note.
             * @param usePhotoForInsight - Whether to use photo for AI insight.
             * @param tier - User's subscription tier for limit enforcement.
             * @throws Error if imageUri, moodId, or moodName is missing or invalid.
             * @throws Error if capture limits are exceeded for the user's tier.
             */
            createCapture: async (imageUri, moodId, moodName, note, tags = [], challengeContext, obsyNote, usePhotoForInsight = false, tier = 'free' as SubscriptionTier) => {
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

                // 2. Cloud Backup - only for paid tiers (founder/subscriber)
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
                        obsy_note: obsyNote,
                        usePhotoForInsight: usePhotoForInsight,
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
                        obsy_note: obsyNote,
                        usePhotoForInsight: usePhotoForInsight,
                    });
                }
            },

            getAllTags: () => {
                const allTags = new Set<string>();
                get().captures.forEach(c => c.tags?.forEach(t => allTags.add(t)));
                return Array.from(allTags).sort();
            },

            clearCaptures: () => set({ captures: [] }),

            lastUsedAlbumId: null,
            setLastUsedAlbumId: (id) => set({ lastUsedAlbumId: id }),
        }),
        {
            name: 'obsy-capture-storage',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);

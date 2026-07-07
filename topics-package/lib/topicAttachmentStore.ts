import { create } from 'zustand';
import {
    fetchTopicAttachments,
    deleteTopicAttachment,
    uploadTopicAttachment,
    extractAttachment,
    type TopicAttachment,
    type PickedFile,
} from '@/services/topicAttachments';

interface TopicAttachmentState {
    attachments: TopicAttachment[];          // all attachments across topics, cached
    loadingTopicIds: Set<string>;             // topics currently being loaded
    extractingAttachmentIds: Set<string>;     // local 'in-flight' marker for extraction
    lastError: string | null;

    loadForTopic: (topicId: string) => Promise<void>;
    uploadForTopic: (topicId: string, file: PickedFile) => Promise<TopicAttachment | null>;
    requestExtraction: (attachmentId: string) => Promise<void>;
    removeAttachment: (attachment: TopicAttachment) => Promise<void>;
    getForTopic: (topicId: string) => TopicAttachment[];
    clearError: () => void;
}

export const useTopicAttachmentStore = create<TopicAttachmentState>()((set, get) => ({
    attachments: [],
    loadingTopicIds: new Set(),
    extractingAttachmentIds: new Set(),
    lastError: null,

    loadForTopic: async (topicId) => {
        const loadingTopicIds = new Set(get().loadingTopicIds);
        loadingTopicIds.add(topicId);
        set({ loadingTopicIds });

        try {
            const rows = await fetchTopicAttachments(topicId);
            set((state) => {
                // Replace any existing entries for this topic with the fresh server list.
                const others = state.attachments.filter(a => a.topic_id !== topicId);
                return { attachments: [...rows, ...others] };
            });
        } finally {
            const after = new Set(get().loadingTopicIds);
            after.delete(topicId);
            set({ loadingTopicIds: after });
        }
    },

    uploadForTopic: async (topicId, file) => {
        const result = await uploadTopicAttachment(topicId, file);
        if (!result.ok || !result.attachment) {
            set({ lastError: result.error ?? 'Upload failed' });
            return null;
        }
        set((state) => ({
            attachments: [result.attachment!, ...state.attachments],
            lastError: null,
        }));

        // Fire-and-forget: kick off extraction in the background. The cache
        // refreshes once the edge function returns, but we don't block the
        // picker UI on a multi-second Claude call.
        const newAttachmentId = result.attachment.id;
        get().requestExtraction(newAttachmentId).catch(err => {
            console.warn('[topicAttachments] extraction kickoff failed:', err);
        });

        return result.attachment;
    },

    requestExtraction: async (attachmentId) => {
        const inflight = new Set(get().extractingAttachmentIds);
        if (inflight.has(attachmentId)) return; // dedupe in-flight calls
        inflight.add(attachmentId);
        set({ extractingAttachmentIds: inflight });

        try {
            const refreshed = await extractAttachment(attachmentId);
            if (refreshed) {
                set((state) => ({
                    attachments: state.attachments.map(a =>
                        a.id === refreshed.id ? refreshed : a,
                    ),
                }));
            }
        } finally {
            const after = new Set(get().extractingAttachmentIds);
            after.delete(attachmentId);
            set({ extractingAttachmentIds: after });
        }
    },

    removeAttachment: async (attachment) => {
        // Optimistic remove from cache; revert on failure.
        const backup = get().attachments;
        set({ attachments: backup.filter(a => a.id !== attachment.id) });

        const ok = await deleteTopicAttachment(attachment);
        if (!ok) {
            set({ attachments: backup, lastError: 'Could not delete attachment' });
        }
    },

    getForTopic: (topicId) => {
        return get().attachments.filter(a => a.topic_id === topicId);
    },

    clearError: () => set({ lastError: null }),
}));

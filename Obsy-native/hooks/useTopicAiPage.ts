import { useCallback, useEffect, useRef, useState } from 'react';
import type { Topic, TopicStats } from '@/lib/topicStore';
import { useTopicStore } from '@/lib/topicStore';
import { useCaptureStore } from '@/lib/captureStore';
import { useTopicAttachmentStore } from '@/lib/topicAttachmentStore';
import type { TopicContext, TopicGenResult } from '@/services/topicChatClient';
import type { TopicAiCacheEntry } from '@/lib/topicAiTypes';

/**
 * Returns a ref-stable getter for the AI {@link TopicContext} of a topic.
 *
 * The Topics screen re-renders ~60Hz from the orb physics tick, so we must not
 * recompute or re-trigger generation each frame. The latest stores are mirrored
 * into a ref (written during render — idempotent) so callers read fresh data at
 * call time without taking a new function identity every frame.
 */
export function useTopicContextRef(topic: Topic, stats: TopicStats): () => TopicContext {
    const captures = useCaptureStore((s) => s.captures);
    const topicNotes = useTopicStore((s) => s.topicNotes);
    const attachments = useTopicAttachmentStore((s) => s.attachments);

    const ref = useRef<TopicContext>({ topic, stats, captures, topicNotes, attachments });
    ref.current = { topic, stats, captures, topicNotes, attachments };

    return useCallback(() => ref.current, []);
}

interface UseTopicAiPageOptions<T> {
    /** Persisted cache entry for this topic + page (undefined until generated). */
    cached: TopicAiCacheEntry<T> | undefined;
    /** Persist a freshly generated payload to the store. */
    persist: (data: T) => void;
    /** Fires the AI generation. Should close over a ref-stable context getter. */
    generate: () => Promise<TopicGenResult<T>>;
    /** Plus + enough data + the page has been opened → eligible to auto-generate. */
    canGenerate: boolean;
    /** Not a Plus user → show teaser, never call AI. */
    locked: boolean;
}

interface UseTopicAiPageResult<T> {
    data: T | undefined;
    generatedAt: string | undefined;
    loading: boolean;
    error: string | null;
    refresh: () => void;
}

/**
 * Generation lifecycle shared by the Discover and Evolve pages:
 * read cache → auto-generate once when eligible → expose loading/error/refresh.
 *
 * Auto-generation fires at most once (latched) and only when there is no cached
 * result yet, so swiping back and forth never re-burns an AI call.
 */
export function useTopicAiPage<T>({
    cached,
    persist,
    generate,
    canGenerate,
    locked,
}: UseTopicAiPageOptions<T>): UseTopicAiPageResult<T> {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Mirror the latest callbacks in refs so the run loop is identity-stable.
    const generateRef = useRef(generate);
    generateRef.current = generate;
    const persistRef = useRef(persist);
    persistRef.current = persist;

    const run = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await generateRef.current();
            if (res.ok && res.data) {
                persistRef.current(res.data);
            } else {
                setError('Obsy couldn’t read this topic just now. Try again in a moment.');
            }
        } catch {
            setError('Lost the connection for a second. Try again.');
        } finally {
            setLoading(false);
        }
    }, []);

    // Auto-generate exactly once when first eligible with no cached result.
    const autoLatched = useRef(false);
    useEffect(() => {
        if (locked || cached || !canGenerate) return;
        if (autoLatched.current) return;
        autoLatched.current = true;
        run();
    }, [locked, cached, canGenerate, run]);

    const refresh = useCallback(() => {
        autoLatched.current = true; // a manual run also satisfies the auto latch
        run();
    }, [run]);

    return {
        data: cached?.data,
        generatedAt: cached?.generatedAt,
        loading,
        error,
        refresh,
    };
}

import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import type { Topic, TopicStats } from '@/lib/topicStore';
import { useTopicStore } from '@/lib/topicStore';
import { useTopicAttachmentStore } from '@/lib/topicAttachmentStore';
import { useSubscription } from '@/hooks/useSubscription';
import { useTopicAiPage, useTopicContextRef } from '@/hooks/useTopicAiPage';
import { generateTopicDiscover } from '@/services/topicChatClient';
import { VanguardPaywall } from '@/components/paywall/VanguardPaywall';
import { FocusPageScaffold } from './FocusPageScaffold';
import { FocusCard } from './FocusCard';
import { ThemePills } from './ThemePills';
import { BulletList } from './BulletList';

interface TopicDiscoverPageProps {
    topic: Topic;
    stats: TopicStats;
    isActive: boolean;
    onClose: () => void;
    topInset: number;
    bottomInset: number;
}

/**
 * Page 2 — Discover. The awareness/intelligence layer: Core Pattern, Themes,
 * Perspectives (adapts to topic type), Connections. Plus-only; free users see a
 * teaser. Auto-generates once on first open, then reads the persisted cache.
 */
export function TopicDiscoverPage({
    topic,
    stats,
    isActive,
    onClose,
    topInset,
    bottomInset,
}: TopicDiscoverPageProps) {
    const { tier } = useSubscription();
    const isPlus = tier === 'subscriber' || tier === 'founder';

    const cached = useTopicStore((s) => s.discoverCache[topic.id]);
    const setDiscover = useTopicStore((s) => s.setDiscover);
    const otherTopicTitles = useTopicStore((s) => s.topics)
        .filter((t) => t.id !== topic.id)
        .map((t) => t.title);
    const loadForTopic = useTopicAttachmentStore((s) => s.loadForTopic);
    const getCtx = useTopicContextRef(topic, stats);

    const [showPaywall, setShowPaywall] = useState(false);

    // Latch "opened" once this page first becomes active, so auto-generation only
    // fires when the user actually swipes here (not while sitting on Observe).
    const [opened, setOpened] = useState(isActive);
    useEffect(() => {
        if (isActive && !opened) setOpened(true);
    }, [isActive, opened]);

    // Refresh attachments once on first open so the digest sees extracted text.
    const loadedRef = useRef(false);
    useEffect(() => {
        if (opened && !loadedRef.current) {
            loadedRef.current = true;
            loadForTopic(topic.id);
        }
    }, [opened, loadForTopic, topic.id]);

    // Keep other-topic titles fresh for the generation closure.
    const othersRef = useRef(otherTopicTitles);
    othersRef.current = otherTopicTitles;

    const hasData = stats.totalEntries > 0;
    const locked = !isPlus;

    const { data, generatedAt, loading, error, refresh } = useTopicAiPage({
        cached,
        persist: (d) => setDiscover(topic.id, d),
        generate: () => generateTopicDiscover(getCtx(), othersRef.current),
        canGenerate: isPlus && hasData && opened,
        locked,
    });

    return (
        <>
            <FocusPageScaffold
                topic={topic}
                entryCount={stats.totalEntries}
                pageLabel="Discover"
                onClose={onClose}
                topInset={topInset}
                bottomInset={bottomInset}
                locked={locked}
                teaserVariant="discover"
                onUnlock={() => setShowPaywall(true)}
                hasData={hasData}
                ready={!!data}
                loading={loading}
                error={error}
                onRetry={refresh}
                emptyMessage="Add a few reflections to this topic and Discover will reveal what’s forming."
                loadingMessage={`Reading your ${topic.title} reflections…`}
                generatedAt={generatedAt}
                onRefresh={refresh}
            >
                {data && (
                    <>
                        {!!data.corePattern && (
                            <FocusCard label="Core pattern">
                                <Text style={styles.bodyText}>{data.corePattern}</Text>
                            </FocusCard>
                        )}
                        {data.themes.length > 0 && (
                            <FocusCard label="Themes">
                                <ThemePills themes={data.themes} />
                            </FocusCard>
                        )}
                        {data.perspectives.length > 0 && (
                            <FocusCard label="Perspectives">
                                <BulletList items={data.perspectives} />
                            </FocusCard>
                        )}
                        {data.connections.length > 0 && (
                            <FocusCard label="Connections">
                                <BulletList items={data.connections} />
                            </FocusCard>
                        )}
                    </>
                )}
            </FocusPageScaffold>

            <VanguardPaywall
                visible={showPaywall}
                onClose={() => setShowPaywall(false)}
                featureName="topic_chat"
            />
        </>
    );
}

const styles = StyleSheet.create({
    bodyText: {
        fontSize: 14.5,
        color: 'rgba(255,255,255,0.85)',
        lineHeight: 22,
    },
});

import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import type { Topic, TopicStats } from '@/lib/topicStore';
import { useTopicStore } from '@/lib/topicStore';
import { useTopicAttachmentStore } from '@/lib/topicAttachmentStore';
import { useSubscription } from '@/hooks/useSubscription';
import { useTopicAiPage, useTopicContextRef } from '@/hooks/useTopicAiPage';
import { generateTopicDiscover } from '@/services/topicChatClient';
import { getLensDef, inferTopicLens } from '@/lib/topicLens';
import { VanguardPaywall } from '@/components/paywall/VanguardPaywall';
import { FocusPageScaffold } from './FocusPageScaffold';
import { FocusCard } from './FocusCard';
import { ThemePills } from './ThemePills';
import { BulletList } from './BulletList';
import { RespondModal } from './RespondModal';

interface TopicDiscoverPageProps {
    topic: Topic;
    stats: TopicStats;
    isActive: boolean;
    onClose: () => void;
    topInset: number;
    bottomInset: number;
}

/**
 * Page 2 — Discover. The awareness/intelligence layer. Section labels and AI
 * framing adapt to the topic's lens; fresh topics get starter content rather
 * than an empty state. Plus-only; free users see a teaser.
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
    const isPlus = tier === 'plus';

    const cached = useTopicStore((s) => s.discoverCache[topic.id]);
    const setDiscover = useTopicStore((s) => s.setDiscover);
    const addTopicResponse = useTopicStore((s) => s.addTopicResponse);
    const otherTopicTitles = useTopicStore((s) => s.topics)
        .filter((t) => t.id !== topic.id)
        .map((t) => t.title);
    const loadForTopic = useTopicAttachmentStore((s) => s.loadForTopic);
    const getCtx = useTopicContextRef(topic, stats);

    const lens = getLensDef(topic.lens ?? inferTopicLens(topic.title, topic.description));

    const [showPaywall, setShowPaywall] = useState(false);
    const [respond, setRespond] = useState<{ section: string; text: string } | null>(null);

    const [opened, setOpened] = useState(isActive);
    useEffect(() => {
        if (isActive && !opened) setOpened(true);
    }, [isActive, opened]);

    const loadedRef = useRef(false);
    useEffect(() => {
        if (opened && !loadedRef.current) {
            loadedRef.current = true;
            loadForTopic(topic.id);
        }
    }, [opened, loadForTopic, topic.id]);

    // Keep other-topic titles + the previous payload fresh for the generation
    // closure (previous lets the AI avoid repeating itself on refresh).
    const othersRef = useRef(otherTopicTitles);
    othersRef.current = otherTopicTitles;
    const prevRef = useRef(cached?.data);
    prevRef.current = cached?.data;

    const locked = !isPlus;

    const { data, generatedAt, loading, error, refresh } = useTopicAiPage({
        cached,
        persist: (d) => setDiscover(topic.id, d),
        generate: () => generateTopicDiscover(getCtx(), othersRef.current, prevRef.current),
        canGenerate: isPlus && opened, // fresh topics still generate starter content
        locked,
    });

    const isStarter = stats.totalEntries === 0;

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
                ready={!!data}
                loading={loading}
                error={error}
                onRetry={refresh}
                loadingMessage={
                    isStarter
                        ? `Imagining where your ${topic.title} topic could grow…`
                        : `Reading your ${topic.title} reflections…`
                }
                banner={isStarter ? 'Starting points — areas you may explore. This topic will grow around your entries.' : undefined}
                generatedAt={generatedAt}
                onRefresh={refresh}
            >
                {data && (
                    <>
                        {!!data.corePattern && (
                            <FocusCard
                                label={lens.labels.corePattern}
                                onRespond={() => setRespond({ section: lens.labels.corePattern, text: data.corePattern })}
                            >
                                <Text style={styles.bodyText}>{data.corePattern}</Text>
                            </FocusCard>
                        )}
                        {data.themes.length > 0 && (
                            <FocusCard label="Themes">
                                <ThemePills themes={data.themes} />
                            </FocusCard>
                        )}
                        {data.perspectives.length > 0 && (
                            <FocusCard
                                label={lens.labels.perspectives}
                                onRespond={() =>
                                    setRespond({ section: lens.labels.perspectives, text: data.perspectives.join('\n') })
                                }
                            >
                                <BulletList items={data.perspectives} />
                            </FocusCard>
                        )}
                        {data.connections.length > 0 && (
                            <FocusCard
                                label={lens.labels.connections}
                                onRespond={() =>
                                    setRespond({ section: lens.labels.connections, text: data.connections.join('\n') })
                                }
                            >
                                <BulletList items={data.connections} />
                            </FocusCard>
                        )}
                    </>
                )}
            </FocusPageScaffold>

            <RespondModal
                visible={!!respond}
                sectionLabel={respond?.section ?? ''}
                insightText={respond?.text ?? ''}
                onClose={() => setRespond(null)}
                onSave={(t) => {
                    if (respond) {
                        addTopicResponse(topic.id, t, {
                            sourcePage: 'discover',
                            sourceSection: respond.section,
                            originalInsight: respond.text,
                        });
                    }
                    setRespond(null);
                }}
            />

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
        fontSize: 15.5,
        color: 'rgba(255,255,255,0.85)',
        lineHeight: 23,
    },
});

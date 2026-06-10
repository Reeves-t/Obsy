import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import type { Topic, TopicStats } from '@/lib/topicStore';
import { useTopicStore } from '@/lib/topicStore';
import { useTopicAttachmentStore } from '@/lib/topicAttachmentStore';
import { useHabitGoalStore } from '@/lib/habitGoalStore';
import { useSubscription } from '@/hooks/useSubscription';
import { useTopicAiPage, useTopicContextRef } from '@/hooks/useTopicAiPage';
import { generateTopicEvolve } from '@/services/topicChatClient';
import { getLensDef, inferTopicLens } from '@/lib/topicLens';
import type { GoalHabitSuggestion } from '@/lib/topicAiTypes';
import { VanguardPaywall } from '@/components/paywall/VanguardPaywall';
import { HabitGoalCreateModal } from '@/components/insights/habitsGoals/HabitGoalCreateModal';
import { FocusPageScaffold } from './FocusPageScaffold';
import { FocusCard } from './FocusCard';
import { BulletList } from './BulletList';
import { GoalHabitSuggestionCard } from './GoalHabitSuggestionCard';
import { RespondModal } from './RespondModal';

interface TopicEvolvePageProps {
    topic: Topic;
    stats: TopicStats;
    isActive: boolean;
    onClose: () => void;
    topInset: number;
    bottomInset: number;
}

const JOURNEY_STAGES: { key: 'started' | 'current' | 'emerging'; label: string }[] = [
    { key: 'started', label: 'Started' },
    { key: 'current', label: 'Current' },
    { key: 'emerging', label: 'Emerging' },
];

/**
 * Page 3 — Evolve. Turns awareness into direction; section labels and AI framing
 * adapt to the topic's lens. Fresh topics get starter content. Plus-only.
 */
export function TopicEvolvePage({
    topic,
    stats,
    isActive,
    onClose,
    topInset,
    bottomInset,
}: TopicEvolvePageProps) {
    const { tier } = useSubscription();
    const isPlus = tier === 'plus';

    const cached = useTopicStore((s) => s.evolveCache[topic.id]);
    const setEvolve = useTopicStore((s) => s.setEvolve);
    const addTopicResponse = useTopicStore((s) => s.addTopicResponse);
    const loadForTopic = useTopicAttachmentStore((s) => s.loadForTopic);
    const addHabitGoal = useHabitGoalStore((s) => s.addHabitGoal);
    const getCtx = useTopicContextRef(topic, stats);

    const lens = getLensDef(topic.lens ?? inferTopicLens(topic.title, topic.description));

    const [showPaywall, setShowPaywall] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [seed, setSeed] = useState<GoalHabitSuggestion | null>(null);
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

    const prevRef = useRef(cached?.data);
    prevRef.current = cached?.data;

    const locked = !isPlus;

    const { data, generatedAt, loading, error, refresh } = useTopicAiPage({
        cached,
        persist: (d) => setEvolve(topic.id, d),
        generate: () => generateTopicEvolve(getCtx(), prevRef.current),
        canGenerate: isPlus && opened,
        locked,
    });

    const isStarter = stats.totalEntries === 0;

    const journeyStages = data ? JOURNEY_STAGES.filter((s) => !!data.journey[s.key]) : [];
    const journeyText = journeyStages.map((s) => `${s.label}: ${data!.journey[s.key]}`).join('\n');

    const openManualCreate = () => {
        setSeed(null);
        setCreateOpen(true);
    };

    const openEdit = (suggestion: GoalHabitSuggestion) => {
        setSeed(suggestion);
        setCreateOpen(true);
    };

    return (
        <>
            <FocusPageScaffold
                topic={topic}
                entryCount={stats.totalEntries}
                pageLabel="Evolve"
                onClose={onClose}
                topInset={topInset}
                bottomInset={bottomInset}
                locked={locked}
                teaserVariant="evolve"
                onUnlock={() => setShowPaywall(true)}
                ready={!!data}
                loading={loading}
                error={error}
                onRetry={refresh}
                loadingMessage={
                    isStarter
                        ? `Imagining where your ${topic.title} topic could go…`
                        : `Tracing how your ${topic.title} thinking has grown…`
                }
                banner={isStarter ? 'Starting points — this topic may grow around the ideas below.' : undefined}
                generatedAt={generatedAt}
                onRefresh={refresh}
            >
                {data && (
                    <>
                        {journeyStages.length > 0 && (
                            <FocusCard
                                label={lens.labels.journey}
                                onRespond={() => setRespond({ section: lens.labels.journey, text: journeyText })}
                            >
                                <View style={styles.journey}>
                                    {journeyStages.map((stage, i) => (
                                        <View key={stage.key} style={styles.journeyStage}>
                                            <View style={styles.journeyMarkerCol}>
                                                <View style={styles.journeyDot} />
                                                {i < journeyStages.length - 1 && <View style={styles.journeyLine} />}
                                            </View>
                                            <View style={styles.journeyTextCol}>
                                                <Text style={styles.journeyLabel}>{stage.label}</Text>
                                                <Text style={styles.journeyValue}>{data.journey[stage.key]}</Text>
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            </FocusCard>
                        )}

                        {data.realizations.length > 0 && (
                            <FocusCard
                                label={lens.labels.realizations}
                                onRespond={() =>
                                    setRespond({
                                        section: lens.labels.realizations,
                                        text: data.realizations.map((r) => (r.date ? `${r.date}: ${r.text}` : r.text)).join('\n'),
                                    })
                                }
                            >
                                <View style={styles.realizationList}>
                                    {data.realizations.map((r, i) => (
                                        <View key={i} style={styles.realization}>
                                            {!!r.date && <Text style={styles.realizationDate}>{r.date}</Text>}
                                            <Text style={styles.realizationText}>{r.text}</Text>
                                        </View>
                                    ))}
                                </View>
                            </FocusCard>
                        )}

                        {data.openThreads.length > 0 && (
                            <FocusCard
                                label={lens.labels.openThreads}
                                onRespond={() =>
                                    setRespond({ section: lens.labels.openThreads, text: data.openThreads.join('\n') })
                                }
                            >
                                <BulletList items={data.openThreads} />
                            </FocusCard>
                        )}

                        <FocusCard label={lens.labels.suggestions}>
                            <Text style={styles.growIntro}>
                                Turn this awareness into a daily habit or weekly goal.
                            </Text>
                            <View style={styles.suggestionStack}>
                                {data.suggestions.map((s, i) => (
                                    <GoalHabitSuggestionCard
                                        key={`${s.title}-${i}`}
                                        topic={topic}
                                        suggestion={s}
                                        getCtx={getCtx}
                                        onEdit={openEdit}
                                    />
                                ))}
                            </View>
                            <Pressable style={styles.manualBtn} onPress={openManualCreate}>
                                <Text style={styles.manualBtnText}>+ Create your own</Text>
                            </Pressable>
                        </FocusCard>
                    </>
                )}
            </FocusPageScaffold>

            <HabitGoalCreateModal
                visible={createOpen}
                defaultFrequency={seed?.frequency ?? 'daily'}
                initialType={seed?.type}
                initialTitle={seed?.title}
                initialNote={seed?.note}
                initialLinkedTopicId={topic.id}
                onClose={() => setCreateOpen(false)}
                onSave={(input) => {
                    addHabitGoal(input);
                    setCreateOpen(false);
                }}
            />

            <RespondModal
                visible={!!respond}
                sectionLabel={respond?.section ?? ''}
                insightText={respond?.text ?? ''}
                onClose={() => setRespond(null)}
                onSave={(t) => {
                    if (respond) {
                        addTopicResponse(topic.id, t, {
                            sourcePage: 'evolve',
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
    // Journey
    journey: {
        gap: 0,
    },
    journeyStage: {
        flexDirection: 'row',
        gap: 12,
    },
    journeyMarkerCol: {
        alignItems: 'center',
        width: 10,
    },
    journeyDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.55)',
        marginTop: 4,
    },
    journeyLine: {
        flex: 1,
        width: 1.5,
        backgroundColor: 'rgba(255,255,255,0.12)',
        marginVertical: 3,
    },
    journeyTextCol: {
        flex: 1,
        paddingBottom: 14,
    },
    journeyLabel: {
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.4)',
    },
    journeyValue: {
        fontSize: 15,
        color: 'rgba(255,255,255,0.85)',
        lineHeight: 21,
        marginTop: 3,
    },
    // Realizations
    realizationList: {
        gap: 12,
    },
    realization: {
        gap: 3,
    },
    realizationDate: {
        fontSize: 11.5,
        fontWeight: '600',
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        color: 'rgba(180,200,255,0.7)',
    },
    realizationText: {
        fontSize: 15,
        color: 'rgba(255,255,255,0.82)',
        lineHeight: 21,
    },
    // Grow
    growIntro: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.55)',
        lineHeight: 20,
    },
    suggestionStack: {
        gap: 10,
    },
    manualBtn: {
        paddingVertical: 11,
        borderRadius: 12,
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        borderStyle: 'dashed',
    },
    manualBtnText: {
        fontSize: 14.5,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.7)',
    },
});

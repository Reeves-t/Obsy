import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
    Modal,
    View,
    Text,
    Pressable,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle as SvgCircle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { AmbientBackground } from '@/components/ui/AmbientBackground';

import type { Topic, TopicStats } from '@/lib/topicStore';
import { useTopicStore } from '@/lib/topicStore';
import { useCaptureStore } from '@/lib/captureStore';
import { useTopicAttachmentStore } from '@/lib/topicAttachmentStore';
import { generateTopicInsight } from '@/services/topicChatClient';

interface TopicInsightModalProps {
    visible: boolean;
    topic: Topic;
    stats: TopicStats;
    toneLabel: string;
    onClose: () => void;
}

function SparkleIcon({ color = '#0b0c10' }: { color?: string }) {
    return (
        <Svg width={14} height={14} viewBox="0 0 16 16" fill="none">
            <Path
                d="M8 1.5l1.4 3.6L13 6.5l-3.6 1.4L8 11.5 6.6 7.9 3 6.5l3.6-1.4L8 1.5z"
                fill={color}
            />
            <SvgCircle cx={13} cy={12} r={1} fill={color} />
            <SvgCircle cx={3.5} cy={12.5} r={0.7} fill={color} opacity={0.6} />
        </Svg>
    );
}

export function TopicInsightModal({
    visible,
    topic,
    stats,
    toneLabel,
    onClose,
}: TopicInsightModalProps) {
    const captures = useCaptureStore(s => s.captures);
    const topicNotes = useTopicStore(s => s.topicNotes);
    const addTopicNote = useTopicStore(s => s.addTopicNote);
    const removeTopicNote = useTopicStore(s => s.removeTopicNote);
    const attachments = useTopicAttachmentStore(s => s.attachments);
    const loadAttachmentsForTopic = useTopicAttachmentStore(s => s.loadForTopic);

    const [insight, setInsight] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [postedId, setPostedId] = useState<string | null>(null);

    // The parent topics screen re-renders at 60Hz from the orb physics tick,
    // producing a fresh `stats` object every render. Hold the latest values
    // in refs so the generate effect doesn't refire each frame.
    const topicRef = useRef(topic);
    const statsRef = useRef(stats);
    const capturesRef = useRef(captures);
    const topicNotesRef = useRef(topicNotes);
    const attachmentsRef = useRef(attachments);
    useEffect(() => { topicRef.current = topic; }, [topic]);
    useEffect(() => { statsRef.current = stats; }, [stats]);
    useEffect(() => { capturesRef.current = captures; }, [captures]);
    useEffect(() => { topicNotesRef.current = topicNotes; }, [topicNotes]);
    useEffect(() => { attachmentsRef.current = attachments; }, [attachments]);

    const runGenerate = useCallback(async () => {
        setLoading(true);
        setErrorMessage(null);
        setInsight('');
        setPostedId(null);
        try {
            const result = await generateTopicInsight({
                topic: topicRef.current,
                stats: statsRef.current,
                captures: capturesRef.current,
                topicNotes: topicNotesRef.current,
                attachments: attachmentsRef.current,
            });
            if (result.ok && result.text) {
                setInsight(result.text.trim());
            } else {
                setErrorMessage('Could not generate an insight. Try again in a moment.');
            }
        } catch {
            setErrorMessage('Lost the connection for a second. Try again.');
        } finally {
            setLoading(false);
        }
    }, []);

    // Fire generation exactly once per modal-open. Reset the latch on close
    // so the next open kicks off a fresh generation.
    const generatedForOpenRef = useRef(false);
    useEffect(() => {
        if (!visible) {
            generatedForOpenRef.current = false;
            return;
        }
        if (generatedForOpenRef.current) return;
        generatedForOpenRef.current = true;
        // Refresh attachments so the digest sees the latest extracted text.
        loadAttachmentsForTopic(topic.id);
        runGenerate();
    }, [visible, runGenerate]);

    // Sync postedId if the underlying note disappears (e.g. removed elsewhere)
    useEffect(() => {
        if (postedId && !topicNotes.some(n => n.id === postedId)) {
            setPostedId(null);
        }
    }, [postedId, topicNotes]);

    const handlePostToFeed = useCallback(() => {
        if (!insight) return;
        if (postedId) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        // Snapshot length before insert, then derive the new note's id from the store.
        const before = useTopicStore.getState().topicNotes.length;
        addTopicNote(topic.id, insight, 'insight');
        const after = useTopicStore.getState().topicNotes;
        if (after.length > before) {
            setPostedId(after[0].id);
        }
    }, [insight, postedId, addTopicNote, topic.id]);

    const handleUnpost = useCallback(() => {
        if (!postedId) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        removeTopicNote(postedId);
        setPostedId(null);
    }, [postedId, removeTopicNote]);

    const handleRegenerate = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setPostedId(null);
        runGenerate();
    }, [runGenerate]);

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            statusBarTranslucent
            onRequestClose={onClose}
        >
            <AmbientBackground />
            <Pressable style={styles.backdrop} onPress={onClose} />

            <View style={styles.centerWrap} pointerEvents="box-none">
                <View style={styles.card}>
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.headerLeft}>
                            <View style={styles.chip}>
                                <SparkleIcon color="#fff" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.heading}>Insight</Text>
                                <Text style={styles.subheading} numberOfLines={1}>
                                    {toneLabel} {'·'} {topic.title}
                                </Text>
                            </View>
                        </View>
                        <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
                            <Text style={styles.closeGlyph}>✕</Text>
                        </Pressable>
                    </View>

                    {/* Body */}
                    <ScrollView
                        style={styles.bodyScroll}
                        contentContainerStyle={styles.bodyContent}
                        showsVerticalScrollIndicator={false}
                    >
                        {loading ? (
                            <View style={styles.loadingRow}>
                                <ActivityIndicator color="rgba(255,255,255,0.6)" />
                                <Text style={styles.loadingText}>
                                    Reading your {topic.title} reflections...
                                </Text>
                            </View>
                        ) : errorMessage ? (
                            <Text style={styles.errorText}>{errorMessage}</Text>
                        ) : (
                            <Text style={styles.insightText}>{insight}</Text>
                        )}
                    </ScrollView>

                    {/* Footer actions */}
                    <View style={styles.footer}>
                        <Pressable
                            style={styles.secondaryBtn}
                            onPress={handleRegenerate}
                            disabled={loading}
                        >
                            <Text style={[styles.secondaryLabel, loading && { opacity: 0.4 }]}>
                                Regenerate
                            </Text>
                        </Pressable>

                        {postedId ? (
                            <Pressable
                                style={styles.removeBtn}
                                onPress={handleUnpost}
                                disabled={loading}
                            >
                                <Text style={styles.removeLabel}>Remove from feed</Text>
                            </Pressable>
                        ) : (
                            <Pressable
                                style={styles.primaryBtn}
                                onPress={handlePostToFeed}
                                disabled={loading || !insight}
                            >
                                <LinearGradient
                                    colors={['rgba(255,255,255,0.96)', 'rgba(232,234,240,0.92)']}
                                    start={{ x: 0.5, y: 0 }}
                                    end={{ x: 0.5, y: 1 }}
                                    style={[StyleSheet.absoluteFillObject, { borderRadius: 12 }]}
                                />
                                <Text style={[styles.primaryLabel, (loading || !insight) && { opacity: 0.4 }]}>
                                    Post to feed
                                </Text>
                            </Pressable>
                        )}
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'transparent',
    },
    centerWrap: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    card: {
        width: '100%',
        maxWidth: 420,
        maxHeight: '78%',
        borderRadius: 22,
        backgroundColor: 'rgba(12,14,22,0.55)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 18,
        paddingTop: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.06)',
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flex: 1,
    },
    chip: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(139,34,82,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    heading: {
        fontSize: 15,
        fontWeight: '600',
        color: '#fff',
        letterSpacing: -0.1,
    },
    subheading: {
        fontSize: 11.5,
        color: 'rgba(255,255,255,0.5)',
        marginTop: 2,
        letterSpacing: 0.1,
    },
    closeBtn: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.06)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    closeGlyph: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
    },
    bodyScroll: {
        flexGrow: 0,
    },
    bodyContent: {
        paddingHorizontal: 18,
        paddingVertical: 18,
    },
    loadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 18,
    },
    loadingText: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.55)',
    },
    errorText: {
        fontSize: 14,
        color: 'rgba(255,180,160,0.8)',
        lineHeight: 21,
    },
    insightText: {
        fontSize: 15,
        color: 'rgba(255,255,255,0.9)',
        lineHeight: 23,
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.06)',
    },
    secondaryBtn: {
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    secondaryLabel: {
        fontSize: 13,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.7)',
    },
    primaryBtn: {
        paddingVertical: 10,
        paddingHorizontal: 18,
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.5)',
        minWidth: 130,
        alignItems: 'center',
    },
    primaryLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: '#0b0c10',
    },
    removeBtn: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 12,
        backgroundColor: 'rgba(232,147,90,0.14)',
        borderWidth: 1,
        borderColor: 'rgba(232,147,90,0.35)',
        minWidth: 130,
        alignItems: 'center',
    },
    removeLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: '#e8935a',
    },
});

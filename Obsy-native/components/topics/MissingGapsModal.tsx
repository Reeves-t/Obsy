import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
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
import { BlurView } from 'expo-blur';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';

import type { Topic, TopicStats } from '@/lib/topicStore';
import { useTopicStore } from '@/lib/topicStore';
import { useCaptureStore } from '@/lib/captureStore';
import { useTopicAttachmentStore } from '@/lib/topicAttachmentStore';
import { generateMissingGaps } from '@/services/topicChatClient';

interface MissingGapsModalProps {
    visible: boolean;
    topic: Topic;
    stats: TopicStats;
    onClose: () => void;
}

// Known section headings the AI may emit. Used to detect section boundaries.
const SECTION_HEADINGS = [
    'Potential Blind Spots',
    'Questions Worth Answering',
    'Weak Structure Areas',
    'Possible Next Steps',
    'Repeated Patterns',
    'Contradictions Detected',
];

interface ParsedSection {
    heading: string;
    bullets: string[];
}

interface ParsedGaps {
    sections: ParsedSection[];
    flatText: string; // fallback rendering when sections can't be parsed
}

function parseGapsOutput(raw: string): ParsedGaps {
    const text = raw.trim();
    if (!text) return { sections: [], flatText: '' };

    const lines = text.split('\n').map(l => l.trim());
    const sections: ParsedSection[] = [];
    let current: ParsedSection | null = null;

    for (const line of lines) {
        if (!line) continue;

        const matchedHeading = SECTION_HEADINGS.find(
            h => line.toLowerCase() === h.toLowerCase(),
        );

        if (matchedHeading) {
            if (current) sections.push(current);
            current = { heading: matchedHeading, bullets: [] };
            continue;
        }

        if (current) {
            // Strip leading bullet glyphs (•, -, *) and surrounding whitespace.
            const cleaned = line.replace(/^[•\-\*]\s*/, '').trim();
            if (cleaned) current.bullets.push(cleaned);
        }
    }

    if (current) sections.push(current);

    return {
        sections: sections.filter(s => s.bullets.length > 0),
        flatText: text,
    };
}

function GapIcon() {
    return (
        <Svg width={14} height={14} viewBox="0 0 16 16" fill="none">
            <Path
                d="M3 3h4v4H3V3zm6 0h4v4H9V3zM3 9h4v4H3V9zm6 3h4M9 10v3"
                stroke="#fff"
                strokeWidth={1.4}
                strokeLinecap="round"
            />
        </Svg>
    );
}

export function MissingGapsModal({
    visible,
    topic,
    stats,
    onClose,
}: MissingGapsModalProps) {
    const captures = useCaptureStore(s => s.captures);
    const topicNotes = useTopicStore(s => s.topicNotes);
    const addTopicNote = useTopicStore(s => s.addTopicNote);
    const removeTopicNote = useTopicStore(s => s.removeTopicNote);
    const attachments = useTopicAttachmentStore(s => s.attachments);
    const loadAttachmentsForTopic = useTopicAttachmentStore(s => s.loadForTopic);

    const [rawOutput, setRawOutput] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [savedNoteId, setSavedNoteId] = useState<string | null>(null);

    const parsed = useMemo(() => parseGapsOutput(rawOutput), [rawOutput]);

    // Parent topics screen re-renders at 60Hz (orb physics tick), producing
    // fresh `stats` objects every frame. Hold latest values in refs so the
    // generate effect doesn't refire each frame.
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
        setRawOutput('');
        setSavedNoteId(null);
        try {
            const result = await generateMissingGaps({
                topic: topicRef.current,
                stats: statsRef.current,
                captures: capturesRef.current,
                topicNotes: topicNotesRef.current,
                attachments: attachmentsRef.current,
            });
            if (result.ok && result.text) {
                setRawOutput(result.text.trim());
            } else {
                setErrorMessage('Could not surface gaps right now. Try again in a moment.');
            }
        } catch {
            setErrorMessage('Lost the connection. Try again.');
        } finally {
            setLoading(false);
        }
    }, []);

    // Fire generation exactly once per modal-open. Reset latch on close.
    const generatedForOpenRef = useRef(false);
    useEffect(() => {
        if (!visible) {
            generatedForOpenRef.current = false;
            return;
        }
        if (generatedForOpenRef.current) return;
        generatedForOpenRef.current = true;
        loadAttachmentsForTopic(topic.id);
        runGenerate();
    }, [visible, runGenerate, loadAttachmentsForTopic, topic.id]);

    // If the saved note is removed externally, clear our reference.
    useEffect(() => {
        if (savedNoteId && !topicNotes.some(n => n.id === savedNoteId)) {
            setSavedNoteId(null);
        }
    }, [savedNoteId, topicNotes]);

    const handleSaveToNotes = useCallback(() => {
        if (!rawOutput) return;
        if (savedNoteId) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const before = useTopicStore.getState().topicNotes.length;
        addTopicNote(topic.id, rawOutput, 'missing_gaps');
        const after = useTopicStore.getState().topicNotes;
        if (after.length > before) {
            setSavedNoteId(after[0].id);
        }
    }, [rawOutput, savedNoteId, addTopicNote, topic.id]);

    const handleUnsave = useCallback(() => {
        if (!savedNoteId) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        removeTopicNote(savedNoteId);
        setSavedNoteId(null);
    }, [savedNoteId, removeTopicNote]);

    const handleRegenerate = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setSavedNoteId(null);
        runGenerate();
    }, [runGenerate]);

    const hasContent = !loading && !errorMessage && rawOutput.length > 0;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            statusBarTranslucent
            onRequestClose={onClose}
        >
            <Pressable style={styles.backdrop} onPress={onClose}>
                <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFillObject} />
            </Pressable>

            <View style={styles.centerWrap} pointerEvents="box-none">
                <View style={styles.card}>
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.headerLeft}>
                            <View style={styles.chip}>
                                <GapIcon />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.heading}>Missing Gaps</Text>
                                <Text style={styles.subheading} numberOfLines={1}>
                                    {topic.title}
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
                                    Looking for gaps in this topic...
                                </Text>
                            </View>
                        ) : errorMessage ? (
                            <Text style={styles.errorText}>{errorMessage}</Text>
                        ) : parsed.sections.length > 0 ? (
                            parsed.sections.map(section => (
                                <View key={section.heading} style={styles.section}>
                                    <Text style={styles.sectionHeading}>
                                        {section.heading}
                                    </Text>
                                    {section.bullets.map((b, i) => (
                                        <View key={i} style={styles.bulletRow}>
                                            <Text style={styles.bulletDot}>{'•'}</Text>
                                            <Text style={styles.bulletText}>{b}</Text>
                                        </View>
                                    ))}
                                </View>
                            ))
                        ) : (
                            // Fallback when parser found no recognized sections.
                            <Text style={styles.flatText}>{parsed.flatText}</Text>
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

                        {savedNoteId ? (
                            <Pressable
                                style={styles.removeBtn}
                                onPress={handleUnsave}
                                disabled={loading}
                            >
                                <Text style={styles.removeLabel}>Remove from notes</Text>
                            </Pressable>
                        ) : (
                            <Pressable
                                style={styles.primaryBtn}
                                onPress={handleSaveToNotes}
                                disabled={!hasContent}
                            >
                                <LinearGradient
                                    colors={['rgba(255,255,255,0.96)', 'rgba(232,234,240,0.92)']}
                                    start={{ x: 0.5, y: 0 }}
                                    end={{ x: 0.5, y: 1 }}
                                    style={[StyleSheet.absoluteFillObject, { borderRadius: 12 }]}
                                />
                                <Text
                                    style={[
                                        styles.primaryLabel,
                                        !hasContent && { opacity: 0.4 },
                                    ]}
                                >
                                    Save to notes
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
        backgroundColor: 'rgba(6,6,10,0.55)',
    },
    centerWrap: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    card: {
        width: '100%',
        maxWidth: 440,
        maxHeight: '82%',
        borderRadius: 22,
        backgroundColor: 'rgba(18,18,26,0.96)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
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
        backgroundColor: 'rgba(70,90,140,0.45)',
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
        gap: 18,
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
        color: 'rgba(232,180,160,0.85)',
        lineHeight: 21,
    },
    section: {
        gap: 6,
    },
    sectionHeading: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1.0,
        textTransform: 'uppercase',
        color: 'rgba(180,200,240,0.85)',
        marginBottom: 4,
    },
    bulletRow: {
        flexDirection: 'row',
        gap: 8,
        paddingRight: 4,
    },
    bulletDot: {
        fontSize: 14,
        color: 'rgba(180,200,240,0.7)',
        lineHeight: 21,
        width: 10,
    },
    bulletText: {
        flex: 1,
        fontSize: 14,
        color: 'rgba(255,255,255,0.88)',
        lineHeight: 21,
    },
    flatText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.88)',
        lineHeight: 22,
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
        minWidth: 140,
        alignItems: 'center',
    },
    removeLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: '#e8935a',
    },
});

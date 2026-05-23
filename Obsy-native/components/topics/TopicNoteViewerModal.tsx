import React, { useMemo, useCallback } from 'react';
import {
    Modal,
    View,
    Text,
    Pressable,
    StyleSheet,
    ScrollView,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import type { TopicNote } from '@/lib/topicStore';
import { useTopicStore } from '@/lib/topicStore';

interface TopicNoteViewerModalProps {
    note: TopicNote | null;
    onClose: () => void;
}

const GAP_SECTION_HEADINGS = [
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

function parseGapsOutput(raw: string): ParsedSection[] {
    const lines = raw.split('\n').map(l => l.trim());
    const sections: ParsedSection[] = [];
    let current: ParsedSection | null = null;
    for (const line of lines) {
        if (!line) continue;
        const matched = GAP_SECTION_HEADINGS.find(h => line.toLowerCase() === h.toLowerCase());
        if (matched) {
            if (current) sections.push(current);
            current = { heading: matched, bullets: [] };
            continue;
        }
        if (current) {
            const cleaned = line.replace(/^[•\-\*]\s*/, '').trim();
            if (cleaned) current.bullets.push(cleaned);
        }
    }
    if (current) sections.push(current);
    return sections.filter(s => s.bullets.length > 0);
}

export function TopicNoteViewerModal({ note, onClose }: TopicNoteViewerModalProps) {
    const removeTopicNote = useTopicStore(s => s.removeTopicNote);

    const kind = note?.kind ?? 'note';
    const heading =
        kind === 'insight' ? 'Insight' :
        kind === 'missing_gaps' ? 'Missing Gaps' :
        'Note';

    const accent =
        kind === 'insight' ? 'rgba(139,34,82,0.5)' :
        kind === 'missing_gaps' ? 'rgba(70,90,140,0.5)' :
        'rgba(255,255,255,0.15)';

    const dateStr = note
        ? new Date(note.createdAt).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
          })
        : '';

    const gapSections = useMemo(
        () => (kind === 'missing_gaps' && note ? parseGapsOutput(note.text) : []),
        [kind, note],
    );

    const handleRemove = useCallback(() => {
        if (!note) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        removeTopicNote(note.id);
        onClose();
    }, [note, removeTopicNote, onClose]);

    return (
        <Modal
            visible={!!note}
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
                        <View style={[styles.accent, { backgroundColor: accent }]} />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.heading}>{heading}</Text>
                            <Text style={styles.subheading}>{dateStr}</Text>
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
                        {note && kind === 'missing_gaps' && gapSections.length > 0 ? (
                            gapSections.map(section => (
                                <View key={section.heading} style={styles.section}>
                                    <Text style={styles.sectionHeading}>{section.heading}</Text>
                                    {section.bullets.map((b, i) => (
                                        <View key={i} style={styles.bulletRow}>
                                            <Text style={styles.bulletDot}>{'•'}</Text>
                                            <Text style={styles.bulletText}>{b}</Text>
                                        </View>
                                    ))}
                                </View>
                            ))
                        ) : note ? (
                            <Text style={styles.bodyText}>{note.text}</Text>
                        ) : null}
                    </ScrollView>

                    {/* Footer */}
                    <View style={styles.footer}>
                        <Pressable style={styles.removeBtn} onPress={handleRemove}>
                            <Text style={styles.removeLabel}>Remove</Text>
                        </Pressable>
                        <Pressable style={styles.doneBtn} onPress={onClose}>
                            <Text style={styles.doneLabel}>Done</Text>
                        </Pressable>
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
        gap: 10,
        paddingHorizontal: 18,
        paddingTop: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.06)',
    },
    accent: {
        width: 4,
        height: 22,
        borderRadius: 2,
    },
    heading: {
        fontSize: 15,
        fontWeight: '600',
        color: '#fff',
        letterSpacing: -0.1,
    },
    subheading: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.45)',
        marginTop: 2,
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
    bodyText: {
        fontSize: 15,
        color: 'rgba(255,255,255,0.88)',
        lineHeight: 23,
    },
    section: { gap: 6 },
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
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.06)',
    },
    removeBtn: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 12,
        backgroundColor: 'rgba(232,147,90,0.14)',
        borderWidth: 1,
        borderColor: 'rgba(232,147,90,0.35)',
    },
    removeLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: '#e8935a',
    },
    doneBtn: {
        paddingVertical: 10,
        paddingHorizontal: 22,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.96)',
    },
    doneLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: '#0b0c10',
    },
});

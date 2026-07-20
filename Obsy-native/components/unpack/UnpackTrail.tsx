import React, { useState } from 'react';
import { LayoutAnimation, Platform, StyleSheet, TouchableOpacity, UIManager, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/ui/ThemedText';
import { useObsyTheme } from '@/contexts/ThemeContext';
import type { UnpackPayload } from '@/lib/unpack/types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface UnpackTrailProps {
    payload: UnpackPayload;
}

const ENTRY_TYPE_LABEL: Record<UnpackPayload['originalEntryType'], string> = {
    text: 'Original thought',
    photo: 'Original photo note',
    voice: 'Voice transcript',
    link: 'Shared link',
};

/**
 * Collapsible "Unpack trail" for the entry-detail view: the original input, the
 * clarifying questions and answers, and the source media/link that seeded the
 * guided reflection. Collapsed by default.
 */
export function UnpackTrail({ payload }: UnpackTrailProps) {
    const { colors, isLight } = useObsyTheme();
    const [expanded, setExpanded] = useState(false);

    const border = isLight ? colors.cardBorder : 'rgba(255,255,255,0.10)';
    const subtle = isLight ? colors.textSecondary : colors.textTertiary;

    const toggle = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpanded((v) => !v);
    };

    const originalInput =
        payload.originalEntryType === 'voice'
            ? payload.voiceTranscript || payload.originalText
            : payload.originalText;

    const answered = payload.questions?.filter((q) => !q.skipped && q.answer?.trim()) ?? [];

    return (
        <View style={[styles.card, { borderColor: border }]}>
            <TouchableOpacity style={styles.header} onPress={toggle} activeOpacity={0.7}>
                <ThemedText style={styles.headerLabel}>Unpack trail</ThemedText>
                <Ionicons
                    name={expanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={subtle}
                />
            </TouchableOpacity>

            {expanded && (
                <View style={styles.body}>
                    {/* Original input */}
                    {originalInput ? (
                        <View style={styles.section}>
                            <ThemedText style={[styles.sectionLabel, { color: subtle }]}>
                                {ENTRY_TYPE_LABEL[payload.originalEntryType]}
                            </ThemedText>
                            <ThemedText style={styles.sectionText}>{originalInput}</ThemedText>
                        </View>
                    ) : null}

                    {/* Shared link source */}
                    {payload.sharedLink?.url ? (
                        <View style={styles.section}>
                            <ThemedText style={[styles.sectionLabel, { color: subtle }]}>Source</ThemedText>
                            {payload.sharedLink.title ? (
                                <ThemedText style={styles.sectionText}>{payload.sharedLink.title}</ThemedText>
                            ) : null}
                            <ThemedText style={[styles.linkUrl, { color: subtle }]} numberOfLines={1}>
                                {payload.sharedLink.source || payload.sharedLink.url}
                            </ThemedText>
                            {payload.sharedLink.summary ? (
                                <ThemedText style={[styles.sectionText, { marginTop: 6 }]}>
                                    {payload.sharedLink.summary}
                                </ThemedText>
                            ) : null}
                        </View>
                    ) : null}

                    {/* Questions & answers */}
                    {answered.length > 0 ? (
                        <View style={styles.section}>
                            <ThemedText style={[styles.sectionLabel, { color: subtle }]}>
                                Clarifying questions
                            </ThemedText>
                            {answered.map((q, i) => (
                                <View key={i} style={styles.qa}>
                                    <ThemedText style={[styles.question, { color: subtle }]}>
                                        {q.question}
                                    </ThemedText>
                                    <ThemedText style={styles.answer}>{q.answer}</ThemedText>
                                </View>
                            ))}
                        </View>
                    ) : null}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        borderWidth: 1,
        borderRadius: 14,
        paddingHorizontal: 16,
        paddingVertical: 4,
        marginTop: 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
    },
    headerLabel: {
        fontSize: 15,
        fontWeight: '600',
    },
    body: {
        paddingBottom: 14,
    },
    section: {
        marginBottom: 16,
    },
    sectionLabel: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        marginBottom: 6,
    },
    sectionText: {
        fontSize: 15,
        lineHeight: 22,
    },
    linkUrl: {
        fontSize: 13,
        marginTop: 2,
    },
    qa: {
        marginBottom: 12,
    },
    question: {
        fontSize: 13.5,
        marginBottom: 3,
    },
    answer: {
        fontSize: 15,
        lineHeight: 22,
    },
});

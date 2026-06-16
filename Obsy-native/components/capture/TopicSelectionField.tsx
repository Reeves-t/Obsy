import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/ui/ThemedText';
import Colors from '@/constants/Colors';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { useTopicStore } from '@/lib/topicStore';

interface TopicSelectionFieldProps {
    selectedTopicId: string | null;
    onTopicChange: (topicId: string | null) => void;
    label?: string;
    helper?: string;
}

export function topicTagForId(topicId: string | null | undefined) {
    return topicId ? `topic:${topicId}` : null;
}

export function TopicSelectionField({
    selectedTopicId,
    onTopicChange,
    label = 'TOPIC',
    helper,
}: TopicSelectionFieldProps) {
    const { topics } = useTopicStore();
    const { colors, isLight } = useObsyTheme();

    const idleBg = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)';
    const idleBorder = isLight ? 'rgba(0,0,0,0.09)' : 'rgba(255,255,255,0.11)';
    const selectedBg = isLight ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.12)';
    const selectedBorder = isLight ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.24)';

    return (
        <View style={styles.wrapper}>
            <View style={styles.labelRow}>
                <ThemedText style={[styles.label, { color: colors.textTertiary }]}>
                    {label}
                </ThemedText>
                {helper ? (
                    <ThemedText style={[styles.helper, { color: colors.textTertiary }]} numberOfLines={1}>
                        {helper}
                    </ThemedText>
                ) : null}
            </View>

            {topics.length === 0 ? (
                <View style={[styles.emptyState, { backgroundColor: idleBg, borderColor: idleBorder }]}>
                    <Ionicons name="folder-open-outline" size={15} color={colors.textTertiary} />
                    <ThemedText style={[styles.emptyText, { color: colors.textTertiary }]}>
                        No topics yet. Create one in Topics.
                    </ThemedText>
                </View>
            ) : (
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.topicRow}
                    keyboardShouldPersistTaps="handled"
                >
                    <TouchableOpacity
                        activeOpacity={0.78}
                        onPress={() => onTopicChange(null)}
                        style={[
                            styles.topicChip,
                            {
                                backgroundColor: selectedTopicId ? idleBg : selectedBg,
                                borderColor: selectedTopicId ? idleBorder : selectedBorder,
                            },
                        ]}
                    >
                        <Ionicons
                            name="close-circle-outline"
                            size={14}
                            color={selectedTopicId ? colors.textTertiary : Colors.obsy.silver}
                        />
                        <ThemedText
                            style={[
                                styles.topicChipText,
                                { color: selectedTopicId ? colors.textSecondary : colors.text },
                            ]}
                        >
                            None
                        </ThemedText>
                    </TouchableOpacity>

                    {topics.map((topic) => {
                        const isSelected = selectedTopicId === topic.id;
                        const accent = `hsla(${topic.hue}, 62%, 56%, ${isSelected ? 0.34 : 0.18})`;
                        const border = `hsla(${topic.hue}, 62%, 56%, ${isSelected ? 0.72 : 0.34})`;

                        return (
                            <TouchableOpacity
                                key={topic.id}
                                activeOpacity={0.78}
                                onPress={() => onTopicChange(isSelected ? null : topic.id)}
                                style={[
                                    styles.topicChip,
                                    {
                                        backgroundColor: isSelected ? accent : idleBg,
                                        borderColor: isSelected ? border : idleBorder,
                                    },
                                ]}
                            >
                                <View
                                    style={[
                                        styles.topicDot,
                                        { backgroundColor: `hsl(${topic.hue}, 62%, 56%)` },
                                    ]}
                                />
                                <ThemedText
                                    style={[
                                        styles.topicChipText,
                                        { color: isSelected ? colors.text : colors.textSecondary },
                                    ]}
                                    numberOfLines={1}
                                >
                                    {topic.title}
                                </ThemedText>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        gap: 10,
    },
    labelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },
    label: {
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 1.2,
    },
    helper: {
        flex: 1,
        textAlign: 'right',
        fontSize: 11,
    },
    topicRow: {
        gap: 8,
        paddingRight: 4,
        minHeight: 42,
        alignItems: 'center',
    },
    topicChip: {
        minHeight: 38,
        maxWidth: 190,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        paddingHorizontal: 13,
        paddingVertical: 9,
        borderRadius: 999,
        borderWidth: 1,
    },
    topicDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    topicChipText: {
        fontSize: 13,
        fontWeight: '600',
    },
    emptyState: {
        minHeight: 42,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 13,
        borderRadius: 12,
        borderWidth: 1,
    },
    emptyText: {
        flex: 1,
        fontSize: 12.5,
    },
});

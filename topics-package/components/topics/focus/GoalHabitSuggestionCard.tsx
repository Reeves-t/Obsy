import React, { useState } from 'react';
import {
    StyleSheet,
    View,
    Text,
    Pressable,
    TextInput,
    ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import type { Topic } from '@/lib/topicStore';
import { useHabitGoalStore } from '@/lib/habitGoalStore';
import type { GoalHabitSuggestion } from '@/lib/topicAiTypes';
import type { TopicContext } from '@/services/topicChatClient';
import { suggestTopicGoalHabit } from '@/services/topicChatClient';
import { canRefineGoalSuggestion, goalSuggestionEditsRemaining } from '@/lib/topicFocusRules';

interface GoalHabitSuggestionCardProps {
    topic: Topic;
    suggestion: GoalHabitSuggestion;
    getCtx: () => TopicContext;
    /** Open the full create modal prefilled with the current suggestion. */
    onEdit: (suggestion: GoalHabitSuggestion) => void;
}

export function GoalHabitSuggestionCard({ topic, suggestion, getCtx, onEdit }: GoalHabitSuggestionCardProps) {
    const addHabitGoal = useHabitGoalStore((s) => s.addHabitGoal);

    const [current, setCurrent] = useState<GoalHabitSuggestion>(suggestion);
    const [genCount, setGenCount] = useState(1);
    const [changeText, setChangeText] = useState('');
    const [refining, setRefining] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [added, setAdded] = useState(false);

    const editsLeft = goalSuggestionEditsRemaining(genCount);
    const canRefine = canRefineGoalSuggestion(genCount) && !added;

    const chipLabel = `${current.frequency === 'daily' ? 'Daily' : 'Weekly'} ${current.type}`;

    const handleRefine = async () => {
        const request = changeText.trim();
        if (!request || refining || !canRefine) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setRefining(true);
        setError(null);
        try {
            const res = await suggestTopicGoalHabit(getCtx(), request, current);
            if (res.ok && res.data && res.data[0]) {
                setCurrent(res.data[0]);
                setGenCount((n) => n + 1);
                setChangeText('');
            } else {
                setError('Couldn’t revise that one. Try rephrasing.');
            }
        } catch {
            setError('Lost the connection for a second. Try again.');
        } finally {
            setRefining(false);
        }
    };

    const handleAdd = () => {
        if (added) return;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        addHabitGoal({
            type: current.type,
            title: current.title,
            frequency: current.frequency,
            linkedTopicId: topic.id,
            note: current.note,
        });
        setAdded(true);
    };

    return (
        <View style={styles.card}>
            <View style={styles.topRow}>
                <View style={styles.chip}>
                    <Text style={styles.chipText}>{chipLabel}</Text>
                </View>
            </View>

            <Text style={styles.title}>{current.title}</Text>
            {current.note ? <Text style={styles.note}>{current.note}</Text> : null}

            {added ? (
                <View style={styles.addedRow}>
                    <Text style={styles.addedGlyph}>✓</Text>
                    <Text style={styles.addedText}>
                        Added to your {current.frequency} {current.type}s
                    </Text>
                </View>
            ) : (
                <>
                    <View style={styles.actionRow}>
                        <Pressable style={styles.addBtn} onPress={handleAdd}>
                            <Text style={styles.addBtnText}>Add</Text>
                        </Pressable>
                        <Pressable style={styles.editBtn} onPress={() => onEdit(current)}>
                            <Text style={styles.editBtnText}>Edit</Text>
                        </Pressable>
                    </View>

                    {canRefine && (
                        <View style={styles.refineWrap}>
                            <View style={styles.refineRow}>
                                <TextInput
                                    value={changeText}
                                    onChangeText={setChangeText}
                                    placeholder="Tell Obsy what to change…"
                                    placeholderTextColor="rgba(255,255,255,0.3)"
                                    style={styles.refineInput}
                                    editable={!refining}
                                    returnKeyType="send"
                                    onSubmitEditing={handleRefine}
                                />
                                <Pressable
                                    style={styles.refineSend}
                                    onPress={handleRefine}
                                    disabled={refining || !changeText.trim()}
                                    hitSlop={6}
                                >
                                    {refining ? (
                                        <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" />
                                    ) : (
                                        <Text
                                            style={[
                                                styles.refineSendGlyph,
                                                !changeText.trim() && { opacity: 0.35 },
                                            ]}
                                        >
                                            ↑
                                        </Text>
                                    )}
                                </Pressable>
                            </View>
                            <Text style={styles.refineHint}>
                                {error
                                    ? error
                                    : `${editsLeft} ${editsLeft === 1 ? 'edit' : 'edits'} left`}
                            </Text>
                        </View>
                    )}
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        padding: 14,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        gap: 8,
    },
    topRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    chip: {
        paddingVertical: 3,
        paddingHorizontal: 9,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
    },
    chipText: {
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.6)',
    },
    title: {
        fontSize: 16.5,
        fontWeight: '500',
        color: '#fff',
        letterSpacing: -0.1,
        lineHeight: 22,
    },
    note: {
        fontSize: 13.5,
        color: 'rgba(255,255,255,0.5)',
        lineHeight: 19,
    },
    actionRow: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 2,
    },
    addBtn: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.92)',
        alignItems: 'center',
    },
    addBtnText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#0b0c10',
    },
    editBtn: {
        paddingVertical: 10,
        paddingHorizontal: 18,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
        alignItems: 'center',
    },
    editBtnText: {
        fontSize: 15,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.8)',
    },
    refineWrap: {
        marginTop: 4,
        gap: 5,
    },
    refineRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingLeft: 12,
        paddingRight: 6,
        paddingVertical: 4,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
    },
    refineInput: {
        flex: 1,
        color: '#fff',
        fontSize: 14.5,
        paddingVertical: 8,
    },
    refineSend: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    refineSendGlyph: {
        fontSize: 17,
        color: '#fff',
        fontWeight: '600',
        marginTop: -1,
    },
    refineHint: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
        paddingLeft: 4,
    },
    addedRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 2,
        paddingVertical: 8,
    },
    addedGlyph: {
        fontSize: 14,
        color: '#6fca7d',
        fontWeight: '700',
    },
    addedText: {
        fontSize: 14.5,
        color: 'rgba(255,255,255,0.7)',
        textTransform: 'capitalize',
    },
});

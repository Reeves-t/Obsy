import React, { useEffect, useMemo, useState } from 'react';
import {
    Modal,
    StyleSheet,
    View,
    Text,
    TextInput,
    Pressable,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { HabitGoalOrb } from './HabitGoalOrb';
import { useTopicStore } from '@/lib/topicStore';
import type { HabitGoalFrequency, HabitGoalType, NewHabitGoal } from '@/lib/habitGoalStore';

interface HabitGoalCreateModalProps {
    visible: boolean;
    defaultFrequency: HabitGoalFrequency;
    onClose: () => void;
    onSave: (input: NewHabitGoal) => void;
}

// ── Small inline segmented control ───────────────────────────
function Segmented<T extends string>({
    options,
    value,
    onChange,
}: {
    options: { value: T; label: string }[];
    value: T;
    onChange: (v: T) => void;
}) {
    return (
        <View style={styles.segment}>
            {options.map((opt) => {
                const active = opt.value === value;
                return (
                    <Pressable
                        key={opt.value}
                        style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                        onPress={() => onChange(opt.value)}
                    >
                        <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{opt.label}</Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

export function HabitGoalCreateModal({ visible, defaultFrequency, onClose, onSave }: HabitGoalCreateModalProps) {
    const topics = useTopicStore((s) => s.topics);

    const [type, setType] = useState<HabitGoalType>('habit');
    const [title, setTitle] = useState('');
    const [frequency, setFrequency] = useState<HabitGoalFrequency>(defaultFrequency);
    const [linkedTopicId, setLinkedTopicId] = useState<string | undefined>(undefined);
    const [note, setNote] = useState('');

    // Reset fields whenever the sheet opens.
    useEffect(() => {
        if (visible) {
            setType('habit');
            setTitle('');
            setFrequency(defaultFrequency);
            setLinkedTopicId(undefined);
            setNote('');
        }
    }, [visible, defaultFrequency]);

    const canSave = title.trim().length > 0;

    const handleSave = () => {
        if (!canSave) return;
        onSave({
            type,
            title: title.trim(),
            frequency,
            linkedTopicId,
            note: note.trim() || undefined,
        });
    };

    const previewTitle = useMemo(() => title.trim() || (type === 'habit' ? 'New habit' : 'New goal'), [title, type]);

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
            <Pressable style={styles.backdrop} onPress={onClose} />
            <KeyboardAvoidingView
                style={styles.sheetWrap}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                pointerEvents="box-none"
            >
                <View style={styles.sheet}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Pressable onPress={onClose} hitSlop={12}>
                            <Text style={styles.cancelBtn}>Cancel</Text>
                        </Pressable>
                        <Text style={styles.headerTitle}>New {type === 'habit' ? 'Habit' : 'Goal'}</Text>
                        <Pressable onPress={handleSave} hitSlop={12} disabled={!canSave}>
                            <Text style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}>Save</Text>
                        </Pressable>
                    </View>

                    <ScrollView
                        style={styles.body}
                        contentContainerStyle={styles.bodyContent}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        {/* Preview orb */}
                        <View style={styles.preview}>
                            <HabitGoalOrb size={84} title={previewTitle} type={type} />
                        </View>

                        {/* Type */}
                        <Text style={styles.fieldLabel}>TYPE</Text>
                        <Segmented
                            options={[
                                { value: 'habit', label: 'Habit' },
                                { value: 'goal', label: 'Goal' },
                            ]}
                            value={type}
                            onChange={setType}
                        />

                        {/* Title */}
                        <Text style={styles.fieldLabel}>TITLE</Text>
                        <View style={styles.fieldContainer}>
                            <TextInput
                                value={title}
                                onChangeText={setTitle}
                                placeholder={type === 'habit' ? 'e.g. Morning walk' : 'e.g. Read 4 books'}
                                placeholderTextColor="rgba(255,255,255,0.25)"
                                style={styles.titleInput}
                                returnKeyType="done"
                            />
                        </View>

                        {/* Frequency */}
                        <Text style={styles.fieldLabel}>FREQUENCY</Text>
                        <Segmented
                            options={[
                                { value: 'daily', label: 'Daily' },
                                { value: 'weekly', label: 'Weekly' },
                            ]}
                            value={frequency}
                            onChange={setFrequency}
                        />

                        {/* Linked topic (optional) */}
                        {topics.length > 0 && (
                            <>
                                <Text style={styles.fieldLabel}>LINKED TOPIC (OPTIONAL)</Text>
                                <ScrollView
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    contentContainerStyle={styles.chipRow}
                                >
                                    <Pressable
                                        style={[styles.chip, linkedTopicId === undefined && styles.chipActive]}
                                        onPress={() => setLinkedTopicId(undefined)}
                                    >
                                        <Text style={[styles.chipText, linkedTopicId === undefined && styles.chipTextActive]}>None</Text>
                                    </Pressable>
                                    {topics.map((t) => {
                                        const active = linkedTopicId === t.id;
                                        return (
                                            <Pressable
                                                key={t.id}
                                                style={[styles.chip, active && styles.chipActive]}
                                                onPress={() => setLinkedTopicId(active ? undefined : t.id)}
                                            >
                                                <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                                                    {t.title}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </ScrollView>
                            </>
                        )}

                        {/* Note (optional) */}
                        <Text style={styles.fieldLabel}>NOTE (OPTIONAL)</Text>
                        <View style={[styles.fieldContainer, styles.noteContainer]}>
                            <TextInput
                                value={note}
                                onChangeText={setNote}
                                placeholder="A small reminder of why this matters"
                                placeholderTextColor="rgba(255,255,255,0.25)"
                                style={styles.noteInput}
                                multiline
                                textAlignVertical="top"
                            />
                        </View>
                    </ScrollView>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    sheetWrap: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: '#0c0e14',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        maxHeight: '88%',
        paddingBottom: 28,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 18,
        paddingTop: 18,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.06)',
    },
    cancelBtn: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.7)',
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.9)',
    },
    saveBtn: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
    saveBtnDisabled: {
        color: 'rgba(255,255,255,0.25)',
    },
    body: {
        paddingHorizontal: 20,
    },
    bodyContent: {
        paddingTop: 16,
        paddingBottom: 8,
        gap: 10,
    },
    preview: {
        alignItems: 'center',
        paddingBottom: 6,
    },
    fieldLabel: {
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.4)',
        marginTop: 8,
        marginBottom: 2,
        paddingLeft: 2,
    },
    fieldContainer: {
        padding: 14,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        minHeight: 50,
        justifyContent: 'center',
    },
    titleInput: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '500',
        padding: 0,
    },
    noteContainer: {
        minHeight: 80,
        justifyContent: 'flex-start',
    },
    noteInput: {
        color: '#fff',
        fontSize: 15,
        lineHeight: 21,
        padding: 0,
        minHeight: 56,
    },
    // Segmented control
    segment: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        padding: 4,
        gap: 4,
    },
    segmentBtn: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 9,
        alignItems: 'center',
    },
    segmentBtnActive: {
        backgroundColor: 'rgba(255,255,255,0.12)',
    },
    segmentText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.5)',
    },
    segmentTextActive: {
        color: '#fff',
        fontWeight: '600',
    },
    // Chips
    chipRow: {
        gap: 8,
        paddingVertical: 2,
        paddingRight: 8,
    },
    chip: {
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        maxWidth: 160,
    },
    chipActive: {
        backgroundColor: 'rgba(255,255,255,0.16)',
        borderColor: 'rgba(255,255,255,0.28)',
    },
    chipText: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.6)',
    },
    chipTextActive: {
        color: '#fff',
        fontWeight: '600',
    },
});

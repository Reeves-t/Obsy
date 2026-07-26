import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { AuraPopup } from '@/components/ui/AuraPopup';
import { HabitGoalOrb } from './HabitGoalOrb';
import type { HabitGoalFrequency, HabitGoalType, NewHabitGoal } from '@/lib/habitGoalStore';

interface HabitGoalCreateModalProps {
    visible: boolean;
    defaultFrequency: HabitGoalFrequency;
    onClose: () => void;
    onSave: (input: NewHabitGoal) => void;
    // Optional prefill — used when opening from an AI suggestion.
    // When omitted, the modal opens blank as before.
    initialType?: HabitGoalType;
    initialTitle?: string;
    initialNote?: string;
}

// ── Small inline segmented control (styled for the dark aura card) ───
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

export function HabitGoalCreateModal({
    visible,
    defaultFrequency,
    onClose,
    onSave,
    initialType,
    initialTitle,
    initialNote,
}: HabitGoalCreateModalProps) {
    const [type, setType] = useState<HabitGoalType>('habit');
    const [title, setTitle] = useState('');
    const [frequency, setFrequency] = useState<HabitGoalFrequency>(defaultFrequency);
    const [note, setNote] = useState('');

    // Reset fields whenever the popup opens, seeding from any prefill props.
    useEffect(() => {
        if (visible) {
            setType(initialType ?? 'habit');
            setTitle(initialTitle ?? '');
            setFrequency(defaultFrequency);
            setNote(initialNote ?? '');
        }
    }, [visible, defaultFrequency, initialType, initialTitle, initialNote]);

    const canSave = title.trim().length > 0;

    const handleSave = () => {
        if (!canSave) return;
        onSave({
            type,
            title: title.trim(),
            frequency,
            note: note.trim() || undefined,
        });
    };

    const previewTitle = useMemo(() => title.trim() || (type === 'habit' ? 'New habit' : 'New goal'), [title, type]);

    return (
        <AuraPopup visible={visible} onClose={onClose} avoidKeyboard maxWidth={360}>
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
                    <HabitGoalOrb size={64} title={previewTitle} type={type} />
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
        </AuraPopup>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 18,
        paddingTop: 18,
        paddingBottom: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    cancelBtn: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.7)',
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
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
        maxHeight: 440,
    },
    bodyContent: {
        paddingTop: 14,
        paddingBottom: 18,
        gap: 8,
    },
    preview: {
        alignItems: 'center',
        paddingBottom: 4,
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
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
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
        minHeight: 68,
        justifyContent: 'flex-start',
    },
    noteInput: {
        color: '#fff',
        fontSize: 15,
        lineHeight: 21,
        padding: 0,
        minHeight: 48,
    },
    // Segmented control
    segment: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.06)',
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
        backgroundColor: 'rgba(255,255,255,0.16)',
    },
    segmentText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.5)',
    },
    segmentTextActive: {
        color: '#fff',
        fontWeight: '600',
    },
});

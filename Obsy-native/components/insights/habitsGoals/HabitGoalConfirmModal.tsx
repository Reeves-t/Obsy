import React, { useRef } from 'react';
import { StyleSheet, View, Text, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuraPopup } from '@/components/ui/AuraPopup';
import { HabitGoalOrb } from './HabitGoalOrb';
import type { HabitGoal } from '@/lib/habitGoalStore';

interface HabitGoalConfirmModalProps {
    item: HabitGoal | null;
    onClose: () => void;
    onConfirm: () => void; // toggles completion for the current period
    onRemove: () => void;
}

const COMPLETE_GREEN = '#5fd6a0';
const DELETE_RED = '#ff7a7a';

export function HabitGoalConfirmModal({ item, onClose, onConfirm, onRemove }: HabitGoalConfirmModalProps) {
    const visible = item !== null;

    // Keep the last item so content stays rendered through the exit animation.
    const lastItem = useRef<HabitGoal | null>(item);
    if (item) lastItem.current = item;
    const shown = item ?? lastItem.current;

    const completed = shown?.isCompletedForCurrentPeriod ?? false;
    const unit = shown?.frequency === 'weekly' ? 'week' : 'day';
    const kind = shown?.type === 'goal' ? 'goal' : 'habit';

    const confirmDelete = () => {
        Alert.alert(
            `Delete this ${kind}?`,
            shown ? `“${shown.title}” and its streak history will be removed.` : undefined,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: onRemove },
            ]
        );
    };

    return (
        <AuraPopup visible={visible} onClose={onClose}>
            {shown && (
                <View style={styles.content}>
                    <View style={styles.orbWrap}>
                        <HabitGoalOrb size={80} title={shown.title} type={shown.type} completed={completed} />
                    </View>

                    <Text style={styles.title}>{shown.title}</Text>
                    <Text style={styles.prompt}>{completed ? 'Undo completion?' : 'Mark complete?'}</Text>

                    {shown.currentStreak > 0 && (
                        <Text style={styles.meta}>
                            {shown.currentStreak}-{unit} streak
                            {shown.bestStreak > shown.currentStreak ? ` · best ${shown.bestStreak}` : ''}
                        </Text>
                    )}

                    <Pressable
                        style={[styles.primaryBtn, completed ? styles.undoBtn : styles.completeBtn]}
                        onPress={onConfirm}
                    >
                        <Text style={[styles.primaryText, completed && styles.undoText]}>
                            {completed ? 'Undo' : 'Complete'}
                        </Text>
                    </Pressable>

                    <View style={styles.actionRow}>
                        <Pressable style={styles.cancelBtn} onPress={onClose} hitSlop={8}>
                            <Text style={styles.cancelText}>Cancel</Text>
                        </Pressable>
                        <Pressable style={styles.deleteBtn} onPress={confirmDelete} hitSlop={8}>
                            <Ionicons name="trash-outline" size={15} color={DELETE_RED} />
                            <Text style={styles.deleteText}>Delete</Text>
                        </Pressable>
                    </View>
                </View>
            )}
        </AuraPopup>
    );
}

const styles = StyleSheet.create({
    content: {
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingTop: 26,
        paddingBottom: 18,
    },
    orbWrap: {
        marginBottom: 16,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
        textAlign: 'center',
    },
    prompt: {
        fontSize: 15,
        color: 'rgba(255,255,255,0.6)',
        marginTop: 6,
        textAlign: 'center',
    },
    meta: {
        fontSize: 12,
        color: COMPLETE_GREEN,
        marginTop: 8,
        fontWeight: '600',
    },
    primaryBtn: {
        marginTop: 22,
        width: '100%',
        paddingVertical: 15,
        borderRadius: 999,
        alignItems: 'center',
    },
    completeBtn: {
        backgroundColor: COMPLETE_GREEN,
    },
    undoBtn: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    primaryText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#06281c',
    },
    undoText: {
        color: '#fff',
    },
    actionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        marginTop: 14,
        paddingHorizontal: 4,
    },
    cancelBtn: {
        paddingVertical: 6,
        paddingHorizontal: 6,
    },
    cancelText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
        fontWeight: '500',
    },
    deleteBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingVertical: 6,
        paddingHorizontal: 6,
    },
    deleteText: {
        fontSize: 14,
        color: DELETE_RED,
        fontWeight: '500',
    },
});

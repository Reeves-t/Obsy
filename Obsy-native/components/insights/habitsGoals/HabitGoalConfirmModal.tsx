import React from 'react';
import { Modal, StyleSheet, View, Text, Pressable } from 'react-native';
import { HabitGoalOrb } from './HabitGoalOrb';
import type { HabitGoal } from '@/lib/habitGoalStore';

interface HabitGoalConfirmModalProps {
    item: HabitGoal | null;
    onClose: () => void;
    onConfirm: () => void; // toggles completion for the current period
    onRemove: () => void;
}

const COMPLETE_GREEN = '#5fd6a0';

export function HabitGoalConfirmModal({ item, onClose, onConfirm, onRemove }: HabitGoalConfirmModalProps) {
    const visible = item !== null;
    const completed = item?.isCompletedForCurrentPeriod ?? false;
    const unit = item?.frequency === 'weekly' ? 'week' : 'day';

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
            <Pressable style={styles.backdrop} onPress={onClose}>
                {/* Inner pressable stops backdrop taps from closing when tapping the card */}
                <Pressable style={styles.card} onPress={() => {}}>
                    {item && (
                        <>
                            <View style={styles.orbWrap}>
                                <HabitGoalOrb size={88} title={item.title} type={item.type} completed={completed} />
                            </View>

                            <Text style={styles.title}>{item.title}</Text>

                            <Text style={styles.prompt}>{completed ? 'Undo completion?' : 'Mark complete?'}</Text>

                            {item.currentStreak > 0 && (
                                <Text style={styles.meta}>
                                    {item.currentStreak}-{unit} streak{item.bestStreak > item.currentStreak ? ` · best ${item.bestStreak}` : ''}
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

                            <Pressable style={styles.cancelBtn} onPress={onClose}>
                                <Text style={styles.cancelText}>Cancel</Text>
                            </Pressable>

                            <Pressable style={styles.removeBtn} onPress={onRemove} hitSlop={8}>
                                <Text style={styles.removeText}>Remove</Text>
                            </Pressable>
                        </>
                    )}
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
    },
    card: {
        width: '100%',
        maxWidth: 320,
        backgroundColor: '#0c0e14',
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        paddingHorizontal: 22,
        paddingTop: 24,
        paddingBottom: 16,
        alignItems: 'center',
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
    },
    primaryBtn: {
        marginTop: 20,
        width: '100%',
        paddingVertical: 14,
        borderRadius: 999,
        alignItems: 'center',
    },
    completeBtn: {
        backgroundColor: COMPLETE_GREEN,
    },
    undoBtn: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
    },
    primaryText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#06281c',
    },
    undoText: {
        color: '#fff',
    },
    cancelBtn: {
        marginTop: 6,
        width: '100%',
        paddingVertical: 12,
        alignItems: 'center',
    },
    cancelText: {
        fontSize: 15,
        color: 'rgba(255,255,255,0.6)',
    },
    removeBtn: {
        marginTop: 4,
        paddingVertical: 6,
    },
    removeText: {
        fontSize: 12,
        color: 'rgba(255,120,120,0.7)',
    },
});

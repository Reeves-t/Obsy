import React from 'react';
import { View, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { BlurView } from 'expo-blur';
import { ThemedText } from '@/components/ui/ThemedText';
import Colors from '@/constants/Colors';

interface DeleteConfirmModalProps {
    visible: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title?: string;
}

export function DeleteConfirmModal({ visible, onClose, onConfirm, title = "Delete Insight?" }: DeleteConfirmModalProps) {
    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
                <TouchableOpacity
                    style={StyleSheet.absoluteFill}
                    activeOpacity={1}
                    onPress={onClose}
                />

                <View style={styles.modalContent}>
                    <ThemedText type="defaultSemiBold" style={styles.title}>{title}</ThemedText>
                    <ThemedText style={styles.subtitle}>
                        This will be moved to the recycle bin and permanently deleted after 30 days.
                    </ThemedText>

                    <View style={styles.buttonRow}>
                        <TouchableOpacity
                            style={[styles.button, styles.cancelButton]}
                            onPress={onClose}
                        >
                            <ThemedText style={styles.cancelText}>Cancel</ThemedText>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.button, styles.deleteButton]}
                            onPress={onConfirm}
                        >
                            <ThemedText style={styles.deleteText}>Delete</ThemedText>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    modalContent: {
        width: '100%',
        backgroundColor: '#1C1C1E',
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    title: {
        fontSize: 18,
        color: '#FFFFFF',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 20,
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
    },
    button: {
        flex: 1,
        height: 48,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cancelButton: {
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    deleteButton: {
        backgroundColor: '#FF3B30', // System red
    },
    cancelText: {
        color: '#FFFFFF',
        fontWeight: '600',
    },
    deleteText: {
        color: '#FFFFFF',
        fontWeight: '700',
    },
});

import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Modal, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import { ThemedText } from '@/components/ui/ThemedText';
import Colors from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';

interface CreateCustomMoodModalProps {
    visible: boolean;
    onClose: () => void;
    onSave: (name: string) => Promise<void>;
    isLoading?: boolean;
    error?: string | null;
}

export function CreateCustomMoodModal({ visible, onClose, onSave, isLoading = false, error = null }: CreateCustomMoodModalProps) {
    const [name, setName] = useState('');
    const [localError, setLocalError] = useState<string | null>(null);

    // Sync external error to local state
    useEffect(() => {
        setLocalError(error);
    }, [error]);

    // Clear error when user starts typing
    const handleTextChange = (text: string) => {
        setName(text);
        if (localError) {
            setLocalError(null);
        }
    };

    const handleSave = async () => {
        if (!name.trim() || isLoading) return;
        try {
            await onSave(name.trim());
            setName('');
            // onClose is called by parent on success
        } catch (err) {
            // Error is handled by parent, but we can also show it locally
            if (err instanceof Error) {
                setLocalError(err.message);
            }
        }
    };

    const handleClose = () => {
        setName('');
        setLocalError(null);
        onClose();
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={handleClose}
        >
            <BlurView intensity={95} tint="dark" style={styles.modalContainer}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.keyboardAvoid}
                >
                    <View style={styles.modalContent}>
                        <View style={styles.header}>
                            <View style={styles.handle} />
                            <View style={styles.headerRow}>
                                <ThemedText style={styles.headerTitle}>New Mood</ThemedText>
                                <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                                    <Ionicons name="close" size={24} color="rgba(255,255,255,0.6)" />
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View style={styles.scrollContent}>
                            <View style={styles.inputSection}>
                                <ThemedText type="caption" style={styles.label}>MOOD NAME</ThemedText>
                                <TextInput
                                    style={[styles.input, localError && styles.inputError]}
                                    placeholder="e.g. Content, Determined..."
                                    placeholderTextColor="rgba(255,255,255,0.3)"
                                    value={name}
                                    onChangeText={handleTextChange}
                                    autoFocus
                                    editable={!isLoading}
                                />
                                {localError ? (
                                    <ThemedText style={styles.errorText}>{localError}</ThemedText>
                                ) : (
                                    <ThemedText style={styles.helperText}>
                                        Colors are assigned automatically based on the mood name.
                                    </ThemedText>
                                )}
                            </View>

                            <TouchableOpacity
                                style={[styles.saveButton, (!name.trim() || isLoading) && styles.saveButtonDisabled]}
                                onPress={handleSave}
                                disabled={!name.trim() || isLoading}
                            >
                                {isLoading ? (
                                    <ActivityIndicator color="black" size="small" />
                                ) : (
                                    <ThemedText style={styles.saveButtonText}>Create Mood</ThemedText>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </BlurView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalContainer: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    keyboardAvoid: {
        width: '100%',
    },
    modalContent: {
        backgroundColor: '#0A0A0A',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    },
    header: {
        alignItems: 'center',
        paddingTop: 12,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.08)',
    },
    handle: {
        width: 40,
        height: 4,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 2,
        marginBottom: 16,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        paddingHorizontal: 20,
        marginBottom: 16,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: 'white',
    },
    closeButton: {
        position: 'absolute',
        right: 20,
        padding: 4,
    },
    scrollContent: {
        padding: 24,
        gap: 24,
    },
    inputSection: {
        gap: 12,
    },
    label: {
        fontSize: 12,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 1,
        textTransform: 'uppercase',
        marginLeft: 4,
    },
    input: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        padding: 16,
        color: 'white',
        fontSize: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    helperText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
        marginLeft: 4,
        lineHeight: 18,
    },
    inputError: {
        borderColor: '#FF6B6B',
    },
    errorText: {
        fontSize: 12,
        color: '#FF6B6B',
        marginLeft: 4,
        lineHeight: 18,
    },
    saveButton: {
        backgroundColor: Colors.obsy.silver,
        height: 52,
        borderRadius: 26,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 8,
    },
    saveButtonDisabled: {
        opacity: 0.5,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    saveButtonText: {
        color: 'black',
        fontSize: 16,
        fontWeight: '600',
    },
});

import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Modal, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { ThemedText } from '@/components/ui/ThemedText';
import { GlassCard } from '@/components/ui/GlassCard';
import Colors from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { validateCustomTone, CUSTOM_TONE_RULES, CustomTone } from '@/lib/customTone';

interface CustomToneModalProps {
    visible: boolean;
    onClose: () => void;
    onSave: (name: string, prompt: string) => Promise<void>;
    onDelete?: () => Promise<void>;
    initialTone?: CustomTone | null;
}

export function CustomToneModal({ visible, onClose, onSave, onDelete, initialTone }: CustomToneModalProps) {
    const [name, setName] = useState('');
    const [prompt, setPrompt] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (visible) {
            setName(initialTone?.name || '');
            setPrompt(initialTone?.prompt || '');
            setError(null);
        }
    }, [visible, initialTone]);

    const handleSave = async () => {
        const validation = validateCustomTone(name, prompt);
        if (!validation.valid) {
            setError(validation.error || 'Invalid input');
            return;
        }

        setIsSaving(true);
        try {
            await onSave(name.trim(), prompt.trim());
            onClose();
        } catch (e: any) {
            setError(e.message || 'Failed to save tone');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.overlay}
            >
                <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />

                <GlassCard style={styles.container}>
                    <View style={styles.header}>
                        <ThemedText type="subtitle">{initialTone ? 'Edit Custom Tone' : 'Create Custom Tone'}</ThemedText>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <Ionicons name="close" size={24} color={Colors.obsy.silver} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.content} bounces={false}>

                        <View style={styles.inputSection}>
                            <View style={styles.labelRow}>
                                <ThemedText type="defaultSemiBold" style={styles.label}>Name</ThemedText>
                                <ThemedText style={styles.counter}>{name.length}/{CUSTOM_TONE_RULES.MAX_NAME_LENGTH}</ThemedText>
                            </View>
                            <TextInput
                                style={styles.input}
                                value={name}
                                onChangeText={setName}
                                placeholder="e.g. Noir Detective"
                                placeholderTextColor="rgba(255,255,255,0.3)"
                                maxLength={CUSTOM_TONE_RULES.MAX_NAME_LENGTH}
                            />
                        </View>

                        <View style={styles.inputSection}>
                            <View style={styles.labelRow}>
                                <ThemedText type="defaultSemiBold" style={styles.label}>Description (Tone)</ThemedText>
                                <ThemedText style={styles.counter}>{prompt.length}/{CUSTOM_TONE_RULES.MAX_PROMPT_LENGTH}</ThemedText>
                            </View>
                            <TextInput
                                style={[styles.input, styles.textArea]}
                                value={prompt}
                                onChangeText={setPrompt}
                                placeholder="Describe the voice. Avoid 'act as'. Focus on style."
                                placeholderTextColor="rgba(255,255,255,0.3)"
                                multiline
                                numberOfLines={4}
                                maxLength={CUSTOM_TONE_RULES.MAX_PROMPT_LENGTH}
                            />
                            <ThemedText style={styles.helperText}>
                                This can be inspired by your favorite media, mood, or style. We'll extract the vibe.
                            </ThemedText>
                        </View>

                        {error && (
                            <View style={styles.errorContainer}>
                                <Ionicons name="alert-circle" size={16} color="#F87171" />
                                <ThemedText style={styles.errorText}>{error}</ThemedText>
                            </View>
                        )}

                        <View style={styles.footer}>
                            {initialTone && onDelete && (
                                <TouchableOpacity
                                    style={styles.deleteButton}
                                    onPress={onDelete}
                                    disabled={isSaving}
                                >
                                    <Ionicons name="trash-outline" size={20} color="#F87171" />
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity
                                style={[styles.cancelButton, initialTone ? { flex: 1 } : { flex: 0.4 }]}
                                onPress={onClose}
                                disabled={isSaving}
                            >
                                <ThemedText>Cancel</ThemedText>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.saveButton, { flex: 1 }]}
                                onPress={handleSave}
                                disabled={isSaving}
                            >
                                <ThemedText type="defaultSemiBold" style={styles.saveButtonText}>
                                    {isSaving ? 'Saving...' : 'Save Tone'}
                                </ThemedText>
                            </TouchableOpacity>
                        </View>
                    </ScrollView>
                </GlassCard>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        padding: 20,
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    container: {
        width: '100%',
        backgroundColor: '#0A0A0A',
        borderRadius: 24,
        padding: 4,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.6,
        shadowRadius: 24,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        paddingBottom: 16,
    },
    closeButton: {
        padding: 4,
    },
    content: {
        padding: 20,
        paddingTop: 0,
    },
    inputSection: {
        marginBottom: 20,
    },
    labelRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    label: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 14,
    },
    counter: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
    },
    input: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        padding: 16,
        color: '#fff',
        fontSize: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    textArea: {
        height: 120,
        textAlignVertical: 'top',
    },
    helperText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
        marginTop: 8,
        lineHeight: 18,
    },
    errorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 20,
        padding: 12,
        backgroundColor: 'rgba(248, 113, 113, 0.1)',
        borderRadius: 12,
    },
    errorText: {
        color: '#F87171',
        fontSize: 14,
        flex: 1,
    },
    footer: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 8,
        marginBottom: 10,
    },
    saveButton: {
        backgroundColor: '#fff',
        paddingVertical: 14,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    saveButtonText: {
        color: '#000',
    },
    cancelButton: {
        paddingVertical: 14,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    deleteButton: {
        width: 52,
        height: 52,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(248, 113, 113, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(248, 113, 113, 0.2)',
    }
});

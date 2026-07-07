import React, { useState, useRef, useEffect } from 'react';
import {
    StyleSheet,
    View,
    Text,
    TextInput,
    Pressable,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { TopicOrb } from './TopicOrb';

interface CreateTopicModalProps {
    onCancel: () => void;
    onSave: (title: string, description: string) => void;
}

export function CreateTopicModal({ onCancel, onSave }: CreateTopicModalProps) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [activeField, setActiveField] = useState<'title' | 'desc'>('title');
    const titleRef = useRef<TextInput>(null);

    const canSave = title.trim().length > 0;

    useEffect(() => {
        // Autofocus title on mount
        setTimeout(() => titleRef.current?.focus(), 100);
    }, []);

    const handleSave = () => {
        if (!canSave) return;
        onSave(title.trim(), description.trim());
    };

    return (
        <View style={styles.overlay}>
            {/* Ambient bg */}
            <View style={styles.ambientBg} pointerEvents="none" />

            <KeyboardAvoidingView
                style={styles.keyboardAvoid}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                {/* Top bar */}
                <View style={styles.topBar}>
                    <Pressable onPress={onCancel} hitSlop={12}>
                        <Text style={styles.cancelBtn}>Cancel</Text>
                    </Pressable>
                    <Text style={styles.topTitle}>New Topic</Text>
                    <Pressable onPress={handleSave} hitSlop={12} disabled={!canSave}>
                        <Text style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}>
                            Save
                        </Text>
                    </Pressable>
                </View>

                {/* Body */}
                <View style={styles.body}>
                    {/* Preview orb */}
                    <View style={styles.orbPreview}>
                        <TopicOrb size={96} title={title || 'Your topic'} />
                    </View>

                    {/* Title field */}
                    <View>
                        <Text style={styles.fieldLabel}>TITLE</Text>
                        <Pressable
                            style={[
                                styles.fieldContainer,
                                activeField === 'title' && styles.fieldContainerFocused,
                            ]}
                            onPress={() => titleRef.current?.focus()}
                        >
                            <TextInput
                                ref={titleRef}
                                value={title}
                                onChangeText={setTitle}
                                onFocus={() => setActiveField('title')}
                                placeholder="e.g. Morning run"
                                placeholderTextColor="rgba(255,255,255,0.25)"
                                style={styles.titleInput}
                                returnKeyType="next"
                            />
                        </Pressable>
                        <Text style={styles.helperText}>
                            Keep it brief {'\u2014'} it floats inside the orb.
                        </Text>
                    </View>

                    {/* Description field */}
                    <View>
                        <Text style={styles.fieldLabel}>DESCRIPTION</Text>
                        <Pressable
                            style={[
                                styles.fieldContainer,
                                styles.descContainer,
                                activeField === 'desc' && styles.fieldContainerFocused,
                            ]}
                        >
                            <TextInput
                                value={description}
                                onChangeText={setDescription}
                                onFocus={() => setActiveField('desc')}
                                placeholder="What does this topic mean to you?"
                                placeholderTextColor="rgba(255,255,255,0.25)"
                                style={styles.descInput}
                                multiline
                                textAlignVertical="top"
                            />
                        </Pressable>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#050608',
        zIndex: 100,
    },
    ambientBg: {
        ...StyleSheet.absoluteFillObject,
        // Matches the ambient gradient from the design
        opacity: 0.8,
    },
    keyboardAvoid: {
        flex: 1,
    },
    // Top bar
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 58,
        paddingHorizontal: 18,
        paddingBottom: 12,
    },
    cancelBtn: {
        fontSize: 16,
        fontWeight: '400',
        color: 'rgba(255,255,255,0.7)',
    },
    topTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.85)',
    },
    saveBtn: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
    saveBtnDisabled: {
        color: 'rgba(255,255,255,0.25)',
    },
    // Body
    body: {
        flex: 1,
        paddingHorizontal: 22,
        paddingTop: 20,
        gap: 26,
    },
    orbPreview: {
        alignItems: 'center',
        paddingTop: 8,
        paddingBottom: 4,
    },
    // Fields
    fieldLabel: {
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.4)',
        marginBottom: 8,
        paddingLeft: 4,
    },
    fieldContainer: {
        padding: 14,
        paddingHorizontal: 16,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        minHeight: 50,
        justifyContent: 'center',
    },
    fieldContainerFocused: {
        borderColor: 'rgba(255,255,255,0.18)',
    },
    descContainer: {
        minHeight: 96,
        justifyContent: 'flex-start',
    },
    titleInput: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '500',
        letterSpacing: -0.2,
        padding: 0,
    },
    descInput: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '400',
        letterSpacing: -0.1,
        lineHeight: 23,
        padding: 0,
        minHeight: 72,
    },
    helperText: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.35)',
        marginTop: 6,
        paddingLeft: 4,
    },
});

import React, { useEffect, useRef, useState } from 'react';
import {
    Modal,
    StyleSheet,
    View,
    Text,
    TextInput,
    Pressable,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
} from 'react-native';
import { AmbientBackground } from '@/components/ui/AmbientBackground';

const SERIF_FONT = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

interface RespondModalProps {
    visible: boolean;
    sectionLabel: string;
    insightText: string;
    onClose: () => void;
    onSave: (text: string) => void;
}

/**
 * A low-friction, Journal-styled modal for responding to an AI section on the
 * Discover / Evolve pages. Matches the Obsy dark/premium aesthetic — no mood
 * selection, just the insight being responded to and a free-text reply.
 */
export function RespondModal({ visible, sectionLabel, insightText, onClose, onSave }: RespondModalProps) {
    const [text, setText] = useState('');
    const inputRef = useRef<TextInput>(null);

    useEffect(() => {
        if (visible) {
            setText('');
            const t = setTimeout(() => inputRef.current?.focus(), 250);
            return () => clearTimeout(t);
        }
    }, [visible]);

    const canSave = text.trim().length > 0;

    const handleSave = () => {
        if (!canSave) return;
        onSave(text.trim());
    };

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
            <View style={styles.root}>
                <AmbientBackground />

                <KeyboardAvoidingView
                    style={styles.flex}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                    {/* Top bar */}
                    <View style={styles.topBar}>
                        <Pressable onPress={onClose} hitSlop={12}>
                            <Text style={styles.cancelBtn}>Cancel</Text>
                        </Pressable>
                        <Text style={styles.topTitle}>Respond</Text>
                        <Pressable onPress={handleSave} hitSlop={12} disabled={!canSave}>
                            <Text style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}>Save</Text>
                        </Pressable>
                    </View>

                    <ScrollView
                        style={styles.flex}
                        contentContainerStyle={styles.body}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        {/* The AI section being responded to */}
                        <View style={styles.insightCard}>
                            <Text style={styles.insightLabel}>{sectionLabel}</Text>
                            <Text style={styles.insightText}>{insightText}</Text>
                        </View>

                        {/* Response input */}
                        <TextInput
                            ref={inputRef}
                            value={text}
                            onChangeText={setText}
                            placeholder="Add your thoughts…"
                            placeholderTextColor="rgba(255,230,190,0.32)"
                            style={styles.input}
                            multiline
                            textAlignVertical="top"
                            underlineColorAndroid="transparent"
                        />
                    </ScrollView>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: '#050608',
    },
    flex: {
        flex: 1,
    },
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
    body: {
        paddingHorizontal: 22,
        paddingTop: 14,
        paddingBottom: 40,
        gap: 18,
    },
    insightCard: {
        padding: 16,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        gap: 8,
    },
    insightLabel: {
        fontSize: 10,
        fontWeight: '600',
        letterSpacing: 1.0,
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.4)',
    },
    insightText: {
        fontSize: 15,
        color: 'rgba(255,255,255,0.85)',
        lineHeight: 22,
    },
    input: {
        minHeight: 200,
        color: 'rgba(255, 248, 235, 0.96)',
        fontFamily: SERIF_FONT,
        fontSize: 17,
        lineHeight: 28,
        letterSpacing: 0.1,
        paddingHorizontal: 2,
    },
});

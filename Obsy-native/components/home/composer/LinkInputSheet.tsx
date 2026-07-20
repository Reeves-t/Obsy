import React, { useEffect, useMemo, useState } from 'react';
import {
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { ThemedText } from '@/components/ui/ThemedText';
import { useObsyTheme } from '@/contexts/ThemeContext';
import {
    SharedLinkMetadata,
    extractUrlFromSharePayload,
    isValidShareUrl,
    parseSharedLinkMetadata,
    platformToColor,
    platformToIcon,
} from '@/services/sharedLinkService';

interface LinkInputSheetProps {
    visible: boolean;
    onClose: () => void;
    onConfirm: (meta: SharedLinkMetadata) => void;
}

/**
 * Lightweight URL intake for the home composer's link attachment. Harvests
 * SharedLinkMetadata only — saving stays in the composer.
 */
export function LinkInputSheet({ visible, onClose, onConfirm }: LinkInputSheetProps) {
    const { colors, isLight } = useObsyTheme();
    const [url, setUrl] = useState('');

    useEffect(() => {
        if (!visible) setUrl('');
    }, [visible]);

    const meta = useMemo(
        () => (isValidShareUrl(url) ? parseSharedLinkMetadata(url) : null),
        [url]
    );

    const handlePaste = async () => {
        const text = await Clipboard.getStringAsync();
        const extracted = extractUrlFromSharePayload(text);
        if (extracted) setUrl(extracted);
    };

    const cardBg = isLight ? colors.cardBackground : 'rgba(18, 22, 32, 0.98)';
    const border = isLight ? colors.cardBorder : 'rgba(255,255,255,0.12)';
    const inputBg = isLight ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.06)';

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable style={styles.backdrop} onPress={onClose}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={styles.avoidingView}
                    pointerEvents="box-none"
                >
                    <Pressable style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}>
                        <View style={styles.headerRow}>
                            <ThemedText style={[styles.title, { color: colors.text }]}>
                                Attach a link
                            </ThemedText>
                            <TouchableOpacity
                                onPress={onClose}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                                <Ionicons name="close" size={20} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <View style={[styles.inputRow, { backgroundColor: inputBg, borderColor: border }]}>
                            <Ionicons name="link-outline" size={16} color={colors.textTertiary} />
                            <TextInput
                                value={url}
                                onChangeText={setUrl}
                                placeholder="https://…"
                                placeholderTextColor={colors.textTertiary}
                                style={[styles.input, { color: colors.text }]}
                                autoCapitalize="none"
                                autoCorrect={false}
                                keyboardType="url"
                                autoFocus
                            />
                            <TouchableOpacity onPress={handlePaste} style={[styles.pasteButton, { borderColor: border }]}>
                                <ThemedText style={[styles.pasteText, { color: colors.textSecondary }]}>
                                    Paste
                                </ThemedText>
                            </TouchableOpacity>
                        </View>

                        {meta && (
                            <View style={[styles.previewRow, { borderColor: border }]}>
                                <Ionicons
                                    name={platformToIcon(meta.platform) as never}
                                    size={18}
                                    color={platformToColor(meta.platform)}
                                />
                                <View style={styles.previewText}>
                                    <ThemedText
                                        style={[styles.previewTitle, { color: colors.text }]}
                                        numberOfLines={1}
                                    >
                                        {meta.title ?? meta.domain}
                                    </ThemedText>
                                    <ThemedText style={[styles.previewDomain, { color: colors.textTertiary }]}>
                                        {meta.platform} · {meta.domain}
                                    </ThemedText>
                                </View>
                            </View>
                        )}

                        <TouchableOpacity
                            activeOpacity={0.85}
                            disabled={!meta}
                            onPress={() => meta && onConfirm(meta)}
                            style={[styles.confirmButton, !meta && styles.confirmDisabled]}
                        >
                            <ThemedText style={styles.confirmText}>Attach link</ThemedText>
                        </TouchableOpacity>
                    </Pressable>
                </KeyboardAvoidingView>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
    },
    avoidingView: {
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    card: {
        borderRadius: 18,
        borderWidth: 1,
        padding: 18,
        gap: 14,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    title: {
        fontSize: 16,
        fontWeight: '600',
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 4,
    },
    input: {
        flex: 1,
        fontSize: 14,
        paddingVertical: 10,
    },
    pasteButton: {
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    pasteText: {
        fontSize: 12,
        fontWeight: '600',
    },
    previewRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    previewText: {
        flex: 1,
    },
    previewTitle: {
        fontSize: 13.5,
        fontWeight: '600',
    },
    previewDomain: {
        fontSize: 11.5,
        marginTop: 2,
    },
    confirmButton: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        paddingVertical: 13,
        alignItems: 'center',
    },
    confirmDisabled: {
        opacity: 0.35,
    },
    confirmText: {
        color: '#0A0A0A',
        fontSize: 14.5,
        fontWeight: '600',
    },
});

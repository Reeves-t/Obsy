import React, { useState, useCallback, useRef } from 'react';
import {
    View,
    Modal,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    ScrollView,
    Clipboard,
    Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/ui/ThemedText';
import { useObsyTheme } from '@/contexts/ThemeContext';
import {
    parseSharedLinkMetadata,
    isValidShareUrl,
    extractUrlFromSharePayload,
    platformToIcon,
    platformToColor,
} from '@/services/sharedLinkService';
import type { SharedLinkMetadata } from '@/services/sharedLinkService';
import type { SharedLinkPlatform } from '@/services/sharedLinkService';
import { SaveSharedLinkModal } from '@/components/entries/SaveSharedLinkModal';

interface DevPortalModalProps {
    visible: boolean;
    onClose: () => void;
}

const DEV_QUICK_URLS = [
    { label: 'TikTok', url: 'https://www.tiktok.com/@user/video/7123456789012345678' },
    { label: 'Reddit', url: 'https://www.reddit.com/r/productivity/comments/abc123/how_i_built_a_second_brain' },
    { label: 'YouTube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    { label: 'Spotify', url: 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT' },
    { label: 'Instagram', url: 'https://www.instagram.com/p/ABC123defGHI/' },
    { label: 'Article', url: 'https://medium.com/productivity/how-to-build-better-habits-every-day' },
];

export function DevPortalModal({ visible, onClose }: DevPortalModalProps) {
    const { colors, isLight } = useObsyTheme();
    const [urlInput, setUrlInput] = useState('');
    const [preview, setPreview] = useState<SharedLinkMetadata | null>(null);
    const [parseError, setParseError] = useState<string | null>(null);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const inputRef = useRef<TextInput>(null);

    const inputBg = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)';
    const inputBorder = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
    const sectionBg = isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)';
    const menuBg = isLight ? '#F0F0F0' : '#111315';

    const handleParse = useCallback((rawInput?: string) => {
        const input = (rawInput ?? urlInput).trim();
        if (!input) {
            setParseError('Paste a URL to test.');
            setPreview(null);
            return;
        }

        // Try to extract URL if user pasted a full share payload with surrounding text
        const extracted = isValidShareUrl(input) ? input : (extractUrlFromSharePayload(input) ?? input);

        if (!isValidShareUrl(extracted)) {
            setParseError('Not a valid http/https URL.');
            setPreview(null);
            return;
        }

        setParseError(null);
        const meta = parseSharedLinkMetadata(extracted);
        setUrlInput(extracted);
        setPreview(meta);
    }, [urlInput]);

    const handlePaste = useCallback(async () => {
        try {
            const text = await Clipboard.getString();
            if (text) {
                setUrlInput(text);
                handleParse(text);
            }
        } catch {
            // Clipboard not available — user can type manually
        }
    }, [handleParse]);

    const handleQuickUrl = useCallback((url: string) => {
        setUrlInput(url);
        handleParse(url);
    }, [handleParse]);

    const handleOpenSave = useCallback(() => {
        if (!preview) return;
        setShowSaveModal(true);
    }, [preview]);

    const handleSaved = useCallback(() => {
        setShowSaveModal(false);
        setUrlInput('');
        setPreview(null);
        onClose();
    }, [onClose]);

    const handleClose = useCallback(() => {
        setUrlInput('');
        setPreview(null);
        setParseError(null);
        onClose();
    }, [onClose]);

    const platform = preview?.platform as SharedLinkPlatform | undefined;
    const platformIcon = platform ? platformToIcon(platform) : 'globe-outline';
    const platformColor = platform ? platformToColor(platform) : colors.textTertiary;

    return (
        <>
            <Modal
                visible={visible && !showSaveModal}
                animationType="slide"
                transparent
                onRequestClose={handleClose}
            >
                <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
                <View style={styles.overlay}>
                    <View style={[styles.sheet, { backgroundColor: menuBg }]}>
                        {/* Handle */}
                        <View style={styles.handle} />

                        {/* Header */}
                        <View style={styles.header}>
                            <View style={styles.headerLeft}>
                                <View style={styles.devBadge}>
                                    <ThemedText style={styles.devBadgeText}>DEV</ThemedText>
                                </View>
                                <ThemedText style={[styles.title, { color: colors.text }]}>
                                    Shared Link Tester
                                </ThemedText>
                            </View>
                            <TouchableOpacity onPress={handleClose} style={styles.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                                <Ionicons name="close" size={20} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView
                            style={styles.scroll}
                            contentContainerStyle={styles.scrollContent}
                            keyboardShouldPersistTaps="handled"
                            showsVerticalScrollIndicator={false}
                        >
                            {/* URL input */}
                            <View style={styles.section}>
                                <ThemedText style={[styles.sectionLabel, { color: colors.textTertiary }]}>
                                    PASTE URL
                                </ThemedText>
                                <View style={[styles.inputRow, { backgroundColor: inputBg, borderColor: inputBorder }]}>
                                    <TextInput
                                        ref={inputRef}
                                        value={urlInput}
                                        onChangeText={setUrlInput}
                                        placeholder="https://..."
                                        placeholderTextColor={colors.textTertiary}
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        keyboardType="url"
                                        style={[styles.urlInput, { color: colors.text }]}
                                        onSubmitEditing={() => handleParse()}
                                        returnKeyType="done"
                                    />
                                    <TouchableOpacity onPress={handlePaste} style={styles.pasteBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                        <Ionicons name="clipboard-outline" size={18} color={colors.textSecondary} />
                                    </TouchableOpacity>
                                </View>

                                <TouchableOpacity
                                    onPress={() => handleParse()}
                                    style={[styles.parseButton, { backgroundColor: 'rgba(255,255,255,0.1)', borderColor: inputBorder }]}
                                    activeOpacity={0.7}
                                >
                                    <Ionicons name="flash-outline" size={14} color={colors.text} />
                                    <ThemedText style={[styles.parseButtonText, { color: colors.text }]}>
                                        Parse
                                    </ThemedText>
                                </TouchableOpacity>

                                {parseError && (
                                    <ThemedText style={[styles.errorText, { color: '#FF6B6B' }]}>
                                        {parseError}
                                    </ThemedText>
                                )}
                            </View>

                            {/* Quick test URLs */}
                            <View style={styles.section}>
                                <ThemedText style={[styles.sectionLabel, { color: colors.textTertiary }]}>
                                    QUICK TEST URLS
                                </ThemedText>
                                <View style={styles.quickGrid}>
                                    {DEV_QUICK_URLS.map(item => (
                                        <TouchableOpacity
                                            key={item.label}
                                            onPress={() => handleQuickUrl(item.url)}
                                            style={[styles.quickChip, { backgroundColor: inputBg, borderColor: inputBorder }]}
                                            activeOpacity={0.7}
                                        >
                                            <ThemedText style={[styles.quickChipText, { color: colors.textSecondary }]}>
                                                {item.label}
                                            </ThemedText>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>

                            {/* Parse result preview */}
                            {preview && (
                                <View style={styles.section}>
                                    <ThemedText style={[styles.sectionLabel, { color: colors.textTertiary }]}>
                                        PARSE RESULT
                                    </ThemedText>
                                    <View style={[styles.previewCard, { backgroundColor: sectionBg, borderColor: inputBorder }]}>
                                        <View style={styles.previewRow}>
                                            <ThemedText style={[styles.previewKey, { color: colors.textTertiary }]}>Platform</ThemedText>
                                            <View style={styles.previewValueRow}>
                                                <Ionicons name={platformIcon as any} size={13} color={platformColor} />
                                                <ThemedText style={[styles.previewValue, { color: platformColor }]}>
                                                    {preview.platform}
                                                </ThemedText>
                                            </View>
                                        </View>
                                        <View style={[styles.divider, { backgroundColor: inputBorder }]} />
                                        <View style={styles.previewRow}>
                                            <ThemedText style={[styles.previewKey, { color: colors.textTertiary }]}>Domain</ThemedText>
                                            <ThemedText style={[styles.previewValue, { color: colors.textSecondary }]}>
                                                {preview.domain}
                                            </ThemedText>
                                        </View>
                                        <View style={[styles.divider, { backgroundColor: inputBorder }]} />
                                        <View style={styles.previewRow}>
                                            <ThemedText style={[styles.previewKey, { color: colors.textTertiary }]}>Title</ThemedText>
                                            <ThemedText style={[styles.previewValue, { color: colors.text }]} numberOfLines={2}>
                                                {preview.title ?? '—'}
                                            </ThemedText>
                                        </View>
                                        <View style={[styles.divider, { backgroundColor: inputBorder }]} />
                                        <View style={styles.previewRow}>
                                            <ThemedText style={[styles.previewKey, { color: colors.textTertiary }]}>URL</ThemedText>
                                            <ThemedText style={[styles.previewValueUrl, { color: colors.textTertiary }]} numberOfLines={2}>
                                                {preview.url}
                                            </ThemedText>
                                        </View>
                                    </View>

                                    {/* CTA */}
                                    <TouchableOpacity
                                        onPress={handleOpenSave}
                                        style={styles.saveEntryButton}
                                        activeOpacity={0.85}
                                    >
                                        <Ionicons name="bookmark-outline" size={15} color="#000" />
                                        <ThemedText style={styles.saveEntryButtonText}>
                                            Open Save Entry Modal
                                        </ThemedText>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* SaveSharedLinkModal — opens on top of the dev portal */}
            <SaveSharedLinkModal
                visible={showSaveModal}
                initialUrl={preview?.url ?? ''}
                onClose={() => setShowSaveModal(false)}
                onSaved={handleSaved}
            />
        </>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    sheet: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '88%',
        paddingBottom: 40,
    },
    handle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.18)',
        alignSelf: 'center',
        marginTop: 10,
        marginBottom: 4,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 10,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    devBadge: {
        backgroundColor: '#FF6B35',
        borderRadius: 6,
        paddingHorizontal: 7,
        paddingVertical: 3,
    },
    devBadgeText: {
        fontSize: 10,
        fontWeight: '800',
        color: '#fff',
        letterSpacing: 1,
    },
    title: {
        fontSize: 17,
        fontWeight: '700',
    },
    closeBtn: {
        padding: 4,
    },
    scroll: {
        flexGrow: 0,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingBottom: 24,
        gap: 20,
    },
    section: {
        gap: 10,
    },
    sectionLabel: {
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 1,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: 14,
        paddingVertical: 4,
    },
    urlInput: {
        flex: 1,
        fontSize: 13,
        paddingVertical: 10,
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    },
    pasteBtn: {
        padding: 8,
    },
    parseButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        borderRadius: 12,
        borderWidth: 1,
        paddingVertical: 11,
    },
    parseButtonText: {
        fontSize: 14,
        fontWeight: '600',
    },
    errorText: {
        fontSize: 13,
        textAlign: 'center',
    },
    quickGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    quickChip: {
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 20,
        borderWidth: 1,
    },
    quickChipText: {
        fontSize: 12,
        fontWeight: '500',
    },
    previewCard: {
        borderRadius: 14,
        borderWidth: 1,
        paddingVertical: 4,
    },
    previewRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingHorizontal: 14,
        paddingVertical: 10,
        gap: 12,
    },
    previewKey: {
        fontSize: 12,
        fontWeight: '500',
        minWidth: 64,
        paddingTop: 1,
    },
    previewValueRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        flex: 1,
        justifyContent: 'flex-end',
    },
    previewValue: {
        fontSize: 13,
        fontWeight: '500',
        flex: 1,
        textAlign: 'right',
    },
    previewValueUrl: {
        fontSize: 11,
        flex: 1,
        textAlign: 'right',
    },
    divider: {
        height: 1,
        marginHorizontal: 14,
    },
    saveEntryButton: {
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8,
        marginTop: 4,
    },
    saveEntryButtonText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#000',
    },
});

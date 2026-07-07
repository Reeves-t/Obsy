import React, { useEffect, useState, useCallback } from 'react';
import {
    Modal,
    View,
    Text,
    Pressable,
    StyleSheet,
    Image,
    ActivityIndicator,
    Linking,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import type { TopicAttachment } from '@/services/topicAttachments';
import { createSignedUrl } from '@/services/topicAttachments';
import { useTopicAttachmentStore } from '@/lib/topicAttachmentStore';

interface TopicAttachmentViewerModalProps {
    attachment: TopicAttachment | null;
    onClose: () => void;
}

function formatBytes(bytes: number | null): string {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function TopicAttachmentViewerModal({
    attachment,
    onClose,
}: TopicAttachmentViewerModalProps) {
    const removeAttachment = useTopicAttachmentStore(s => s.removeAttachment);
    const requestExtraction = useTopicAttachmentStore(s => s.requestExtraction);
    const extractingIds = useTopicAttachmentStore(s => s.extractingAttachmentIds);

    const [signedUrl, setSignedUrl] = useState<string | null>(null);
    const [signing, setSigning] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [extractionExpanded, setExtractionExpanded] = useState(false);

    // Fetch a signed URL whenever a new attachment is shown.
    useEffect(() => {
        if (!attachment) {
            setSignedUrl(null);
            setErrorMessage(null);
            return;
        }
        let cancelled = false;
        setSigning(true);
        setErrorMessage(null);
        createSignedUrl(attachment.storage_path).then(url => {
            if (cancelled) return;
            if (!url) {
                setErrorMessage('Could not generate a preview link for this file.');
            }
            setSignedUrl(url);
            setSigning(false);
        });
        return () => {
            cancelled = true;
        };
    }, [attachment?.id, attachment?.storage_path]);

    const handleOpenExternally = useCallback(async () => {
        if (!signedUrl) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        try {
            await Linking.openURL(signedUrl);
        } catch {
            setErrorMessage('Could not open this file with the system viewer.');
        }
    }, [signedUrl]);

    const handleRemove = useCallback(async () => {
        if (!attachment) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        await removeAttachment(attachment);
        onClose();
    }, [attachment, removeAttachment, onClose]);

    const handleRetryExtraction = useCallback(async () => {
        if (!attachment) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        await requestExtraction(attachment.id);
    }, [attachment, requestExtraction]);

    if (!attachment) return null;

    const isImage = attachment.kind === 'image';
    const sizeLabel = formatBytes(attachment.size_bytes);
    const typeLabel = isImage
        ? 'Image'
        : (attachment.mime_type?.split('/')[1]?.toUpperCase() || 'Document');

    return (
        <Modal
            visible={!!attachment}
            transparent
            animationType="fade"
            statusBarTranslucent
            onRequestClose={onClose}
        >
            <Pressable style={styles.backdrop} onPress={onClose}>
                <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFillObject} />
            </Pressable>

            <View style={styles.centerWrap} pointerEvents="box-none">
                <View style={styles.card}>
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={[styles.accent, {
                            backgroundColor: isImage
                                ? 'rgba(255,200,120,0.55)'
                                : 'rgba(180,170,230,0.55)',
                        }]} />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.heading} numberOfLines={1}>
                                {attachment.file_name}
                            </Text>
                            <Text style={styles.subheading}>
                                {typeLabel}{sizeLabel ? ` · ${sizeLabel}` : ''}
                            </Text>
                        </View>
                        <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
                            <Text style={styles.closeGlyph}>✕</Text>
                        </Pressable>
                    </View>

                    {/* Preview area */}
                    <View style={styles.previewArea}>
                        {signing ? (
                            <View style={styles.previewState}>
                                <ActivityIndicator color="rgba(255,255,255,0.5)" />
                            </View>
                        ) : errorMessage ? (
                            <View style={styles.previewState}>
                                <Text style={styles.errorText}>{errorMessage}</Text>
                            </View>
                        ) : isImage && signedUrl ? (
                            <Image source={{ uri: signedUrl }} style={styles.image} resizeMode="contain" />
                        ) : (
                            <View style={styles.previewState}>
                                <Text style={styles.docPlaceholderTitle}>{typeLabel}</Text>
                                <Text style={styles.docPlaceholderBody}>
                                    Open this file to view it in your system viewer.
                                </Text>
                            </View>
                        )}
                    </View>

                    {/* AI extraction status / preview */}
                    {(() => {
                        const inflight = extractingIds.has(attachment.id);
                        const status = attachment.extraction_status;
                        const isProcessing = inflight || status === 'pending' || status === 'processing';

                        if (isProcessing) {
                            return (
                                <View style={styles.extractionRow}>
                                    <ActivityIndicator size="small" color="rgba(180,200,240,0.7)" />
                                    <Text style={styles.extractionLabel}>
                                        Reading this file so the topic AI understands it...
                                    </Text>
                                </View>
                            );
                        }

                        if (status === 'done' && attachment.extracted_text) {
                            return (
                                <Pressable
                                    style={styles.extractionBlock}
                                    onPress={() => setExtractionExpanded(v => !v)}
                                >
                                    <View style={styles.extractionHeaderRow}>
                                        <Text style={styles.extractionHeading}>AI EXTRACTION</Text>
                                        <Text style={styles.extractionToggle}>
                                            {extractionExpanded ? 'Tap to collapse' : 'Tap to expand'}
                                        </Text>
                                    </View>
                                    <Text
                                        style={styles.extractionText}
                                        numberOfLines={extractionExpanded ? undefined : 3}
                                    >
                                        {attachment.extracted_text}
                                    </Text>
                                </Pressable>
                            );
                        }

                        if (status === 'failed' || status === 'skipped') {
                            return (
                                <View style={styles.extractionBlock}>
                                    <View style={styles.extractionHeaderRow}>
                                        <Text style={[styles.extractionHeading, { color: 'rgba(232,180,160,0.85)' }]}>
                                            EXTRACTION {status.toUpperCase()}
                                        </Text>
                                        {status === 'failed' && (
                                            <Pressable onPress={handleRetryExtraction}>
                                                <Text style={styles.extractionToggle}>Retry</Text>
                                            </Pressable>
                                        )}
                                    </View>
                                    <Text style={styles.extractionText}>
                                        {attachment.extraction_error ?? (status === 'skipped'
                                            ? 'This file type is not supported for AI extraction.'
                                            : 'Extraction did not complete.')}
                                    </Text>
                                </View>
                            );
                        }

                        return null;
                    })()}

                    {/* Footer */}
                    <View style={styles.footer}>
                        <Pressable style={styles.removeBtn} onPress={handleRemove}>
                            <Text style={styles.removeLabel}>Remove</Text>
                        </Pressable>
                        <Pressable
                            style={[styles.openBtn, !signedUrl && { opacity: 0.4 }]}
                            onPress={handleOpenExternally}
                            disabled={!signedUrl}
                        >
                            <Text style={styles.openLabel}>Open</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(6,6,10,0.55)',
    },
    centerWrap: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    card: {
        width: '100%',
        maxWidth: 440,
        maxHeight: '85%',
        borderRadius: 22,
        backgroundColor: 'rgba(18,18,26,0.96)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 18,
        paddingTop: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.06)',
    },
    accent: {
        width: 4,
        height: 22,
        borderRadius: 2,
    },
    heading: {
        fontSize: 14,
        fontWeight: '600',
        color: '#fff',
        letterSpacing: -0.1,
    },
    subheading: {
        fontSize: 11.5,
        color: 'rgba(255,255,255,0.45)',
        marginTop: 2,
    },
    closeBtn: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.06)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    closeGlyph: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
    },
    previewArea: {
        minHeight: 220,
        maxHeight: 380,
        backgroundColor: 'rgba(0,0,0,0.25)',
    },
    previewState: {
        flex: 1,
        minHeight: 220,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        gap: 8,
    },
    image: {
        width: '100%',
        height: 360,
    },
    errorText: {
        fontSize: 13,
        color: 'rgba(232,180,160,0.85)',
        textAlign: 'center',
    },
    docPlaceholderTitle: {
        fontSize: 13,
        fontWeight: '600',
        letterSpacing: 1.4,
        color: 'rgba(180,170,230,0.85)',
        textTransform: 'uppercase',
    },
    docPlaceholderBody: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.55)',
        textAlign: 'center',
        lineHeight: 19,
        maxWidth: 280,
    },
    extractionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 18,
        paddingVertical: 14,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.06)',
        backgroundColor: 'rgba(70,90,140,0.06)',
    },
    extractionBlock: {
        paddingHorizontal: 18,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.06)',
        backgroundColor: 'rgba(70,90,140,0.06)',
        gap: 6,
    },
    extractionHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    extractionHeading: {
        fontSize: 10.5,
        fontWeight: '700',
        letterSpacing: 0.8,
        color: 'rgba(180,200,240,0.85)',
    },
    extractionToggle: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.45)',
        fontWeight: '500',
    },
    extractionLabel: {
        fontSize: 12.5,
        color: 'rgba(255,255,255,0.65)',
        flex: 1,
    },
    extractionText: {
        fontSize: 12.5,
        color: 'rgba(255,255,255,0.78)',
        lineHeight: 18,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.06)',
    },
    removeBtn: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 12,
        backgroundColor: 'rgba(232,147,90,0.14)',
        borderWidth: 1,
        borderColor: 'rgba(232,147,90,0.35)',
    },
    removeLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: '#e8935a',
    },
    openBtn: {
        paddingVertical: 10,
        paddingHorizontal: 22,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.96)',
    },
    openLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: '#0b0c10',
    },
});

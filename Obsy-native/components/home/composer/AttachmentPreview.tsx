import React from 'react';
import { ActivityIndicator, Image, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/ui/ThemedText';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { platformToColor, platformToIcon } from '@/services/sharedLinkService';
import type { ComposerAttachment } from './types';

interface AttachmentPreviewProps {
    attachment: ComposerAttachment;
    onRemove: () => void;
}

function formatDuration(seconds = 0) {
    const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${secs}`;
}

/** Preview chip for the composer's active attachment (photo / voice / link). */
export function AttachmentPreview({ attachment, onRemove }: AttachmentPreviewProps) {
    const { colors, isLight } = useObsyTheme();

    if (attachment.kind === 'none' || (attachment.kind === 'voice' && attachment.phase === 'recording')) {
        return null;
    }

    const border = isLight ? colors.cardBorder : 'rgba(255,255,255,0.12)';
    const chipBg = isLight ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)';
    const secondary = isLight ? colors.cardTextSecondary : 'rgba(255,255,255,0.55)';

    const removeButton = (
        <TouchableOpacity
            onPress={onRemove}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={[styles.removeButton, { borderColor: border }]}
        >
            <Ionicons name="close" size={12} color={secondary} />
        </TouchableOpacity>
    );

    if (attachment.kind === 'photo') {
        return (
            <View style={[styles.chip, { borderColor: border, backgroundColor: chipBg }]}>
                <Image source={{ uri: attachment.localUri }} style={styles.thumbnail} />
                <ThemedText style={[styles.label, { color: colors.text }]} numberOfLines={1}>
                    Photo attached
                </ThemedText>
                {removeButton}
            </View>
        );
    }

    if (attachment.kind === 'voice') {
        const isProcessing = attachment.phase === 'processing';
        const isError = attachment.phase === 'error';
        return (
            <View style={[styles.chip, { borderColor: border, backgroundColor: chipBg }]}>
                <View style={[styles.iconBadge, { borderColor: border }]}>
                    {isProcessing ? (
                        <ActivityIndicator size="small" color={secondary} />
                    ) : (
                        <Ionicons
                            name={isError ? 'alert-circle-outline' : 'mic'}
                            size={15}
                            color={isError ? 'rgba(255,110,110,0.9)' : colors.text}
                        />
                    )}
                </View>
                <View style={styles.textBlock}>
                    <ThemedText style={[styles.label, { color: colors.text }]} numberOfLines={1}>
                        {isProcessing
                            ? 'Transcribing…'
                            : isError
                                ? 'Upload failed'
                                : `Voice note · ${formatDuration(attachment.durationSec)}`}
                    </ThemedText>
                    {attachment.phase === 'ready' && attachment.transcriptError && (
                        <ThemedText style={styles.subLabelError} numberOfLines={1}>
                            Transcription failed — saving audio only.
                        </ThemedText>
                    )}
                </View>
                {removeButton}
            </View>
        );
    }

    const { meta } = attachment;
    return (
        <View style={[styles.chip, { borderColor: border, backgroundColor: chipBg }]}>
            <View style={[styles.iconBadge, { borderColor: border }]}>
                <Ionicons
                    name={platformToIcon(meta.platform) as never}
                    size={15}
                    color={platformToColor(meta.platform)}
                />
            </View>
            <View style={styles.textBlock}>
                <ThemedText style={[styles.label, { color: colors.text }]} numberOfLines={1}>
                    {meta.title ?? meta.domain}
                </ThemedText>
                <ThemedText style={[styles.subLabel, { color: secondary }]} numberOfLines={1}>
                    {meta.platform} · {meta.domain}
                </ThemedText>
            </View>
            {removeButton}
        </View>
    );
}

const styles = StyleSheet.create({
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderWidth: 1,
        borderRadius: 13,
        paddingHorizontal: 10,
        paddingVertical: 8,
        marginBottom: 10,
    },
    thumbnail: {
        width: 44,
        height: 44,
        borderRadius: 9,
    },
    iconBadge: {
        width: 34,
        height: 34,
        borderRadius: 10,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    textBlock: {
        flex: 1,
    },
    label: {
        fontSize: 13.5,
        fontWeight: '600',
    },
    subLabel: {
        fontSize: 11.5,
        marginTop: 2,
    },
    subLabelError: {
        fontSize: 11.5,
        marginTop: 2,
        color: 'rgba(255,110,110,0.8)',
    },
    removeButton: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
});

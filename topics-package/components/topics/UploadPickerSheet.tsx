import React, { useState, useCallback } from 'react';
import {
    Modal,
    View,
    Text,
    Pressable,
    StyleSheet,
    ActivityIndicator,
} from 'react-native';
import { BlurView } from 'expo-blur';
import Svg, { Path, Rect, Circle as SvgCircle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';

import { useTopicAttachmentStore } from '@/lib/topicAttachmentStore';
import { pickDocument, pickImage } from '@/services/topicAttachments';

interface UploadPickerSheetProps {
    visible: boolean;
    topicId: string;
    topicTitle: string;
    onClose: () => void;
}

type Phase = 'choose' | 'uploading' | 'error';

// ── Glyphs ─────────────────────────────────────────────────

function DocGlyph() {
    return (
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
            <Path
                d="M5 3.4 L13.6 3.4 L18 7.8 L18 19 Q18 20 17 20 L5 20 Q4 20 4 19 L4 4.4 Q4 3.4 5 3.4 Z"
                stroke="rgba(255,255,255,0.9)"
                strokeWidth={1.4}
                strokeLinejoin="round"
            />
            <Path
                d="M13.6 3.4 L18 7.8 L14.6 7.8 Q13.6 7.8 13.6 6.8 Z"
                stroke="rgba(255,255,255,0.9)"
                strokeWidth={1.4}
                strokeLinejoin="round"
            />
        </Svg>
    );
}

function PhotoGlyph() {
    return (
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
            <Rect x={3} y={5} width={18} height={14} rx={2} stroke="rgba(255,255,255,0.9)" strokeWidth={1.4} />
            <SvgCircle cx={9} cy={11} r={1.8} stroke="rgba(255,255,255,0.9)" strokeWidth={1.4} />
            <Path
                d="M3 17 L9 12 L13 15 L17 11 L21 14"
                stroke="rgba(255,255,255,0.9)"
                strokeWidth={1.4}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
        </Svg>
    );
}

// ── Sheet ──────────────────────────────────────────────────

export function UploadPickerSheet({
    visible,
    topicId,
    topicTitle,
    onClose,
}: UploadPickerSheetProps) {
    const uploadForTopic = useTopicAttachmentStore(s => s.uploadForTopic);

    const [phase, setPhase] = useState<Phase>('choose');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [progressLabel, setProgressLabel] = useState<string>('');

    const reset = useCallback(() => {
        setPhase('choose');
        setErrorMessage(null);
        setProgressLabel('');
    }, []);

    const handleClose = useCallback(() => {
        if (phase === 'uploading') return; // don't allow close mid-upload
        reset();
        onClose();
    }, [phase, reset, onClose]);

    const runPickAndUpload = useCallback(
        async (kind: 'document' | 'image') => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            try {
                const file = kind === 'document' ? await pickDocument() : await pickImage();
                if (!file) {
                    // user canceled or permission denied
                    return;
                }
                setProgressLabel(file.name);
                setPhase('uploading');
                const result = await uploadForTopic(topicId, file);
                if (!result) {
                    const storeErr = useTopicAttachmentStore.getState().lastError;
                    setErrorMessage(storeErr ?? 'Upload failed. Try again.');
                    setPhase('error');
                    return;
                }
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                reset();
                onClose();
            } catch (err: any) {
                setErrorMessage(err?.message ?? 'Unexpected error');
                setPhase('error');
            }
        },
        [topicId, uploadForTopic, reset, onClose],
    );

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            statusBarTranslucent
            onRequestClose={handleClose}
        >
            <Pressable style={StyleSheet.absoluteFill} onPress={handleClose}>
                <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFillObject} />
            </Pressable>

            <View style={styles.sheetWrap} pointerEvents="box-none">
                <View style={styles.sheet}>
                    <View style={styles.handle} />

                    <Text style={styles.eyebrow}>ATTACH TO</Text>
                    <Text style={styles.title} numberOfLines={1}>
                        {topicTitle}
                    </Text>

                    {phase === 'uploading' ? (
                        <View style={styles.uploadingArea}>
                            <ActivityIndicator color="rgba(255,255,255,0.7)" />
                            <Text style={styles.uploadingLabel} numberOfLines={1}>
                                Uploading {progressLabel}...
                            </Text>
                        </View>
                    ) : phase === 'error' ? (
                        <View style={styles.errorArea}>
                            <Text style={styles.errorTitle}>Upload failed</Text>
                            <Text style={styles.errorBody}>{errorMessage}</Text>
                            <Pressable style={styles.retryBtn} onPress={reset}>
                                <Text style={styles.retryLabel}>Try again</Text>
                            </Pressable>
                        </View>
                    ) : (
                        <View style={styles.options}>
                            <Pressable
                                style={styles.option}
                                onPress={() => runPickAndUpload('document')}
                            >
                                <View style={styles.optionIcon}><DocGlyph /></View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.optionTitle}>Document or file</Text>
                                    <Text style={styles.optionBody}>
                                        PDFs, text, planning docs, anything
                                    </Text>
                                </View>
                                <Text style={styles.optionChevron}>›</Text>
                            </Pressable>

                            <View style={styles.divider} />

                            <Pressable
                                style={styles.option}
                                onPress={() => runPickAndUpload('image')}
                            >
                                <View style={styles.optionIcon}><PhotoGlyph /></View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.optionTitle}>Photo or screenshot</Text>
                                    <Text style={styles.optionBody}>
                                        Pick from your library
                                    </Text>
                                </View>
                                <Text style={styles.optionChevron}>›</Text>
                            </Pressable>
                        </View>
                    )}

                    <Pressable style={styles.cancelBtn} onPress={handleClose} disabled={phase === 'uploading'}>
                        <Text style={[styles.cancelLabel, phase === 'uploading' && { opacity: 0.4 }]}>
                            {phase === 'uploading' ? 'Uploading...' : 'Cancel'}
                        </Text>
                    </Pressable>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    sheetWrap: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: '#0e0e14',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingTop: 12,
        paddingBottom: 42,
        paddingHorizontal: 20,
        borderTopWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        gap: 10,
    },
    handle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignSelf: 'center',
        marginBottom: 6,
    },
    eyebrow: {
        fontSize: 10,
        fontWeight: '600',
        letterSpacing: 1.4,
        color: 'rgba(255,255,255,0.35)',
        textAlign: 'center',
    },
    title: {
        fontSize: 18,
        fontWeight: '600',
        color: '#fff',
        letterSpacing: -0.2,
        textAlign: 'center',
        marginBottom: 18,
    },
    options: {
        gap: 0,
        marginBottom: 4,
    },
    option: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 14,
        paddingHorizontal: 4,
    },
    optionIcon: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    optionTitle: {
        fontSize: 15,
        fontWeight: '500',
        color: '#fff',
        letterSpacing: -0.1,
    },
    optionBody: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.5)',
        marginTop: 2,
    },
    optionChevron: {
        fontSize: 24,
        color: 'rgba(255,255,255,0.3)',
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.06)',
        marginVertical: 2,
    },
    uploadingArea: {
        paddingVertical: 28,
        alignItems: 'center',
        gap: 12,
    },
    uploadingLabel: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.6)',
        maxWidth: '90%',
    },
    errorArea: {
        paddingVertical: 18,
        gap: 8,
    },
    errorTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: 'rgba(232,147,90,0.95)',
    },
    errorBody: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.6)',
        lineHeight: 19,
    },
    retryBtn: {
        marginTop: 12,
        alignSelf: 'flex-start',
        paddingVertical: 9,
        paddingHorizontal: 16,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    retryLabel: {
        fontSize: 13,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.8)',
    },
    cancelBtn: {
        marginTop: 10,
        alignSelf: 'center',
        paddingVertical: 10,
        paddingHorizontal: 18,
    },
    cancelLabel: {
        fontSize: 14,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.55)',
        letterSpacing: 0.2,
    },
});

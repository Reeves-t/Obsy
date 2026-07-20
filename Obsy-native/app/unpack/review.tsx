import React, { useMemo, useState } from 'react';
import {
    Alert,
    Image,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useUnpackStore, selectQuestionAnswers } from '@/lib/unpackStore';
import { useCaptureStore } from '@/lib/captureStore';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/hooks/useSubscription';
import { useAiFreeMode } from '@/hooks/useAiFreeMode';
import { getMoodTheme } from '@/lib/moods';
import { UNPACK_PAYLOAD_VERSION, type UnpackPayload } from '@/lib/unpack/types';

const COBALT = '#41caec';

export default function UnpackReviewScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const { tier } = useSubscription();
    const { aiFreeMode } = useAiFreeMode();
    const createUnpackEntry = useCaptureStore((s) => s.createUnpackEntry);

    const context = useUnpackStore((s) => s.context);
    const moodId = useUnpackStore((s) => s.moodId);
    const moodName = useUnpackStore((s) => s.moodName);
    const reflection = useUnpackStore((s) => s.reflection);
    const setStatus = useUnpackStore((s) => s.setStatus);
    const reset = useUnpackStore((s) => s.reset);

    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(reflection?.reflection ?? '');
    const [isSaving, setIsSaving] = useState(false);
    const [menuVisible, setMenuVisible] = useState(false);

    const moodGradient = useMemo(
        () => (moodId ? getMoodTheme(moodId).gradient : null),
        [moodId]
    );

    if (!reflection || !context) {
        // Defensive: store cleared (e.g. hot reload). Bail to home.
        return (
            <View style={styles.container}>
                <LinearGradient colors={['#050a16', '#071019', '#04121a']} style={StyleSheet.absoluteFill} />
            </View>
        );
    }

    const reflectionText = editing ? draft : (draft || reflection.reflection);

    const buildPayload = (): UnpackPayload => ({
        version: UNPACK_PAYLOAD_VERSION,
        originalEntryType: context.type,
        originalText: context.text || null,
        selectedMood: moodName,
        mediaAttachments: context.photoLocalUri ? [context.photoLocalUri] : [],
        sharedLink: context.sharedLink
            ? {
                  url: context.sharedLink.url,
                  title: context.sharedLink.title ?? null,
                  summary: context.sharedLink.summary ?? null,
                  source: context.sharedLink.source ?? null,
              }
            : null,
        voiceTranscript: context.transcript ?? null,
        questions: selectQuestionAnswers(useUnpackStore.getState()),
        generatedReflection: reflection.reflection,
        userEditedReflection: draft && draft !== reflection.reflection ? draft : null,
        themes: reflection.themes,
        insightSignals: reflection.insightSignals,
        createdAt: new Date().toISOString(),
    });

    const handleSave = async () => {
        if (!moodId || isSaving) return;
        setIsSaving(true);
        const finalText = draft.trim() || reflection.reflection;
        const payload = buildPayload();
        try {
            await createUnpackEntry(
                user,
                moodId,
                moodName,
                finalText,
                payload,
                {
                    imageLocalUri: context.type === 'photo' ? context.photoLocalUri ?? null : null,
                    tier,
                    audioUrl: context.type === 'voice' ? context.voiceStoragePath ?? null : null,
                    sharedLinkUrl: context.sharedLink?.url ?? null,
                    sharedLinkPlatform: context.sharedLink?.platform ?? null,
                    sharedLinkTitle: context.sharedLink?.title ?? null,
                    sharedLinkThumbnailUrl: context.sharedLink?.thumbnailUrl ?? null,
                    sharedLinkDigest: context.sharedLink?.summary ?? null,
                    sharedLinkMediaType: context.sharedLink?.mediaType ?? null,
                },
                !aiFreeMode
            );
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            reset();
            router.dismissAll();
            setTimeout(() => router.replace('/(tabs)'), 80);
        } catch (error: any) {
            setIsSaving(false);
            Alert.alert('Couldn’t save', error?.message || 'Something went wrong. Please try again.');
        }
    };

    const handleDiscard = () => {
        Alert.alert('Discard this reflection?', 'This unpacked moment won’t be saved.', [
            { text: 'Keep editing', style: 'cancel' },
            {
                text: 'Discard',
                style: 'destructive',
                onPress: () => {
                    reset();
                    router.dismissAll();
                    setTimeout(() => router.replace('/(tabs)'), 80);
                },
            },
        ]);
    };

    const handleRegenerate = () => {
        setMenuVisible(false);
        setStatus('generating');
        router.replace('/unpack/loading');
    };

    const toggleEdit = () => {
        if (editing) {
            useUnpackStore.getState().setEditedReflection(draft);
        }
        setEditing((v) => !v);
    };

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={['#050a16', '#071019', '#04121a']}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.8, y: 1 }}
                style={StyleSheet.absoluteFill}
            />
            <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>Guided reflection ✦</Text>
                    </View>
                    <TouchableOpacity onPress={() => setMenuVisible(true)} hitSlop={12} style={styles.headerBtn}>
                        <Ionicons name="ellipsis-horizontal" size={22} color="rgba(220,235,245,0.75)" />
                    </TouchableOpacity>
                </View>

                <ScrollView
                    contentContainerStyle={styles.content}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    <Text style={styles.flowTitle}>Unpacked Moment</Text>
                    <Text style={styles.title}>{reflection.title}</Text>

                    {/* Mood pill */}
                    {moodGradient && (
                        <LinearGradient
                            colors={[moodGradient.primary, moodGradient.secondary]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.moodPill}
                        >
                            <Text style={styles.moodPillText}>{moodName}</Text>
                        </LinearGradient>
                    )}

                    {/* Reflection */}
                    <View style={styles.reflectionCard}>
                        {editing ? (
                            <TextInput
                                value={draft}
                                onChangeText={setDraft}
                                multiline
                                autoFocus
                                style={styles.reflectionInput}
                                selectionColor={COBALT}
                            />
                        ) : (
                            <Text style={styles.reflectionText}>{reflectionText}</Text>
                        )}
                    </View>

                    {/* Themes */}
                    {reflection.themes.length > 0 && (
                        <View style={styles.chipRow}>
                            {reflection.themes.map((t) => (
                                <View key={t} style={styles.chip}>
                                    <Text style={styles.chipText}>{t}</Text>
                                </View>
                            ))}
                        </View>
                    )}

                    {/* Original input / source preview */}
                    <OriginalPreview context={context} />
                </ScrollView>

                {/* Actions */}
                <View style={styles.footer}>
                    <TouchableOpacity onPress={handleDiscard} style={styles.discardBtn} disabled={isSaving}>
                        <Text style={styles.discardText}>Discard</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={toggleEdit} style={styles.editBtn} disabled={isSaving}>
                        <Ionicons name={editing ? 'checkmark' : 'create-outline'} size={18} color="#EAF6FB" />
                        <Text style={styles.editText}>{editing ? 'Done' : 'Edit'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={handleSave}
                        style={[styles.saveBtn, isSaving && styles.saveDisabled]}
                        disabled={isSaving}
                    >
                        <Text style={styles.saveText}>{isSaving ? 'Saving…' : 'Save Entry'}</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>

            {/* Overflow menu */}
            <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
                <Pressable style={styles.menuBackdrop} onPress={() => setMenuVisible(false)}>
                    <Pressable style={styles.menuSheet} onPress={() => {}}>
                        <TouchableOpacity style={styles.menuRow} onPress={handleRegenerate}>
                            <Ionicons name="refresh" size={18} color="#EAF6FB" />
                            <Text style={styles.menuText}>Regenerate</Text>
                        </TouchableOpacity>
                    </Pressable>
                </Pressable>
            </Modal>
        </View>
    );
}

function OriginalPreview({ context }: { context: NonNullable<ReturnType<typeof useUnpackStore.getState>['context']> }) {
    const label =
        context.type === 'photo'
            ? 'Original photo'
            : context.type === 'voice'
                ? 'Voice transcript'
                : context.type === 'link'
                    ? 'Shared link'
                    : 'Original thought';

    const body =
        context.type === 'voice'
            ? context.transcript || context.text
            : context.type === 'link'
                ? context.sharedLink?.title || context.sharedLink?.url
                : context.text;

    if (context.type !== 'photo' && !body) return null;

    return (
        <View style={styles.originalCard}>
            <Text style={styles.originalLabel}>{label}</Text>
            {context.type === 'photo' && context.photoLocalUri ? (
                <Image source={{ uri: context.photoLocalUri }} style={styles.originalImage} />
            ) : null}
            {context.type === 'photo' && context.text ? (
                <Text style={styles.originalText}>{context.text}</Text>
            ) : null}
            {context.type !== 'photo' && body ? <Text style={styles.originalText}>{body}</Text> : null}
            {context.type === 'link' && context.sharedLink?.source ? (
                <Text style={styles.originalSub}>{context.sharedLink.source}</Text>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    safe: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 4,
    },
    headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    badge: {
        borderWidth: 1,
        borderColor: 'rgba(65,202,236,0.4)',
        backgroundColor: 'rgba(65,202,236,0.1)',
        borderRadius: 100,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    badgeText: {
        fontSize: 12,
        fontWeight: '600',
        color: COBALT,
    },
    content: {
        paddingHorizontal: 24,
        paddingTop: 12,
        paddingBottom: 40,
    },
    flowTitle: {
        fontSize: 12.5,
        fontWeight: '700',
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: 'rgba(200,220,235,0.5)',
        marginBottom: 8,
    },
    title: {
        fontSize: 26,
        lineHeight: 32,
        fontWeight: '700',
        color: '#EAF6FB',
        marginBottom: 16,
    },
    moodPill: {
        alignSelf: 'flex-start',
        borderRadius: 100,
        paddingHorizontal: 14,
        paddingVertical: 7,
        marginBottom: 20,
    },
    moodPillText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    reflectionCard: {
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.09)',
        borderRadius: 18,
        padding: 18,
    },
    reflectionText: {
        fontSize: 17,
        lineHeight: 27,
        color: '#EAF6FB',
    },
    reflectionInput: {
        fontSize: 17,
        lineHeight: 27,
        color: '#EAF6FB',
        textAlignVertical: 'top',
        minHeight: 160,
        padding: 0,
    },
    chipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 16,
    },
    chip: {
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 100,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    chipText: {
        fontSize: 13,
        color: 'rgba(220,235,245,0.85)',
    },
    originalCard: {
        marginTop: 24,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        borderRadius: 16,
        padding: 16,
    },
    originalLabel: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        color: 'rgba(200,220,235,0.5)',
        marginBottom: 8,
    },
    originalImage: {
        width: '100%',
        height: 180,
        borderRadius: 12,
        marginBottom: 10,
    },
    originalText: {
        fontSize: 15,
        lineHeight: 22,
        color: 'rgba(220,235,245,0.85)',
    },
    originalSub: {
        fontSize: 13,
        color: 'rgba(200,220,235,0.5)',
        marginTop: 4,
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: Platform.OS === 'ios' ? 6 : 14,
    },
    discardBtn: {
        paddingVertical: 14,
        paddingHorizontal: 14,
    },
    discardText: {
        fontSize: 15,
        color: 'rgba(220,140,140,0.85)',
    },
    editBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 14,
        paddingHorizontal: 14,
    },
    editText: {
        fontSize: 15,
        color: '#EAF6FB',
    },
    saveBtn: {
        flex: 1,
        backgroundColor: COBALT,
        borderRadius: 14,
        paddingVertical: 15,
        alignItems: 'center',
    },
    saveDisabled: { opacity: 0.6 },
    saveText: {
        fontSize: 15.5,
        fontWeight: '700',
        color: '#04121a',
    },
    menuBackdrop: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    menuSheet: {
        backgroundColor: '#0c1826',
        borderTopLeftRadius: 18,
        borderTopRightRadius: 18,
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 34,
    },
    menuRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 16,
    },
    menuText: {
        fontSize: 16,
        color: '#EAF6FB',
    },
});

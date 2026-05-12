import React, { useState, useCallback, useMemo } from 'react';
import {
    View,
    Modal,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    TextInput,
    Switch,
    ActivityIndicator,
    Linking,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { ThemedText } from '@/components/ui/ThemedText';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCaptureStore } from '@/lib/captureStore';
import { useTopicStore } from '@/lib/topicStore';
import { useMoodResolver } from '@/hooks/useMoodResolver';
import { moodCache } from '@/lib/moodCache';
import {
    parseSharedLinkMetadata,
    platformToIcon,
    platformToColor,
    type SharedLinkMetadata,
} from '@/services/sharedLinkService';
import type { SharedLinkPlatform } from '@/services/sharedLinkService';
import { MOODS } from '@/constants/Moods';
import { getMoodTheme } from '@/lib/moods';
import Colors from '@/constants/Colors';

interface SaveSharedLinkModalProps {
    visible: boolean;
    initialUrl?: string;
    onClose: () => void;
    onSaved?: () => void;
}

type DestinationType = 'today' | 'topic';

export function SaveSharedLinkModal({
    visible,
    initialUrl = '',
    onClose,
    onSaved,
}: SaveSharedLinkModalProps) {
    const { colors, isLight } = useObsyTheme();
    const { user } = useAuth();
    const { createSharedLinkEntry } = useCaptureStore();
    const { topics } = useTopicStore();

    const [selectedMoodId, setSelectedMoodId] = useState<string | null>(null);
    const [note, setNote] = useState('');
    const [destination, setDestination] = useState<DestinationType>('today');
    const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
    const [useForInsights, setUseForInsights] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const meta: SharedLinkMetadata = useMemo(() => {
        if (!initialUrl) return { url: '', platform: 'Web', title: null, domain: '' };
        return parseSharedLinkMetadata(initialUrl);
    }, [initialUrl]);

    const platform = meta.platform as SharedLinkPlatform;
    const platformIcon = platformToIcon(platform);
    const platformColor = platformToColor(platform);

    const canSave = !!selectedMoodId && !!meta.url;

    const handleSave = useCallback(async () => {
        if (!canSave || !selectedMoodId) return;
        setSaving(true);
        setError(null);
        try {
            const allMoods = moodCache.getAllMoods();
            const mood = allMoods.find(m => m.id === selectedMoodId);
            const moodName = mood?.name ?? selectedMoodId;

            const topicTag = destination === 'topic' && selectedTopicId
                ? `topic:${selectedTopicId}`
                : null;

            await createSharedLinkEntry(
                user,
                selectedMoodId,
                moodName,
                meta.url,
                meta.platform,
                meta.title,
                null,
                note.trim() || null,
                topicTag,
                useForInsights,
            );
            onSaved?.();
            onClose();
            resetForm();
        } catch (err: any) {
            setError(err?.message ?? 'Failed to save. Please try again.');
        } finally {
            setSaving(false);
        }
    }, [canSave, selectedMoodId, meta, note, destination, selectedTopicId, useForInsights, user]);

    const resetForm = useCallback(() => {
        setSelectedMoodId(null);
        setNote('');
        setDestination('today');
        setSelectedTopicId(null);
        setUseForInsights(true);
        setError(null);
    }, []);

    const handleClose = useCallback(() => {
        resetForm();
        onClose();
    }, [resetForm, onClose]);

    const handleOpenUrl = useCallback(() => {
        if (meta.url) Linking.openURL(meta.url).catch(() => {});
    }, [meta.url]);

    // All available moods (system + custom)
    const allMoods = useMemo(() => moodCache.getAllMoods(), []);
    const systemMoods = useMemo(
        () => allMoods.filter(m => m.type === 'system'),
        [allMoods],
    );

    const inputBg = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)';
    const inputBorder = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
    const sectionBg = isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)';

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent
            onRequestClose={handleClose}
        >
            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
            <KeyboardAvoidingView
                style={styles.overlay}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <View style={[styles.sheet, { backgroundColor: isLight ? '#F8F8F8' : '#0E0F11' }]}>
                    {/* Handle */}
                    <View style={styles.handle} />

                    {/* Header */}
                    <View style={styles.header}>
                        <View>
                            <ThemedText style={[styles.title, { color: colors.text }]}>
                                Save to Obsy
                            </ThemedText>
                            <ThemedText style={[styles.subtitle, { color: colors.textTertiary }]}>
                                Attach a mood to what caught your attention.
                            </ThemedText>
                        </View>
                        <TouchableOpacity onPress={handleClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <Ionicons name="close" size={22} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView
                        style={styles.scroll}
                        contentContainerStyle={styles.scrollContent}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        {/* ── Link Preview Card ── */}
                        <TouchableOpacity
                            onPress={handleOpenUrl}
                            activeOpacity={0.85}
                            style={[styles.linkCard, { backgroundColor: sectionBg, borderColor: inputBorder }]}
                        >
                            <View style={[styles.platformChip, { borderColor: platformColor + '55' }]}>
                                <Ionicons name={platformIcon as any} size={12} color={platformColor} />
                                <ThemedText style={[styles.platformText, { color: platformColor }]}>
                                    {platform}
                                </ThemedText>
                            </View>
                            {meta.title ? (
                                <ThemedText numberOfLines={2} style={[styles.linkTitle, { color: colors.text }]}>
                                    {meta.title}
                                </ThemedText>
                            ) : null}
                            <ThemedText numberOfLines={1} style={[styles.linkDomain, { color: colors.textTertiary }]}>
                                {meta.domain || meta.url}
                            </ThemedText>
                            <View style={styles.openLinkRow}>
                                <Ionicons name="open-outline" size={11} color={colors.textTertiary} />
                                <ThemedText style={[styles.openLinkText, { color: colors.textTertiary }]}>
                                    Tap to open
                                </ThemedText>
                            </View>
                        </TouchableOpacity>

                        {/* ── Mood Picker ── */}
                        <View style={styles.section}>
                            <ThemedText style={[styles.sectionLabel, { color: colors.textTertiary }]}>
                                MOOD
                            </ThemedText>
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.moodRow}
                            >
                                {systemMoods.map(mood => {
                                    const theme = getMoodTheme(mood.id);
                                    const isSelected = selectedMoodId === mood.id;
                                    return (
                                        <TouchableOpacity
                                            key={mood.id}
                                            onPress={() => setSelectedMoodId(mood.id)}
                                            style={[
                                                styles.moodChip,
                                                isSelected && styles.moodChipSelected,
                                                {
                                                    backgroundColor: isSelected
                                                        ? theme.solid + 'CC'
                                                        : isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)',
                                                    borderColor: isSelected ? theme.solid : 'transparent',
                                                },
                                            ]}
                                        >
                                            {isSelected && (
                                                <View style={[styles.moodDot, { backgroundColor: theme.solid }]} />
                                            )}
                                            <ThemedText style={[
                                                styles.moodChipText,
                                                {
                                                    color: isSelected
                                                        ? (theme.textOn === 'dark' ? '#000' : '#fff')
                                                        : colors.textSecondary,
                                                    fontWeight: isSelected ? '600' : '400',
                                                },
                                            ]}>
                                                {mood.name}
                                            </ThemedText>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        </View>

                        {/* ── Save As ── */}
                        <View style={styles.section}>
                            <ThemedText style={[styles.sectionLabel, { color: colors.textTertiary }]}>
                                SAVE AS
                            </ThemedText>
                            <View style={styles.destinationRow}>
                                <TouchableOpacity
                                    onPress={() => setDestination('today')}
                                    style={[
                                        styles.destButton,
                                        {
                                            backgroundColor: destination === 'today'
                                                ? 'rgba(255,255,255,0.12)'
                                                : inputBg,
                                            borderColor: destination === 'today'
                                                ? 'rgba(255,255,255,0.25)'
                                                : inputBorder,
                                        },
                                    ]}
                                >
                                    <Ionicons
                                        name="today-outline"
                                        size={14}
                                        color={destination === 'today' ? colors.text : colors.textTertiary}
                                    />
                                    <ThemedText style={[
                                        styles.destButtonText,
                                        { color: destination === 'today' ? colors.text : colors.textTertiary },
                                    ]}>
                                        Today
                                    </ThemedText>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => setDestination('topic')}
                                    style={[
                                        styles.destButton,
                                        {
                                            backgroundColor: destination === 'topic'
                                                ? 'rgba(255,255,255,0.12)'
                                                : inputBg,
                                            borderColor: destination === 'topic'
                                                ? 'rgba(255,255,255,0.25)'
                                                : inputBorder,
                                        },
                                    ]}
                                >
                                    <Ionicons
                                        name="bookmark-outline"
                                        size={14}
                                        color={destination === 'topic' ? colors.text : colors.textTertiary}
                                    />
                                    <ThemedText style={[
                                        styles.destButtonText,
                                        { color: destination === 'topic' ? colors.text : colors.textTertiary },
                                    ]}>
                                        Topic
                                    </ThemedText>
                                </TouchableOpacity>
                            </View>

                            {destination === 'topic' && (
                                <View style={styles.topicPicker}>
                                    {topics.length === 0 ? (
                                        <ThemedText style={[styles.noTopics, { color: colors.textTertiary }]}>
                                            No topics yet. Create one in the Topics tab.
                                        </ThemedText>
                                    ) : (
                                        <ScrollView
                                            horizontal
                                            showsHorizontalScrollIndicator={false}
                                            contentContainerStyle={styles.topicRow}
                                        >
                                            {topics.map(topic => {
                                                const isSelected = selectedTopicId === topic.id;
                                                return (
                                                    <TouchableOpacity
                                                        key={topic.id}
                                                        onPress={() => setSelectedTopicId(isSelected ? null : topic.id)}
                                                        style={[
                                                            styles.topicChip,
                                                            {
                                                                backgroundColor: isSelected
                                                                    ? `hsla(${topic.hue},60%,55%,0.25)`
                                                                    : inputBg,
                                                                borderColor: isSelected
                                                                    ? `hsla(${topic.hue},60%,55%,0.6)`
                                                                    : inputBorder,
                                                            },
                                                        ]}
                                                    >
                                                        <ThemedText style={[
                                                            styles.topicChipText,
                                                            { color: isSelected ? colors.text : colors.textSecondary },
                                                        ]}>
                                                            {topic.title}
                                                        </ThemedText>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </ScrollView>
                                    )}
                                </View>
                            )}
                        </View>

                        {/* ── Note ── */}
                        <View style={styles.section}>
                            <ThemedText style={[styles.sectionLabel, { color: colors.textTertiary }]}>
                                NOTE
                            </ThemedText>
                            <TextInput
                                value={note}
                                onChangeText={setNote}
                                placeholder="Why did this catch your attention?"
                                placeholderTextColor={colors.textTertiary}
                                multiline
                                numberOfLines={3}
                                style={[
                                    styles.noteInput,
                                    {
                                        backgroundColor: inputBg,
                                        borderColor: inputBorder,
                                        color: colors.text,
                                    },
                                ]}
                            />
                        </View>

                        {/* ── Use for insights toggle ── */}
                        <View style={[styles.toggleRow, { backgroundColor: sectionBg, borderColor: inputBorder }]}>
                            <View style={styles.toggleTextArea}>
                                <ThemedText style={[styles.toggleLabel, { color: colors.text }]}>
                                    Use for insights
                                </ThemedText>
                                <ThemedText style={[styles.toggleSub, { color: colors.textTertiary }]}>
                                    Include this in AI reflection
                                </ThemedText>
                            </View>
                            <Switch
                                value={useForInsights}
                                onValueChange={setUseForInsights}
                                trackColor={{ false: 'rgba(255,255,255,0.1)', true: Colors.obsy.silver }}
                                thumbColor="#fff"
                            />
                        </View>

                        {/* ── Error ── */}
                        {error && (
                            <ThemedText style={[styles.errorText, { color: '#FF6B6B' }]}>
                                {error}
                            </ThemedText>
                        )}

                        {/* ── Submit ── */}
                        <TouchableOpacity
                            onPress={handleSave}
                            disabled={!canSave || saving}
                            style={[
                                styles.saveButton,
                                {
                                    backgroundColor: canSave
                                        ? 'rgba(255,255,255,0.95)'
                                        : 'rgba(255,255,255,0.15)',
                                },
                            ]}
                        >
                            {saving ? (
                                <ActivityIndicator size="small" color="#000" />
                            ) : (
                                <ThemedText style={[
                                    styles.saveButtonText,
                                    { color: canSave ? '#000' : 'rgba(255,255,255,0.3)' },
                                ]}>
                                    Save Entry
                                </ThemedText>
                            )}
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            </KeyboardAvoidingView>
        </Modal>
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
        maxHeight: '92%',
        paddingBottom: 40,
    },
    handle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignSelf: 'center',
        marginTop: 10,
        marginBottom: 4,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 8,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        letterSpacing: -0.3,
    },
    subtitle: {
        fontSize: 13,
        marginTop: 3,
    },
    closeBtn: {
        padding: 4,
        marginTop: 2,
    },
    scroll: {
        flexGrow: 0,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingBottom: 20,
        gap: 16,
    },
    // Link preview card
    linkCard: {
        borderRadius: 14,
        borderWidth: 1,
        padding: 14,
        gap: 6,
    },
    platformChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderRadius: 20,
        paddingHorizontal: 8,
        paddingVertical: 3,
    },
    platformText: {
        fontSize: 10,
        fontWeight: '600',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
    },
    linkTitle: {
        fontSize: 14,
        fontWeight: '500',
        lineHeight: 20,
    },
    linkDomain: {
        fontSize: 11,
        opacity: 0.6,
    },
    openLinkRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 2,
    },
    openLinkText: {
        fontSize: 11,
        opacity: 0.5,
    },
    // Section
    section: {
        gap: 10,
    },
    sectionLabel: {
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 1,
    },
    // Mood picker
    moodRow: {
        flexDirection: 'row',
        gap: 8,
        paddingRight: 20,
    },
    moodChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 20,
        borderWidth: 1,
    },
    moodChipSelected: {
        borderWidth: 1.5,
    },
    moodDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    moodChipText: {
        fontSize: 13,
    },
    // Destination
    destinationRow: {
        flexDirection: 'row',
        gap: 10,
    },
    destButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
    },
    destButtonText: {
        fontSize: 13,
        fontWeight: '500',
    },
    topicPicker: {
        marginTop: 4,
    },
    topicRow: {
        flexDirection: 'row',
        gap: 8,
        paddingRight: 20,
    },
    topicChip: {
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 20,
        borderWidth: 1,
    },
    topicChipText: {
        fontSize: 13,
    },
    noTopics: {
        fontSize: 13,
        fontStyle: 'italic',
    },
    // Note input
    noteInput: {
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 14,
        lineHeight: 20,
        minHeight: 80,
        textAlignVertical: 'top',
    },
    // Toggle row
    toggleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    toggleTextArea: {
        flex: 1,
    },
    toggleLabel: {
        fontSize: 14,
        fontWeight: '500',
    },
    toggleSub: {
        fontSize: 12,
        marginTop: 2,
    },
    // Error
    errorText: {
        fontSize: 13,
        textAlign: 'center',
    },
    // Save button
    saveButton: {
        borderRadius: 14,
        paddingVertical: 15,
        alignItems: 'center',
        marginTop: 4,
    },
    saveButtonText: {
        fontSize: 15,
        fontWeight: '700',
    },
});

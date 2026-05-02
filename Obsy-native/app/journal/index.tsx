import React, { useEffect, useMemo, useRef, useState } from 'react';
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from 'react-native-reanimated';
import {
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Switch,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { MoodSelectionModal } from '@/components/capture/MoodSelectionModal';
import { LinedJournalInput } from '@/components/capture/LinedJournalInput';
import { ThemedText } from '@/components/ui/ThemedText';
import Colors from '@/constants/Colors';
import { MOODS } from '@/constants/Moods';
import { useAuth } from '@/contexts/AuthContext';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { useCaptureStore } from '@/lib/captureStore';
import { useCustomMoodStore } from '@/lib/customMoodStore';
import { useAiFreeMode } from '@/hooks/useAiFreeMode';

const SERIF_FONT = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

const GENTLE_PROMPTS = [
    'One small thing from today…',
    'What is asking for attention?',
    'Describe this feeling in three words.',
    'A moment you want to remember.',
    'What would you say to yourself right now?',
];

export default function JournalEntryScreen() {
    const router = useRouter();
    const { topicId, topicTitle } = useLocalSearchParams<{ topicId?: string; topicTitle?: string }>();
    const isTopicEntry = !!topicId;

    const { createJournalEntry } = useCaptureStore();
    const { user } = useAuth();
    const { getMoodById } = useCustomMoodStore();
    const { colors, isLight } = useObsyTheme();
    const { aiFreeMode } = useAiFreeMode();

    const inputRef = useRef<TextInput>(null);

    const [moodId, setMoodId] = useState<string | null>(null);
    const [moodName, setMoodName] = useState('');
    const [note, setNote] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [moodModalVisible, setMoodModalVisible] = useState(false);
    const [includeInInsights, setIncludeInInsights] = useState(true);
    const [menuVisible, setMenuVisible] = useState(false);
    const [promptsVisible, setPromptsVisible] = useState(false);

    const pulse = useSharedValue(0);

    useEffect(() => {
        pulse.value = withRepeat(
            withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.ease) }),
            -1,
            true
        );
    }, [pulse]);

    const pulseStyle = useAnimatedStyle(() => ({
        opacity: 0.6 + pulse.value * 0.4,
    }));

    const { dayName, dateLine } = useMemo(() => {
        const d = new Date();
        const day = d.toLocaleDateString('en-US', { weekday: 'long' });
        const date = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
        const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        return { dayName: day, dateLine: `${date} · ${time}`.toUpperCase() };
    }, []);

    const words = useMemo(() => (note.trim() ? note.trim().split(/\s+/).length : 0), [note]);
    const readTime = Math.max(1, Math.ceil(words / 200));

    const onSurfacePrimary = isLight ? 'rgba(44,24,16,0.96)' : 'rgba(255,255,255,0.96)';
    const onSurfaceSecondary = isLight ? 'rgba(44,24,16,0.55)' : 'rgba(255,255,255,0.45)';
    const onSurfaceMuted = isLight ? 'rgba(44,24,16,0.74)' : 'rgba(255,255,255,0.75)';
    const subtleText = isLight ? 'rgba(44,24,16,0.4)' : 'rgba(255,255,255,0.4)';
    const chipBackground = isLight ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.08)';
    const chipBorder = isLight ? 'rgba(44,24,16,0.12)' : 'rgba(255,255,255,0.14)';
    const promptButtonBg = isLight ? 'rgba(255,255,255,0.52)' : 'rgba(255,255,255,0.05)';
    const sheetBackground = isLight ? 'rgba(248,240,228,0.96)' : 'rgba(20,18,16,0.95)';
    const sheetBorder = isLight ? 'rgba(44,24,16,0.12)' : 'rgba(255,255,255,0.12)';
    const publishDisabledBg = isLight ? 'rgba(44,24,16,0.08)' : 'rgba(255,255,255,0.08)';

    const handleMoodSelect = (id: string) => {
        const mood = getMoodById(id);
        setMoodId(id);
        setMoodName(mood?.name || MOODS.find((m) => m.id === id)?.label || id);
    };

    const handleSave = async () => {
        if (!moodId || isSaving) return;
        setIsSaving(true);

        try {
            const entryTags = isTopicEntry ? [`topic:${topicId}`] : [];
            await createJournalEntry(
                user,
                moodId,
                moodName,
                note,
                entryTags,
                isTopicEntry ? false : includeInInsights && !aiFreeMode
            );
            router.dismissAll();
            setTimeout(() => router.replace('/(tabs)'), 100);
        } catch (err) {
            console.error('[JournalEntry] Save failed:', err);
            setIsSaving(false);
        }
    };

    const handleOpenMoodModal = () => {
        inputRef.current?.blur();
        setTimeout(() => setMoodModalVisible(true), 80);
    };

    const applyPrompt = (prompt: string) => {
        setPromptsVisible(false);
        setNote((prev) => (prev.trim() ? `${prev}\n\n${prompt} ` : `${prompt} `));
        setTimeout(() => inputRef.current?.focus(), 120);
    };

    const canPublish = !!moodId && note.trim().length > 0 && !isSaving;
    const blurTint = isLight ? 'light' : 'dark';

    return (
        <ScreenWrapper>
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, pulseStyle]}>
                <LinearGradient
                    colors={['rgba(96,165,250,0.14)', 'rgba(60,100,180,0.05)', 'transparent']}
                    locations={[0, 0.5, 1]}
                    start={{ x: 0.3, y: 0.2 }}
                    end={{ x: 0.9, y: 0.9 }}
                    style={StyleSheet.absoluteFill}
                />
            </Animated.View>

            <LinearGradient
                pointerEvents="none"
                colors={[
                    'rgba(218,180,130,0.04)',
                    'rgba(218,180,130,0.06)',
                    'rgba(180,140,100,0.03)',
                ]}
                locations={[0, 0.4, 1]}
                style={StyleSheet.absoluteFill}
            />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.flex}
                keyboardVerticalOffset={0}
            >
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.headerIcon}>
                        <Ionicons name="chevron-back" size={26} color={onSurfacePrimary} />
                    </TouchableOpacity>

                    <View style={styles.headerTitleBlock}>
                        <ThemedText style={[styles.headerDay, { color: onSurfacePrimary }]}>
                            {dayName}
                        </ThemedText>
                        {isTopicEntry && topicTitle ? (
                            <View style={[styles.topicBadge, { backgroundColor: chipBackground, borderColor: chipBorder }]}>
                                <ThemedText style={[styles.topicBadgeText, { color: onSurfaceSecondary }]}>
                                    {topicTitle}
                                </ThemedText>
                            </View>
                        ) : (
                            <ThemedText style={[styles.headerDate, { color: onSurfaceSecondary }]}>
                                {dateLine}
                            </ThemedText>
                        )}
                    </View>

                    <TouchableOpacity
                        onPress={() => setMenuVisible(true)}
                        style={styles.headerIcon}
                    >
                        <Ionicons name="ellipsis-horizontal" size={22} color={onSurfacePrimary} />
                    </TouchableOpacity>
                </View>

                <View style={styles.moodRow}>
                    <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={handleOpenMoodModal}
                        style={[
                            styles.moodTrigger,
                            { backgroundColor: chipBackground, borderColor: chipBorder },
                            moodId && styles.moodTriggerSelected,
                        ]}
                    >
                        {moodId ? (
                            <>
                                <ThemedText style={styles.moodTriggerText}>{moodName}</ThemedText>
                                <Ionicons name="chevron-down" size={14} color="rgba(0,0,0,0.6)" />
                            </>
                        ) : (
                            <>
                                <Ionicons name="add" size={16} color={onSurfaceMuted} />
                                <ThemedText
                                    style={[
                                        styles.moodTriggerPlaceholder,
                                        { color: onSurfaceMuted },
                                    ]}
                                >
                                    How are you feeling?
                                </ThemedText>
                            </>
                        )}
                    </TouchableOpacity>
                </View>

                <View style={[styles.divider, { backgroundColor: colors.cardBorder }]} />

                <LinedJournalInput
                    ref={inputRef}
                    value={note}
                    onChangeText={setNote}
                    autoFocus={false}
                />

                <View style={[styles.bottomArea, { borderTopColor: colors.cardBorder }]}>
                    <View style={styles.metaRow}>
                        <ThemedText style={[styles.metaText, { color: subtleText }]}>
                            {words} {words === 1 ? 'word' : 'words'} · {readTime} min read
                        </ThemedText>
                        <TouchableOpacity
                            onPress={() => setPromptsVisible(true)}
                            style={[styles.promptsButton, { backgroundColor: promptButtonBg }]}
                        >
                            <ThemedText style={[styles.promptsButtonText, { color: onSurfaceMuted }]}>
                                Prompts
                            </ThemedText>
                        </TouchableOpacity>
                    </View>

                    {!isTopicEntry && <View style={[styles.includeRow, aiFreeMode && styles.includeRowDisabled]}>
                        <View style={styles.includeLabelBlock}>
                            <ThemedText style={[styles.includeLabel, { color: onSurfacePrimary }]}>
                                Include in insights
                            </ThemedText>
                            <ThemedText style={[styles.includeHelper, { color: subtleText }]}>
                                Use this entry in weekly recaps
                            </ThemedText>
                        </View>
                        <Switch
                            value={includeInInsights && !aiFreeMode}
                            disabled={aiFreeMode}
                            onValueChange={setIncludeInInsights}
                            trackColor={{
                                false: isLight ? 'rgba(44,24,16,0.15)' : 'rgba(255,255,255,0.2)',
                                true: Colors.obsy.silver,
                            }}
                            thumbColor="#fff"
                        />
                    </View>}

                    <TouchableOpacity
                        onPress={handleSave}
                        disabled={!canPublish}
                        activeOpacity={0.85}
                        style={[
                            styles.publishButton,
                            { backgroundColor: canPublish ? '#FFFFFF' : publishDisabledBg },
                            !canPublish && styles.publishButtonDisabled,
                        ]}
                    >
                        <ThemedText
                            style={[
                                styles.publishText,
                                !canPublish && {
                                    color: isLight ? 'rgba(44,24,16,0.28)' : 'rgba(255,255,255,0.3)',
                                },
                            ]}
                        >
                            {isSaving ? 'Publishing…' : 'Publish entry'}
                        </ThemedText>
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>

            <MoodSelectionModal
                visible={moodModalVisible}
                selectedMood={moodId}
                onSelect={handleMoodSelect}
                onClose={() => setMoodModalVisible(false)}
            />

            <Modal
                visible={menuVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setMenuVisible(false)}
            >
                <Pressable style={styles.menuBackdrop} onPress={() => setMenuVisible(false)}>
                    <BlurView intensity={30} tint={blurTint} style={StyleSheet.absoluteFill} />
                    <View style={[styles.menuSheet, { backgroundColor: sheetBackground, borderColor: sheetBorder }]}>
                        <TouchableOpacity
                            style={styles.menuItem}
                            onPress={() => {
                                setMenuVisible(false);
                                setPromptsVisible(true);
                            }}
                        >
                            <Ionicons name="bulb-outline" size={18} color={onSurfaceMuted} />
                            <ThemedText style={[styles.menuItemText, { color: onSurfacePrimary }]}>
                                Writing prompts
                            </ThemedText>
                        </TouchableOpacity>
                        <View style={[styles.menuDivider, { backgroundColor: sheetBorder }]} />
                        <TouchableOpacity
                            style={styles.menuItem}
                            onPress={() => {
                                setMenuVisible(false);
                                setNote('');
                                setMoodId(null);
                                setMoodName('');
                            }}
                        >
                            <Ionicons name="trash-outline" size={18} color="rgba(255,120,120,0.9)" />
                            <ThemedText style={[styles.menuItemText, styles.discardText]}>
                                Discard entry
                            </ThemedText>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Modal>

            <Modal
                visible={promptsVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setPromptsVisible(false)}
            >
                <Pressable style={styles.menuBackdrop} onPress={() => setPromptsVisible(false)}>
                    <BlurView intensity={30} tint={blurTint} style={StyleSheet.absoluteFill} />
                    <Pressable
                        style={[
                            styles.promptsSheet,
                            { backgroundColor: sheetBackground, borderColor: sheetBorder },
                        ]}
                        onPress={() => {}}
                    >
                        <ThemedText style={[styles.promptsHeading, { color: subtleText }]}>
                            Gentle prompts
                        </ThemedText>
                        {GENTLE_PROMPTS.map((prompt) => (
                            <TouchableOpacity
                                key={prompt}
                                style={styles.promptRow}
                                onPress={() => applyPrompt(prompt)}
                            >
                                <ThemedText style={[styles.promptText, { color: onSurfacePrimary }]}>
                                    {prompt}
                                </ThemedText>
                            </TouchableOpacity>
                        ))}
                    </Pressable>
                </Pressable>
            </Modal>
        </ScreenWrapper>
    );
}

const styles = StyleSheet.create({
    flex: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingTop: 8,
        paddingBottom: 10,
    },
    headerIcon: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitleBlock: {
        flex: 1,
        alignItems: 'center',
        paddingTop: 4,
    },
    topicBadge: {
        marginTop: 5,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        borderWidth: StyleSheet.hairlineWidth,
    },
    topicBadgeText: {
        fontSize: 12,
        fontWeight: '500',
        letterSpacing: 0.1,
    },
    headerDay: {
        fontFamily: SERIF_FONT,
        fontSize: 20,
        fontWeight: '500',
        letterSpacing: 0.2,
    },
    headerDate: {
        fontSize: 11,
        fontWeight: '500',
        letterSpacing: 1.4,
        marginTop: 3,
    },
    moodRow: {
        paddingHorizontal: 20,
        paddingTop: 2,
        paddingBottom: 14,
        flexDirection: 'row',
        alignItems: 'center',
    },
    moodTrigger: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 100,
        borderWidth: StyleSheet.hairlineWidth,
    },
    moodTriggerSelected: {
        backgroundColor: '#FFFFFF',
        borderColor: 'transparent',
    },
    moodTriggerText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#000',
    },
    moodTriggerPlaceholder: {
        fontSize: 13,
        fontWeight: '500',
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        marginHorizontal: 20,
    },
    bottomArea: {
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 24,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    metaText: {
        fontSize: 11,
        letterSpacing: 0.8,
    },
    promptsButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    promptsButtonText: {
        fontSize: 12,
        fontWeight: '500',
    },
    includeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 4,
        paddingBottom: 14,
    },
    includeRowDisabled: {
        opacity: 0.45,
    },
    includeLabelBlock: {
        flex: 1,
    },
    includeLabel: {
        fontSize: 13,
        fontWeight: '500',
    },
    includeHelper: {
        fontSize: 11,
        marginTop: 2,
    },
    publishButton: {
        height: 54,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#FFFFFF',
        shadowOpacity: 0.18,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 6,
    },
    publishButtonDisabled: {
        shadowOpacity: 0,
        elevation: 0,
    },
    publishText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#050608',
        letterSpacing: 0.2,
    },
    menuBackdrop: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    menuSheet: {
        margin: 12,
        marginBottom: 34,
        borderRadius: 14,
        overflow: 'hidden',
        borderWidth: StyleSheet.hairlineWidth,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    menuItemText: {
        fontSize: 15,
    },
    discardText: {
        color: 'rgba(255,120,120,0.95)',
    },
    menuDivider: {
        height: StyleSheet.hairlineWidth,
    },
    promptsSheet: {
        margin: 12,
        marginBottom: 34,
        padding: 14,
        borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth,
    },
    promptsHeading: {
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 1.4,
        marginBottom: 8,
        marginLeft: 6,
    },
    promptRow: {
        paddingHorizontal: 10,
        paddingVertical: 10,
        borderRadius: 8,
    },
    promptText: {
        fontSize: 14,
        fontFamily: SERIF_FONT,
        fontStyle: 'italic',
    },
});

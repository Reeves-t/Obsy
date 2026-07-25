/**
 * Reflection flow — the second half of the share-sheet capture.
 *
 * Pages one at a time through shared links the user saved but has not given a
 * mood to. By the time they get here the background digest has usually landed,
 * so the prompt can name what the thing actually was ("You saved a TikTok about
 * burnout — what made you stop?"). That is a far easier blank to fill than an
 * empty note field at capture time, which is exactly why the mood was deferred.
 *
 * Skip advances without reflecting; the entry stays in the inbox. Nothing here
 * is destructive and nothing is mandatory.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    ScrollView,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ThemedText } from '@/components/ui/ThemedText';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { useCaptureStore } from '@/lib/captureStore';
import { useCustomMoodStore } from '@/lib/customMoodStore';
import { MoodSelectionModal } from '@/components/capture/MoodSelectionModal';
import { StaticLinkPreview } from '@/components/entries/StaticLinkPreview';
import { MOODS } from '@/constants/Moods';
import { moodCache } from '@/lib/moodCache';
import { isUnreflected } from '@/types/capture';
import { detectPlatform, type SharedLinkPlatform } from '@/services/sharedLinkService';

/** Builds the prompt line, leaning on the digest when we have one. */
function buildPrompt(platform: string, digest: string | null | undefined): string {
    if (digest && digest.trim()) {
        // The digest already says what it was; ask the part only they can answer.
        return 'What made you stop on this?';
    }
    return `What made you save this ${platform === 'Web' ? 'link' : platform}?`;
}

export default function ReflectScreen() {
    const router = useRouter();
    const { colors, isLight } = useObsyTheme();
    const { captures, reflectSharedLink } = useCaptureStore();
    const { getMoodById } = useCustomMoodStore();

    // Oldest first: clear the backlog in the order it accumulated.
    const pending = useMemo(
        () => captures
            .filter(isUnreflected)
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
        [captures],
    );

    const [index, setIndex] = useState(0);
    const [note, setNote] = useState('');
    const [moodModalVisible, setMoodModalVisible] = useState(false);
    const [saving, setSaving] = useState(false);

    // Saving removes the entry from `pending`, so the list shrinks under the
    // current index. Clamping here means a stale index can never render the
    // "nothing left" state while entries remain.
    const safeIndex = Math.min(index, Math.max(0, pending.length - 1));
    const current = pending[safeIndex];

    // After a save the entry leaves `pending`, so the next one slides into this
    // index on its own — only the note has to be cleared. An explicit skip is
    // the one case that steps the index forward.
    const clearDraft = useCallback(() => setNote(''), []);

    const handleSkip = useCallback(() => {
        setNote('');
        if (safeIndex >= pending.length - 1) router.back();
        else setIndex(safeIndex + 1);
    }, [safeIndex, pending.length, router]);

    const handleSelectMood = useCallback(async (moodId: string) => {
        setMoodModalVisible(false);
        if (!current || saving) return;

        const moodName = getMoodById(moodId)?.name
            ?? MOODS.find(m => m.id === moodId)?.label
            ?? moodCache.getAllMoods().find(m => m.id === moodId)?.name
            ?? moodId;

        setSaving(true);
        try {
            await reflectSharedLink(current.id, moodId, moodName, note.trim() || null, null);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            if (pending.length <= 1) router.back();
            else clearDraft();
        } catch {
            // Leave the entry pending; the user can retry from the inbox.
        } finally {
            setSaving(false);
        }
    }, [current, saving, getMoodById, note, reflectSharedLink, pending.length, router, clearDraft]);

    if (!current) {
        return (
            <ScreenWrapper>
                <View style={styles.centered}>
                    <Ionicons name="checkmark-circle-outline" size={36} color={colors.textTertiary} />
                    <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
                        Nothing left to reflect on.
                    </ThemedText>
                    <TouchableOpacity
                        onPress={() => router.back()}
                        style={[styles.secondaryButton, { borderColor: colors.cardBorder }]}
                    >
                        <ThemedText style={{ color: colors.text }}>Done</ThemedText>
                    </TouchableOpacity>
                </View>
            </ScreenWrapper>
        );
    }

    const url = current.shared_link_url ?? '';
    const savedPlatform = (current.shared_link_platform ?? 'Web') as SharedLinkPlatform;
    const platform = savedPlatform === 'Web' && url ? detectPlatform(url) : savedPlatform;

    return (
        <ScreenWrapper>
            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
                    <View style={styles.header}>
                        <ThemedText style={[styles.counter, { color: colors.textSecondary }]}>
                            {safeIndex + 1} of {pending.length}
                        </ThemedText>
                        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
                            <Ionicons name="close" size={22} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    <StaticLinkPreview
                        url={url}
                        platform={platform}
                        title={current.shared_link_title ?? null}
                        thumbnailUrl={current.shared_link_thumbnail_url ?? null}
                        thumbnailPath={current.shared_link_thumbnail_path ?? null}
                        text={current.shared_link_text ?? null}
                        author={current.shared_link_author ?? null}
                        mediaType={current.shared_link_media_type ?? null}
                        isLight={isLight}
                    />

                    {current.shared_link_digest?.trim() ? (
                        <ThemedText style={[styles.digest, { color: colors.textSecondary }]}>
                            {current.shared_link_digest}
                        </ThemedText>
                    ) : null}

                    <ThemedText style={[styles.prompt, { color: colors.text }]}>
                        {buildPrompt(platform, current.shared_link_digest)}
                    </ThemedText>

                    <TextInput
                        value={note}
                        onChangeText={setNote}
                        placeholder="Optional — a line for future you"
                        placeholderTextColor={colors.textTertiary}
                        multiline
                        style={[
                            styles.noteInput,
                            {
                                color: colors.text,
                                borderColor: colors.cardBorder,
                                backgroundColor: colors.cardBackground,
                            },
                        ]}
                    />

                    <TouchableOpacity
                        onPress={() => setMoodModalVisible(true)}
                        disabled={saving}
                        style={[styles.primaryButton, { backgroundColor: colors.text }]}
                    >
                        {saving ? (
                            <ActivityIndicator color={colors.background} />
                        ) : (
                            <ThemedText style={[styles.primaryLabel, { color: colors.background }]}>
                                Pick how it felt
                            </ThemedText>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity onPress={handleSkip} disabled={saving} style={styles.skipButton}>
                        <ThemedText style={[styles.skipLabel, { color: colors.textTertiary }]}>
                            Skip for now
                        </ThemedText>
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>

            <MoodSelectionModal
                visible={moodModalVisible}
                selectedMood={null}
                onSelect={handleSelectMood}
                onClose={() => setMoodModalVisible(false)}
            />
        </ScreenWrapper>
    );
}

const styles = StyleSheet.create({
    flex: { flex: 1 },
    container: {
        padding: 20,
        gap: 16,
    },
    centered: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        padding: 24,
    },
    emptyText: {
        fontSize: 14,
        textAlign: 'center',
    },
    secondaryButton: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    counter: {
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 0.4,
    },
    digest: {
        fontSize: 13,
        lineHeight: 19,
    },
    prompt: {
        fontSize: 18,
        fontWeight: '600',
        lineHeight: 24,
    },
    noteInput: {
        minHeight: 88,
        borderRadius: 14,
        borderWidth: 1,
        padding: 12,
        fontSize: 14,
        textAlignVertical: 'top',
    },
    primaryButton: {
        height: 52,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    primaryLabel: {
        fontSize: 16,
        fontWeight: '700',
    },
    skipButton: {
        alignItems: 'center',
        paddingVertical: 10,
    },
    skipLabel: {
        fontSize: 13,
    },
});

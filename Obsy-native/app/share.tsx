/**
 * QuickSaveSheet — the two-second capture.
 *
 * Reached from the OS share sheet: the user shares a link from TikTok, opens
 * straight into this sheet, taps Save, and swipes back to what they were doing.
 * Nothing is required beyond that one tap — no mood, no topic. Those belong to
 * the inbox, because asking for a feeling mid-scroll is what stops the save
 * from happening at all.
 *
 * The one-line note is the deliberate exception: a single row, optional, that
 * submits straight to the save. It catches the thought that would be gone by
 * the time the user opens Obsy again. Anything longer is a reflection, and
 * reflection is a different moment.
 *
 * Everything shown here is parsed from the URL locally, so the sheet paints
 * instantly with no network round trip. The real title, thumbnail and digest
 * arrive in the background from `digest-shared-link` after the save.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    ScrollView,
    TextInput,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ThemedText } from '@/components/ui/ThemedText';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCaptureStore } from '@/lib/captureStore';
import {
    parseSharedLinkMetadata,
    platformToColor,
    platformToGradient,
    isValidShareUrl,
    type SharedLinkPlatform,
} from '@/services/sharedLinkService';
import { LinearGradient } from 'expo-linear-gradient';

/** A link saved again within this window is treated as a duplicate, not a new save. */
const DEDUPE_WINDOW_MS = 60 * 60 * 1000;

type SaveState = 'idle' | 'saving' | 'saved' | 'duplicate' | 'error';

export default function QuickSaveScreen() {
    const router = useRouter();
    const { colors, isLight } = useObsyTheme();
    const { user } = useAuth();
    const { createSharedLinkEntry, captures } = useCaptureStore();

    const params = useLocalSearchParams<{ url?: string; title?: string }>();
    const rawUrl = typeof params.url === 'string' ? params.url : '';
    const sharedTitle = typeof params.title === 'string' ? params.title : '';

    const [state, setState] = useState<SaveState>('idle');
    const [note, setNote] = useState('');

    const meta = useMemo(() => {
        if (!rawUrl) return null;
        return parseSharedLinkMetadata(rawUrl);
    }, [rawUrl]);

    const platform = (meta?.platform ?? 'Web') as SharedLinkPlatform;
    const platformColor = platformToColor(platform);
    const gradient = useMemo(() => platformToGradient(platform), [platform]);

    // The sharing app's own title beats a slug guessed from the URL path.
    const displayTitle = sharedTitle.trim() || meta?.title || meta?.domain || 'Link';

    const recentDuplicate = useMemo(() => {
        if (!meta?.url) return false;
        const cutoff = Date.now() - DEDUPE_WINDOW_MS;
        return captures.some(c =>
            c.shared_link_url === meta.url &&
            new Date(c.created_at).getTime() > cutoff
        );
    }, [captures, meta?.url]);

    const dismiss = useCallback(() => {
        // back() returns the user to whatever they were on; a share-sheet launch
        // has nothing behind it, so fall back to Today.
        if (router.canGoBack()) router.back();
        else router.replace('/(tabs)');
    }, [router]);

    const handleSave = useCallback(async () => {
        if (!meta?.url || state === 'saving') return;

        if (recentDuplicate) {
            setState('duplicate');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
            setTimeout(dismiss, 1100);
            return;
        }

        setState('saving');
        try {
            await createSharedLinkEntry(
                user,
                null,              // no mood — this is the whole point of the flow
                null,
                meta.url,
                meta.platform,
                displayTitle,
                null,              // thumbnail arrives with the background digest
                note.trim() || null,
                true,
            );
            setState('saved');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            setTimeout(dismiss, 850);
        } catch {
            setState('error');
        }
    }, [
        meta, state, recentDuplicate, dismiss, createSharedLinkEntry,
        user, displayTitle, note,
    ]);

    // ── Bad or missing payload ─────────────────────────────────────────
    if (!meta?.url || !isValidShareUrl(meta.url)) {
        return (
            <ScreenWrapper>
                <View style={styles.centered}>
                    <Ionicons name="link-outline" size={32} color={colors.textTertiary} />
                    <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
                        That didn’t include a link Obsy can save.
                    </ThemedText>
                    <TouchableOpacity onPress={dismiss} style={[styles.secondaryButton, { borderColor: colors.cardBorder }]}>
                        <ThemedText style={{ color: colors.text }}>Close</ThemedText>
                    </TouchableOpacity>
                </View>
            </ScreenWrapper>
        );
    }

    const saved = state === 'saved';
    const duplicate = state === 'duplicate';

    return (
        <ScreenWrapper>
            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
            <ScrollView
                contentContainerStyle={styles.container}
                keyboardShouldPersistTaps="handled"
            >
                <View style={styles.header}>
                    <ThemedText style={[styles.headerTitle, { color: colors.text }]}>
                        Save to Obsy
                    </ThemedText>
                    <TouchableOpacity onPress={dismiss} hitSlop={12}>
                        <Ionicons name="close" size={22} color={colors.textSecondary} />
                    </TouchableOpacity>
                </View>

                {/* Link identity — parsed locally so this paints with no network wait. */}
                <LinearGradient
                    colors={gradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.linkCard}
                >
                    <View style={styles.chip}>
                        <ThemedText style={styles.chipText}>{platform}</ThemedText>
                    </View>
                    <ThemedText numberOfLines={3} style={styles.linkTitle}>
                        {displayTitle}
                    </ThemedText>
                    <ThemedText numberOfLines={1} style={styles.linkDomain}>
                        {meta.domain}
                    </ThemedText>
                </LinearGradient>

                {/* A single line, capped to one row, submitting straight to the
                    save. Anything longer belongs to the reflection step — this
                    is for the thought that would otherwise be lost by then. */}
                {!saved && !duplicate && (
                    <TextInput
                        value={note}
                        onChangeText={setNote}
                        placeholder="Add a line? (optional)"
                        placeholderTextColor={colors.textTertiary}
                        returnKeyType="done"
                        maxLength={140}
                        onSubmitEditing={handleSave}
                        style={[
                            styles.noteInput,
                            {
                                color: colors.text,
                                borderColor: colors.cardBorder,
                                backgroundColor: colors.cardBackground,
                            },
                        ]}
                    />
                )}

                {/* The one action. Everything else on this screen is optional. */}
                <TouchableOpacity
                    onPress={handleSave}
                    disabled={state === 'saving' || saved || duplicate}
                    style={[
                        styles.saveButton,
                        { backgroundColor: saved || duplicate ? 'transparent' : platformColor },
                        (saved || duplicate) && { borderWidth: 1, borderColor: colors.cardBorder },
                    ]}
                >
                    {state === 'saving' ? (
                        <ActivityIndicator color="#fff" />
                    ) : saved ? (
                        <View style={styles.savedRow}>
                            <Ionicons name="checkmark-circle" size={20} color={colors.text} />
                            <ThemedText style={[styles.saveLabel, { color: colors.text }]}>
                                Saved — reflect later in Today
                            </ThemedText>
                        </View>
                    ) : duplicate ? (
                        <View style={styles.savedRow}>
                            <Ionicons name="information-circle-outline" size={20} color={colors.text} />
                            <ThemedText style={[styles.saveLabel, { color: colors.text }]}>
                                Already saved
                            </ThemedText>
                        </View>
                    ) : (
                        <ThemedText style={styles.saveLabelPrimary}>Save</ThemedText>
                    )}
                </TouchableOpacity>

                {state === 'error' && (
                    <ThemedText style={[styles.errorText, { color: '#ff4444' }]}>
                        Couldn’t save that just now. Try again?
                    </ThemedText>
                )}

                {!saved && !duplicate && (
                    <ThemedText style={[styles.hint, { color: colors.textTertiary }]}>
                        Add how it made you feel later — Obsy will remind you.
                    </ThemedText>
                )}
            </ScrollView>
            </KeyboardAvoidingView>
        </ScreenWrapper>
    );
}

const styles = StyleSheet.create({
    flex: { flex: 1 },
    container: {
        padding: 20,
        gap: 18,
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
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
    },
    linkCard: {
        borderRadius: 16,
        padding: 16,
        gap: 8,
        minHeight: 120,
        justifyContent: 'center',
    },
    chip: {
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 10,
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
    chipText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.4,
        textTransform: 'uppercase',
    },
    linkTitle: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        lineHeight: 21,
    },
    linkDomain: {
        color: 'rgba(255,255,255,0.75)',
        fontSize: 12,
    },
    noteInput: {
        height: 44,
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: 12,
        fontSize: 14,
    },
    saveButton: {
        height: 54,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    saveLabelPrimary: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
    saveLabel: {
        fontSize: 14,
        fontWeight: '600',
    },
    savedRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    errorText: {
        fontSize: 13,
        textAlign: 'center',
    },
    hint: {
        fontSize: 12,
        textAlign: 'center',
    },
});

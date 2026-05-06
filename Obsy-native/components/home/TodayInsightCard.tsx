import React, { useEffect } from 'react';
import { StyleSheet, View, TouchableOpacity, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { format } from 'date-fns';
import { ThemedText } from '@/components/ui/ThemedText';
import { InsightText } from '@/components/insights/InsightText';
import { useTodayInsight } from '@/lib/todayInsightStore';
import { useAuth } from '@/contexts/AuthContext';
import { useCaptureStore } from '@/lib/captureStore';
import { archiveInsightWithResult, fetchArchives, ARCHIVE_ERROR_CODES } from '@/services/archive';
import { BookmarkButton } from '@/components/insights/BookmarkButton';
import Colors from '@/constants/Colors';
import { countPendingDailyCaptures } from '@/lib/pendingCaptureUtils';
import { useI18n } from '@/i18n/config';
import { useTranslatedInsight } from '@/hooks/useTranslatedInsight';
import { getLocalDayKey } from '@/lib/utils';
import { InsightMoodOrbField } from '@/components/insights/InsightMoodOrbField';
import { InsightCardSurface } from '@/components/insights/InsightCardSurface';
import { MoodRefreshLight, type MoodLight } from '@/components/insights/MoodRefreshLight';
import { useInsightLightGate } from '@/hooks/useInsightLightGate';
import { getMoodTheme } from '@/lib/moods/theme';

interface TodayInsightCardProps {
    text: string | null;
    onRefresh?: () => void;
    onRefreshStart?: () => void;
    onRefreshEnd?: () => void;
    flat?: boolean;
    onArchiveFull?: () => void;
}

export const TodayInsightCard: React.FC<TodayInsightCardProps> = ({
    text,
    onRefresh,
    onRefreshStart,
    onRefreshEnd,
    flat = false,
    onArchiveFull,
}) => {
    const { user } = useAuth();
    const { captures } = useCaptureStore();

    const { loadSnapshot, lastUpdated, status } = useTodayInsight();
    const { t } = useI18n();

    const [isSaved, setIsSaved] = React.useState(false);
    const [saving, setSaving] = React.useState(false);


    // Count pending captures
    const pendingCount = countPendingDailyCaptures(lastUpdated, captures);

    // Preload last daily insight on mount (fast-load path)
    useEffect(() => {
        if (user && !text) {
            loadSnapshot(user.id);
        }
    }, [user?.id]);

    useEffect(() => {
        const checkSaved = async () => {
            if (!user || !text) return;
            const archives = await fetchArchives(user.id);
            const dateStr = format(new Date(), "yyyy-MM-dd");
            const saved = archives.some(a => a.type === 'daily' && a.date_scope === dateStr);
            setIsSaved(saved);
        };
        checkSaved();
    }, [user?.id, text]);

    const handleSave = async () => {
        if (!user) {
            Alert.alert("Sign In Required", "Please sign in to save insights to your archive.");
            return;
        }
        if (!text || isSaved || saving) return;

        if (onArchiveFull) {
            const archives = await fetchArchives(user.id);
            if (archives.length >= 150) {
                onArchiveFull();
                return;
            }
        }

        setSaving(true);
        onRefreshStart?.();
        try {
            const result = await archiveInsightWithResult({
                userId: user.id,
                type: 'daily',
                insightText: text,
                relatedCaptureIds: captures.map(c => c.id),
                date: new Date(),
            });

            if (result.data) {
                setIsSaved(true);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } else if (result.error) {
                const errorMessage = result.error.code === ARCHIVE_ERROR_CODES.RLS_VIOLATION
                    ? "You don't have permission to save this insight. Please try signing in again."
                    : "Failed to save daily insight. Please try again.";
                Alert.alert("Error", errorMessage);
            }
        } catch (error) {
            console.error("[TodayInsightCard] Unexpected error saving insight:", error);
            Alert.alert("Error", "An unexpected error occurred. Please try again.");
        } finally {
            setSaving(false);
            onRefreshEnd?.();
        }
    };

    const todayMoodIds = React.useMemo(() => {
        const todayKey = getLocalDayKey(new Date());
        return captures
            .filter(c => getLocalDayKey(new Date(c.created_at)) === todayKey)
            .map(c => c.mood_id)
            .filter(Boolean);
    }, [captures]);

    // Light gate: holds new text behind the mood-light retraction animation
    const isLoading = status === 'loading';
    const { displayText, lightLoading, onRetractComplete } = useInsightLightGate(isLoading, text);

    // Derive mood lights from today's captures (top 4 most frequent moods)
    const moodLights = React.useMemo((): MoodLight[] => {
        const freq = new Map<string, number>();
        for (const id of todayMoodIds) {
            freq.set(id, (freq.get(id) || 0) + 1);
        }
        return [...freq.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([id]) => {
                const theme = getMoodTheme(id);
                return {
                    primary: theme.gradient.primary,
                    mid: theme.gradient.mid,
                    secondary: theme.gradient.secondary,
                };
            });
    }, [todayMoodIds]);

    const translatedText = useTranslatedInsight({ insightId: 'daily-current', sourceText: displayText, sourceLanguage: 'en' });
    const isEmpty = !translatedText;

    return (
        <View style={styles.wrapper}>
            <MoodRefreshLight loading={lightLoading} moods={moodLights} onRetractComplete={onRetractComplete} />
            <InsightCardSurface>
                <View style={styles.header}>
                    <ThemedText type="subtitle" style={styles.title}>
                        {flat ? t('insight.dailyTitleFlat') : t('insight.dailyTitle')}
                    </ThemedText>
                    {onRefresh && (
                        <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
                            <ThemedText style={styles.refreshText}>{t('common.refresh')}</ThemedText>
                        </TouchableOpacity>
                    )}
                </View>

                <View style={styles.divider} />

                {/* Pending captures message */}
                {!isEmpty && pendingCount > 0 && (
                    <View style={styles.pendingMessageContainer}>
                        <ThemedText style={styles.pendingMessage}>
                            {t(pendingCount === 1 ? 'insight.pendingCaptureOne' : 'insight.pendingCaptureOther', { count: pendingCount })}
                        </ThemedText>
                    </View>
                )}

                <View style={styles.content}>
                    {isEmpty ? (
                        <View style={styles.emptyContainer}>
                            <ThemedText style={styles.emptyText}>
                                {t('insight.emptyDaily')}
                            </ThemedText>
                            <InsightMoodOrbField moodIds={todayMoodIds} variant="focus" maxOrbs={10} />
                        </View>
                    ) : (
                        <View>
                            <InsightText
                                fallbackText={translatedText || ''}
                                collapsedSentences={4}
                                expandable={true}
                                textStyle={styles.insightText}
                            />

                            <InsightMoodOrbField moodIds={todayMoodIds} variant="subtle" maxOrbs={8} />

                            <View style={styles.footer}>
                                <ThemedText type="caption" style={styles.footerDate}>
                                    {format(new Date(), "EEEE, MMM d")}
                                </ThemedText>
                                <BookmarkButton
                                    isSaved={isSaved}
                                    onPress={handleSave}
                                    disabled={saving}
                                />
                            </View>
                        </View>
                    )}
                </View>
            </InsightCardSurface>
        </View>
    );
};

const styles = StyleSheet.create({
    wrapper: {
        width: '100%',
        overflow: 'visible' as const,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 18,
        paddingBottom: 14,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
    },
    divider: {
        height: 0.5,
        backgroundColor: 'rgba(255,255,255,0.06)',
        marginHorizontal: 16,
    },
    pendingMessageContainer: {
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 4,
    },
    pendingMessage: {
        fontSize: 13,
        color: '#38BDF8', // Dark sky blue
        fontWeight: '500',
    },
    content: {
        padding: 20,
    },
    emptyContainer: {
        paddingVertical: 30,
        alignItems: 'center',
        gap: 20,
    },
    emptyText: {
        fontSize: 15,
        lineHeight: 22,
        color: 'rgba(255,255,255,0.6)',
        textAlign: 'center',
        paddingHorizontal: 10,
    },
    insightText: {
        fontSize: 16,
        lineHeight: 25,
        color: 'rgba(255,255,255,0.85)', // Softer off-white for readability
    },
    footer: {
        marginTop: 10,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    footerDate: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    refreshButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    refreshText: {
        color: Colors.obsy.silver,
        fontSize: 14,
        fontWeight: '700',
    },
    revealButton: {
        backgroundColor: Colors.obsy.silver,
        paddingVertical: 12,
        paddingHorizontal: 30,
        borderRadius: 24,
        alignItems: 'center',
        minWidth: 180,
    },
    revealButtonText: {
        color: '#000',
        fontSize: 15,
        fontWeight: '700',
    },
    disabled: {
        opacity: 0.5,
    },
    errorCard: {
        width: '100%',
        borderRadius: 12,
        paddingVertical: 16,
        paddingHorizontal: 14,
        borderWidth: 1,
        alignItems: 'center',
        gap: 8,
    },
    errorLight: {
        backgroundColor: '#fef2f2',
        borderColor: 'rgba(185, 28, 28, 0.25)',
    },
    errorDark: {
        backgroundColor: 'rgba(185, 28, 28, 0.12)',
        borderColor: 'rgba(248, 113, 113, 0.35)',
    },
    errorTitle: {
        fontSize: 15,
        fontWeight: '700',
        textAlign: 'center',
    },
    errorMeta: {
        fontSize: 12,
        textAlign: 'center',
        opacity: 0.8,
    },
});

import React, { useEffect } from 'react';
import { StyleSheet, View, TouchableOpacity, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { format } from 'date-fns';
import { ThemedText } from '@/components/ui/ThemedText';
import { InsightText } from '@/components/insights/InsightText';
import { useAuth } from '@/contexts/AuthContext';
import { useCaptureStore } from '@/lib/captureStore';
import { archiveInsightWithResult, fetchArchives, ARCHIVE_ERROR_CODES } from '@/services/archive';
import { BookmarkButton } from '@/components/insights/BookmarkButton';
import { useObsyTheme } from '@/contexts/ThemeContext';
import Colors from '@/constants/Colors';

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
    const { isLight } = useObsyTheme();

    const [isSaved, setIsSaved] = React.useState(false);
    const [saving, setSaving] = React.useState(false);

    const flatTitleColor = isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.75)';
    const flatTextColor = isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)';
    const flatTextSecondary = isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.6)';
    const flatDateColor = isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)';

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

    const isEmpty = !text;

    return (
        <View style={[styles.container, flat && styles.flatContainer]}>
            <View style={[styles.header, flat && styles.flatHeader]}>
                <ThemedText type="subtitle" style={[styles.title, flat && { color: flatTitleColor }]}>
                    {flat ? "DAILY INSIGHT" : "Today's Insight"}
                </ThemedText>
                {onRefresh && (
                    <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
                        <ThemedText style={styles.refreshText}>Refresh</ThemedText>
                    </TouchableOpacity>
                )}
            </View>

            {!flat && <View style={styles.divider} />}

            <View style={[styles.content, flat && styles.flatContent]}>
                {isEmpty ? (
                    <View style={styles.emptyContainer}>
                        <ThemedText style={[styles.emptyText, flat && { color: flatTextSecondary }]}>
                            No entries for today yet. Capture a moment to start your day.
                        </ThemedText>
                    </View>
                ) : (
                    <View>
                        <InsightText
                            fallbackText={text}
                            collapsedSentences={4}
                            expandable={true}
                            textStyle={flat ? { color: flatTextColor } : styles.insightText}
                        />

                        <View style={styles.footer}>
                            <ThemedText type="caption" style={[styles.footerDate, flat && { color: flatDateColor }]}>
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
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        backgroundColor: '#000000', // Pure black base
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)', // Very subtle white border
        overflow: 'hidden',
    },
    flatContainer: {
        backgroundColor: 'transparent',
        borderWidth: 0,
        borderRadius: 0,
        padding: 0,
    },
    flatHeader: {
        paddingHorizontal: 0,
        paddingTop: 12,
        paddingBottom: 8,
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
    content: {
        padding: 20,
    },
    flatContent: {
        paddingHorizontal: 0,
        paddingTop: 0,
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

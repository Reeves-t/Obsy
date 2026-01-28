import React, { useState, useMemo, useCallback, useEffect, memo } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { GlassCard } from '@/components/ui/GlassCard';
import { ThemedText } from '@/components/ui/ThemedText';
import Colors from '@/constants/Colors';
import { Capture } from '@/lib/captureStore';
import { AiSettings } from '@/services/secureAI';
import {
    getJournalEntries,
    generateJournalDailyInsight,
    generateJournalWeeklyInsight,
    generateJournalMonthlyInsight,
    fetchCachedJournalInsight,
} from '@/services/journalInsights';

type JournalInsightScope = 'daily' | 'weekly' | 'monthly';

interface JournalInsightsProps {
    userId: string | undefined;
    captures: Capture[];
    settings: AiSettings;
}

export const JournalInsights = memo(function JournalInsights({ userId, captures, settings }: JournalInsightsProps) {
    const [selectedScope, setSelectedScope] = useState<JournalInsightScope>('daily');
    const [insight, setInsight] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [lastGenerated, setLastGenerated] = useState<Date | null>(null);

    // Check if user has any journal entries
    const journalEntries = useMemo(() => getJournalEntries(captures), [captures]);
    const hasJournalEntries = journalEntries.length > 0;

    // Get date scope label based on selected scope
    const dateScopeLabel = useMemo(() => {
        const now = new Date();
        switch (selectedScope) {
            case 'daily':
                return format(now, 'MMMM d, yyyy');
            case 'weekly':
                const weekStart = startOfWeek(now, { weekStartsOn: 0 });
                const weekEnd = endOfWeek(now, { weekStartsOn: 0 });
                return `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d')}`;
            case 'monthly':
                return format(now, 'MMMM yyyy');
        }
    }, [selectedScope]);

    // Get date scope key for caching
    const getDateScopeKey = useCallback((scope: JournalInsightScope) => {
        const now = new Date();
        switch (scope) {
            case 'daily':
                return format(now, 'yyyy-MM-dd');
            case 'weekly':
                const weekStart2 = startOfWeek(now, { weekStartsOn: 0 });
                const weekEnd2 = endOfWeek(now, { weekStartsOn: 0 });
                return `${format(weekStart2, 'yyyy-MM-dd')} to ${format(weekEnd2, 'yyyy-MM-dd')}`;
            case 'monthly':
                return format(now, 'yyyy-MM');
        }
    }, []);

    // Load cached daily insight on mount
    useEffect(() => {
        const loadInitialCachedInsight = async () => {
            if (!userId) return;

            const typeKey = 'journal_daily' as const;
            const dateScopeKey = getDateScopeKey('daily');
            const cached = await fetchCachedJournalInsight(userId, typeKey, dateScopeKey);
            if (cached) {
                setInsight(cached);
            }
        };

        loadInitialCachedInsight();
    }, [userId, getDateScopeKey]);

    // Handle scope toggle
    const handleScopeChange = useCallback(async (scope: JournalInsightScope) => {
        setSelectedScope(scope);
        setInsight(null);
        setLastGenerated(null);

        if (!userId) return;

        // Try to load cached insight
        const typeKey = `journal_${scope}` as 'journal_daily' | 'journal_weekly' | 'journal_monthly';
        const dateScopeKey = getDateScopeKey(scope);
        const cached = await fetchCachedJournalInsight(userId, typeKey, dateScopeKey);
        if (cached) {
            setInsight(cached);
        }
    }, [userId, getDateScopeKey]);

    // Handle generate
    const handleGenerate = useCallback(async () => {
        if (!userId || loading) return;

        setLoading(true);
        try {
            const now = new Date();
            let result: string | null = null;

            switch (selectedScope) {
                case 'daily':
                    result = await generateJournalDailyInsight(userId, now, captures, settings);
                    break;
                case 'weekly':
                    result = await generateJournalWeeklyInsight(userId, now, captures, settings);
                    break;
                case 'monthly':
                    result = await generateJournalMonthlyInsight(userId, now, captures, settings);
                    break;
            }

            setInsight(result);
            setLastGenerated(new Date());
        } catch (error) {
            console.error('Failed to generate journal insight:', error);
        } finally {
            setLoading(false);
        }
    }, [userId, selectedScope, captures, settings, loading]);

    // Don't render if no journal entries
    if (!hasJournalEntries) {
        return null;
    }

    return (
        <GlassCard noPadding>
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.titleRow}>
                        <Ionicons name="book-outline" size={18} color={Colors.obsy.silver} />
                        <ThemedText type="defaultSemiBold" style={styles.title}>
                            Journal Insights
                        </ThemedText>
                    </View>
                    <TouchableOpacity
                        onPress={handleGenerate}
                        disabled={loading}
                        style={styles.generateButton}
                    >
                        {loading ? (
                            <ActivityIndicator size="small" color={Colors.obsy.silver} />
                        ) : (
                            <Ionicons name="refresh" size={18} color={Colors.obsy.silver} />
                        )}
                    </TouchableOpacity>
                </View>

                {/* Scope Toggle */}
                <View style={styles.toggleRow}>
                    {(['daily', 'weekly', 'monthly'] as JournalInsightScope[]).map((scope) => (
                        <TouchableOpacity
                            key={scope}
                            style={[
                                styles.toggleButton,
                                selectedScope === scope && styles.toggleButtonActive,
                            ]}
                            onPress={() => handleScopeChange(scope)}
                        >
                            <ThemedText
                                style={[
                                    styles.toggleText,
                                    selectedScope === scope && styles.toggleTextActive,
                                ]}
                            >
                                {scope.charAt(0).toUpperCase() + scope.slice(1)}
                            </ThemedText>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Date Scope Label */}
                <ThemedText style={styles.dateScopeLabel}>{dateScopeLabel}</ThemedText>

                {/* Content */}
                {loading && (
                    <ThemedText style={styles.placeholder}>
                        Generating journal insight...
                    </ThemedText>
                )}

                {!loading && !insight && (
                    <ThemedText style={styles.placeholder}>
                        Tap the refresh icon to generate an insight from your journal entries.
                    </ThemedText>
                )}

                {!loading && insight && (
                    <ThemedText style={styles.insightText}>{insight}</ThemedText>
                )}

                {lastGenerated && (
                    <ThemedText style={styles.timestamp}>
                        Generated {format(lastGenerated, 'h:mm a')}
                    </ThemedText>
                )}
            </View>
        </GlassCard>
    );
});

const styles = StyleSheet.create({
    container: {
        padding: 16,
        gap: 12,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    title: {
        color: Colors.obsy.silver,
    },
    generateButton: {
        padding: 4,
    },
    toggleRow: {
        flexDirection: 'row',
        gap: 8,
    },
    toggleButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    toggleButtonActive: {
        backgroundColor: 'rgba(168,85,247,0.25)',
        borderWidth: 1,
        borderColor: 'rgba(168,85,247,0.4)',
    },
    toggleText: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.6)',
    },
    toggleTextActive: {
        color: '#A855F7',
        fontWeight: '600',
    },
    dateScopeLabel: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.45)',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    placeholder: {
        color: 'rgba(255,255,255,0.55)',
        fontSize: 14,
        lineHeight: 20,
    },
    insightText: {
        color: 'rgba(255,255,255,0.9)',
        fontSize: 15,
        lineHeight: 24,
    },
    timestamp: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.35)',
        marginTop: 4,
    },
});

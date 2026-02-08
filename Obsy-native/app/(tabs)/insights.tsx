import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, LayoutAnimation, Platform, UIManager, InteractionManager, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    Easing,
    cancelAnimation
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Sunrise, Sun, MoonStar } from 'lucide-react-native';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { GlassCard } from '@/components/ui/GlassCard';
import { ThemedText } from '@/components/ui/ThemedText';
import { InsightText } from '@/components/insights/InsightText';
import Colors from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthContext';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { useCaptureStore } from '@/lib/captureStore';
import { ensureRecentSnapshots } from '@/lib/dailySnapshotSync';
import { generateTagInsight } from '@/lib/tagInsights';
import { buildWeeklyStatsFromDaily, buildWeeklyStatsFromCaptures, DailyInsightSnapshot, WeeklyStats } from '@/lib/insightsAnalytics';
import { getWeekRangeForUser } from '@/lib/dateUtils';
import { useWeeklyInsight } from '@/lib/weeklyInsightStore';
import { useMonthlyInsight } from '@/lib/monthlyInsightStore';
import { AiToneId, AI_TONES, DEFAULT_AI_TONE_ID } from '@/lib/aiTone';
import { resolveTonePrompt } from '@/services/secureAI';
import { fetchDailyArchives, InsightHistory } from '@/services/insightHistory';
import { getProfile, updateProfile } from '@/services/profile';
import { archiveInsight } from '@/services/archive';
import { ToneSelector } from '@/components/insights/ToneSelector';
import { MoodChart } from '@/components/insights/MoodChart';
import { MoodFlow } from '@/components/insights/MoodFlow';
import { ChronotypeDial } from '@/components/insights/ChronotypeDial';
import { WeeklySummaryCard } from '@/components/insights/WeeklySummaryCard';
import { ObjectOfWeek } from '@/components/insights/ObjectOfWeek';
import { PastInsightsStrip } from '@/components/insights/PastInsightsStrip';
import { TagReflections } from '@/components/insights/TagReflections';
import { MonthView } from '@/components/insights/MonthView';
import { ArchiveStorageIndicator } from '@/components/insights/ArchiveStorageIndicator';
import { ArchiveFullModal } from '@/components/insights/ArchiveFullModal';
import { ExportInsightsModal } from '@/components/insights/ExportInsightsModal';
import { countArchivedInsights, fetchArchives } from '@/services/archive';
import { ToneTriggerButton } from '@/components/insights/ToneTriggerButton';
import { MoodSignal } from '@/components/insights/MoodSignal';
import { useCustomTones } from '@/hooks/useCustomTones';
import { InsightErrorDisplay } from '@/components/insights/InsightErrorDisplay';

import { useInsightsStats } from '@/hooks/useInsightsStats';
import { PremiumGate } from '@/components/PremiumGate';
import { TodayInsightCard } from '@/components/home/TodayInsightCard';
import { useTodayInsight } from '@/lib/todayInsightStore';
import { DailyMoodFlowData, formatMonthKey, filterCapturesForDate, getUniqueDateKeys, formatDateKey, MoodFlowData } from '@/lib/dailyMoodFlows';
import { fetchDailyMoodFlows, backfillDailyMoodFlows, getMonthDateRange } from '@/services/dailyMoodFlows';
import { fetchMonthlySummary, computeMonthMoodTotals, generateMonthPhraseReasoning, upsertMonthlySummary, isMonthlySummaryStale, getMonthSignals } from '@/services/monthlySummaries';
import { getBannedMoodWords } from '@/lib/moodColors';
import { generateMonthPhrase } from '@/lib/monthPhraseGenerator';

// ─────────────────────────────────────────────────────────────────────────────
// Divider System
// Three-tier hierarchy for rhythm and section identity
// ─────────────────────────────────────────────────────────────────────────────

// 1. Section Header Divider (Primary) - "New chapter" feel
// Thin line ABOVE the section title with vertical breathing room
const SectionHeader: React.FC<{ title: string }> = ({ title }) => {
    const { colors, isLight } = useObsyTheme();
    return (
        <View style={styles.sectionHeaderContainer}>
            <View style={[styles.sectionDividerLine, { backgroundColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)' }]} />
            <ThemedText style={[styles.sectionTitle, { color: isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.75)' }]}>{title}</ThemedText>
        </View>
    );
};

// 2. Soft Fade Divider (Ambient) - Signature Obsy divider
// Gradient fade between major blocks, preserves floating aesthetic
const SoftFadeDivider: React.FC = () => {
    const { isLight } = useObsyTheme();
    return (
        <View style={styles.softFadeDivider}>
            <View style={[styles.softFadeGradient, { backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)' }]} />
        </View>
    );
};

// 3. Inline Micro Divider (Utility) - Inside sections
// Short, centered line for grouping without shouting
const MicroDivider: React.FC<{ width?: '40%' | '50%' | '60%' }> = ({ width = '50%' }) => {
    const { isLight } = useObsyTheme();
    return (
        <View style={styles.microDividerContainer}>
            <View style={[styles.microDividerLine, { width, backgroundColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)' }]} />
        </View>
    );
};

export default function InsightsScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const captures = useCaptureStore(s => s.captures);
    const fetchCaptures = useCaptureStore(s => s.fetchCaptures);
    const getAllTags = useCaptureStore(s => s.getAllTags);
    const capturesCount = captures.length;
    const { colors, isLight } = useObsyTheme();
    const [selectedTimeframe, setSelectedTimeframe] = useState<'week' | 'month'>('week');
    const {
        status: dailyStatus,
        text: dailyText,
        error: dailyError,
        refreshTodayInsight,
        checkMidnightReset,
    } = useTodayInsight();

    const {
        status: weeklyStatus,
        text: weeklyText,
        error: weeklyError,
        refreshWeeklyInsight,
    } = useWeeklyInsight();

    const {
        status: monthlyStatus,
        text: monthlyText,
        error: monthlyError,
        currentMonth,
        setCurrentMonth,
        refreshMonthlyInsight,
    } = useMonthlyInsight();

    const [pastInsights, setPastInsights] = useState<DailyInsightSnapshot[]>([]);
    const [pastInsightArchives, setPastInsightArchives] = useState<InsightHistory[]>([]);
    const [weeklyStats, setWeeklyStats] = useState<WeeklyStats | null>(null);
    const [selectedPastDay, setSelectedPastDay] = useState<DailyInsightSnapshot | null>(null);
    const [selectedPastInsight, setSelectedPastInsight] = useState<InsightHistory | null>(null);
    const [generatedTagInsight, setGeneratedTagInsight] = useState<string | null>(null);
    const [loadingTagInsight, setLoadingTagInsight] = useState(false);

    const [isExpanded, setIsExpanded] = useState(false);
    const [monthDailyFlows, setMonthDailyFlows] = useState<Record<string, DailyMoodFlowData>>({});
    const [todayMoodFlow, setTodayMoodFlow] = useState<MoodFlowData | null>(null);
    const [aiReasoning, setAiReasoning] = useState<string | null>(null);
    const [monthPhrase, setMonthPhrase] = useState<string | null>(null);
    const [isEligibleForInsight, setIsEligibleForInsight] = useState(false);
    const [capturedDaysCount, setCapturedDaysCount] = useState(0);
    const [isReady, setIsReady] = useState(false);

    // Archive storage state
    const [archiveCount, setArchiveCount] = useState(0);
    const [isArchiveFullModalVisible, setIsArchiveFullModalVisible] = useState(false);
    const [isExportModalVisible, setIsExportModalVisible] = useState(false);
    const ARCHIVE_LIMIT = 150;

    useEffect(() => {
        const task = InteractionManager.runAfterInteractions(() => {
            setIsReady(true);
        });
        return () => task.cancel();
    }, []);

    // Theme-aware on-background colors
    const onBgText = colors.text;
    const onBgTextSecondary = colors.textSecondary;
    const onBgTextTertiary = colors.textTertiary;

    if (Platform.OS === 'android') {
        if (UIManager.setLayoutAnimationEnabledExperimental) {
            UIManager.setLayoutAnimationEnabledExperimental(true);
        }
    }

    // Tone Selector State
    const [toneSelectorVisible, setToneSelectorVisible] = useState(false);
    const [currentTone, setCurrentTone] = useState<AiToneId>(DEFAULT_AI_TONE_ID);

    const { streak, bestStreak, activeHours, peakTimeLabel, totalEntries, mostCapturesDay, avgCapturesPerDay, morningMood, afternoonMood, eveningMood } = useInsightsStats(user?.id);
    const topTags = useMemo(() => getAllTags().slice(0, 5), [captures, getAllTags]);
    const { tones: customTones } = useCustomTones();

    const getCurrentToneName = () => {
        // 1. Check presets
        const preset = AI_TONES.find(t => t.id === currentTone);
        if (preset && preset.id !== 'neutral') {
            // Use the first part of the label if it contains a slash (e.g. "Stoic / Calm" -> "Stoic")
            return preset.label.split('/')[0].trim();
        }

        // 2. Check custom tones
        const custom = customTones.find(t => t.id === currentTone);
        if (custom) return custom.name;

        return undefined;
    };

    useEffect(() => {
        fetchCaptures(user);
    }, [user]);

    useEffect(() => {
        if (!user) return;
        loadTodayMoodFlow();
    }, [user?.id, capturesCount]);

    useEffect(() => {
        if (!user) return;
        loadTodayMoodFlow();
    }, [user?.id, capturesCount]);

    // Animation for loading state
    const rotation = useSharedValue(0);

    useEffect(() => {
        if (dailyStatus === 'loading') {
            rotation.value = withRepeat(
                withTiming(360, {
                    duration: 1000,
                    easing: Easing.linear,
                }),
                -1 // Infinite repeat
            );
        } else {
            cancelAnimation(rotation);
            rotation.value = 0;
        }
    }, [dailyStatus]);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            transform: [{ rotateZ: `${rotation.value}deg` }],
        };
    });

    useEffect(() => {
        if (!user || capturesCount === 0) return;
        ensureRecentSnapshots(user.id, captures);
        // loadInsight(); // Removed auto-load to support "Reveal" flow
        // loadWeeklyInsight(); // Removed auto-load to ensure static snapshots
        fetchInsightsData();
        loadArchiveCount();
    }, [user, capturesCount]);

    const loadArchiveCount = async () => {
        if (!user) return;
        try {
            const count = await countArchivedInsights(user.id);
            setArchiveCount(count);
        } catch (error) {
            console.error("Error loading archive count:", error);
        }
    };

    useEffect(() => {
        if (!user || captures.length === 0 || selectedTimeframe !== 'month') return;
        // loadMonthlyInsight(); // Removed auto-load to ensure static snapshots
        loadMonthDailyFlows();
    }, [user, captures.length, selectedTimeframe, currentMonth]);

    useEffect(() => {
        if (!selectedPastDay) return;
        const match = pastInsightArchives.find(a => a.start_date === selectedPastDay.date) || null;
        setSelectedPastInsight(match);
    }, [selectedPastDay, pastInsightArchives]);

    const buildAiSettings = async () => {
        const profile = await getProfile();
        if (!profile) return null;

        // Resolve actual tone ID: if ai_tone is 'custom', use the selected_custom_tone_id
        const resolvedToneId = profile.ai_tone === 'custom' && profile.selected_custom_tone_id
            ? profile.selected_custom_tone_id
            : profile.ai_tone;
        setCurrentTone(resolvedToneId);

        // Resolve the actual tone prompt text (fetches custom tone from DB if needed)
        const { resolvedTone, resolvedPrompt } = await resolveTonePrompt(
            resolvedToneId,
            profile.selected_custom_tone_id || undefined
        );

        return {
            profile,
            settings: {
                tone: resolvedTone,
                customTonePrompt: profile.selected_custom_tone_id ? resolvedPrompt : undefined,
                autoDailyInsights: profile.ai_auto_daily_insights,
                useJournalInInsights: profile.ai_use_journal_in_insights,
            }
        };
    };

    const loadInsight = async (forceRefresh = false) => {
        if (!user || captures.length === 0) return;

        try {
            const config = await buildAiSettings();
            if (!config) return;

            await refreshTodayInsight(
                config.profile.id,
                config.settings.tone,
                config.settings.customTonePrompt,
                captures
            );
        } catch (error) {
            console.error("Error loading insight:", error);
        }
    };

    const loadWeeklyInsight = async (force = false) => {
        if (!user || captures.length === 0) return;
        try {
            const config = await buildAiSettings();
            if (!config) return;
            await refreshWeeklyInsight(
                config.profile.id,
                config.settings.tone,
                config.settings.customTonePrompt,
                captures,
                undefined
            );
        } catch (error) {
            console.error("Error loading weekly insight:", error);
        }
    };

    const loadMonthlyInsight = async (force = false) => {
        if (!user || captures.length === 0) return;
        try {
            const config = await buildAiSettings();
            if (!config) return;
            await refreshMonthlyInsight(
                config.profile.id,
                config.settings.tone,
                config.settings.customTonePrompt,
                captures,
                currentMonth,
                force
            );

            // Also reload the lightweight summary and reasoning (respecting force param)
            const monthCaptures = captures.filter(c => formatMonthKey(new Date(c.created_at)) === formatMonthKey(currentMonth));
            await loadAiMonthlySummary(monthCaptures, force);
        } catch (error) {
            console.error("Error loading monthly insight:", error);
        }
    };

    const loadMonthDailyFlows = async () => {
        if (!user) return;

        try {
            const { startDate, endDate } = getMonthDateRange(currentMonth);

            // Fetch existing flows from Supabase
            const existingFlows = await fetchDailyMoodFlows(user.id, startDate, endDate);

            // Filter captures for this month
            const monthCaptures = captures.filter((c) => {
                const dateKey = c.created_at.split('T')[0];
                return dateKey >= startDate && dateKey <= endDate;
            });

            // Find missing date keys (captures exist but no flow row)
            const captureKeys = getUniqueDateKeys(monthCaptures).filter(
                (key) => key >= startDate && key <= endDate
            );
            const missingKeys = captureKeys.filter((key) => !existingFlows[key]);

            // Backfill missing flows
            if (missingKeys.length > 0) {
                await backfillDailyMoodFlows(user.id, monthCaptures, missingKeys);
                // Re-fetch to get updated data
                const updatedFlows = await fetchDailyMoodFlows(user.id, startDate, endDate);
                setMonthDailyFlows(updatedFlows);
            } else {
                setMonthDailyFlows(existingFlows);
            }

            // Load AI monthly summary
            await loadAiMonthlySummary(monthCaptures);
        } catch (error) {
            console.error("Error loading month daily flows:", error);
        }
    };

    const loadAiMonthlySummary = async (monthCaptures: typeof captures, force = false) => {
        if (!user) return;

        try {
            const monthKey = formatMonthKey(currentMonth);
            const now = new Date();
            const isCurrentMonth = currentMonth.getMonth() === now.getMonth() && currentMonth.getFullYear() === now.getFullYear();
            const throughDate = isCurrentMonth ? now : new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

            // 1. Get Month Signals
            const signals = getMonthSignals(monthCaptures, monthKey, throughDate.toISOString());

            // 2. Set gating states
            const isEligible = throughDate.getDate() >= 7 && signals.activeDays >= 7;
            setIsEligibleForInsight(isEligible);
            setCapturedDaysCount(signals.activeDays);

            // 3. Load cached data or regenerate mood ring phrase/reasoning
            const cached = force ? null : await fetchMonthlySummary(user.id, monthKey);

            // Caching logic: only regenerate if missing OR 10+ new captures since last generation
            const cachedCaptures = cached?.sourceStats?.totalCaptures || 0;
            const captureDiff = Math.abs(signals.totalCaptures - cachedCaptures);
            const shouldRegenerate = !cached || !cached.monthPhrase || !cached.aiReasoning || captureDiff >= 10;

            if (!force && !shouldRegenerate) {
                setAiReasoning(cached?.aiReasoning || null);
                setMonthPhrase(cached?.monthPhrase || null);
            } else {
                // Generate mood ring phrase and reasoning - only if 3+ captures
                if (monthCaptures.length >= 3) {
                    const moodTotals = computeMonthMoodTotals(monthCaptures);
                    const bannedWords = getBannedMoodWords();

                    // Month phrase logic
                    let phrase = cached?.monthPhrase;
                    if (!phrase) {
                        phrase = await generateMonthPhrase(moodTotals, bannedWords);
                    }
                    setMonthPhrase(phrase);

                    const reasoning = await generateMonthPhraseReasoning(phrase, signals, bannedWords);
                    setAiReasoning(reasoning);

                    // Cache mood ring data
                    await upsertMonthlySummary(
                        user.id,
                        monthKey,
                        moodTotals,
                        null, // legacy summary removed
                        phrase,
                        reasoning,
                        null, // monthToDateSummary removed
                        throughDate.toISOString(),
                        signals
                    );
                } else {
                    // Not enough captures - clear mood ring state to avoid showing stale data
                    setMonthPhrase(null);
                    setAiReasoning(null);
                }
            }
        } catch (error) {
            console.error("Error loading AI monthly summary:", error);
        }
    };

    const fetchInsightsData = async () => {
        if (!user) return;
        try {
            const archives = await fetchDailyArchives(user.id);
            setPastInsightArchives(archives);

            const snapshots: DailyInsightSnapshot[] = archives.map((archive) => ({
                date: archive.start_date,
                totalCaptures: archive.capture_ids?.length || 0,
                moods: archive.mood_summary?.moods || {},
                dominantMood: archive.mood_summary?.dominant_mood || null,
                objects: archive.mood_summary?.objects || {},
                mainObject: archive.mood_summary?.main_object || null,
                firstCaptureTime: archive.mood_summary?.first_capture_time || null,
                lastCaptureTime: archive.mood_summary?.last_capture_time || null,
                summaryText: archive.content,
            }));

            setPastInsights(snapshots);
            if (!selectedPastDay && snapshots.length > 0) {
                setSelectedPastDay(snapshots[0]);
            }

            const { start, end } = getWeekRangeForUser(new Date());
            const weekly = snapshots.filter((snap) => {
                const d = new Date(snap.date);
                return d >= start && d <= end;
            });

            // Use archives if available, otherwise fall back to live captures
            if (weekly.length > 0) {
                setWeeklyStats(buildWeeklyStatsFromDaily(weekly));
            } else {
                // Fallback: compute stats directly from live captures
                setWeeklyStats(buildWeeklyStatsFromCaptures(captures, start, end));
            }
        } catch (error) {
            console.error("Error fetching insight archives:", error);
        }
    };

    const loadTodayMoodFlow = async () => {
        if (!user) return;
        try {
            const todayKey = formatDateKey(new Date());
            const flows = await fetchDailyMoodFlows(user.id, todayKey, todayKey);
            const flow = flows[todayKey]?.segments ?? null;
            setTodayMoodFlow(flow);
        } catch (error) {
            console.error("Error loading today mood flow:", error);
            setTodayMoodFlow(null);
        }
    };

    const handleToneSelect = async (toneId: AiToneId) => {
        try {
            // Check if this is a preset tone or a custom tone UUID
            const isPreset = AI_TONES.some(t => t.id === toneId);

            if (isPreset) {
                // Preset tone: save directly to ai_tone, clear custom tone reference
                await updateProfile({
                    ai_tone: toneId,
                    selected_custom_tone_id: null
                });
            } else {
                // Custom tone: save 'custom' sentinel + the UUID
                await updateProfile({
                    ai_tone: 'custom',
                    selected_custom_tone_id: toneId
                });
            }

            setCurrentTone(toneId);
            setToneSelectorVisible(false);
            loadInsight(true);
        } catch (error) {
            console.error("Error updating tone:", error);
        }
    };

    const handleGenerateTagInsight = async (tag: string) => {
        setLoadingTagInsight(true);
        try {
            const config = await buildAiSettings();
            if (!config) return;
            const result = await generateTagInsight(captures, tag, config.settings);
            setGeneratedTagInsight(result);

        } catch (error) {
            console.error("Error generating tag insight:", error);
        } finally {
            setLoadingTagInsight(false);
        }
    };

    const handleSelectPastDay = (day: DailyInsightSnapshot) => {
        setSelectedPastDay(day);
    };

    const handleMonthChange = (direction: 'prev' | 'next') => {
        const next = new Date(currentMonth);
        next.setMonth(next.getMonth() + (direction === 'prev' ? -1 : 1));
        setCurrentMonth(next);
    };


    return (
        <ScreenWrapper screenName="insights" hideFloatingBackground>
            {/* Header - Transparent, no background */}
            <View style={styles.header}>
                <View style={styles.headerContent}>
                    <ThemedText type="title" style={[styles.headerTitle, { color: onBgText }]}>Insights</ThemedText>

                    <View style={styles.headerActions}>
                        {/* Tone Picker */}
                        <ToneTriggerButton
                            activeToneName={getCurrentToneName()}
                            onPress={() => setToneSelectorVisible(true)}
                        />

                        {/* Timeframe Toggle */}
                        <View style={[
                            styles.toggleContainer,
                            { backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)', borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)' }
                        ]}>
                            <TouchableOpacity
                                style={[
                                    styles.toggleBtn,
                                    selectedTimeframe === 'week' && [styles.toggleBtnActive, { backgroundColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)' }]
                                ]}
                                onPress={() => setSelectedTimeframe('week')}
                            >
                                <ThemedText style={[
                                    styles.toggleText,
                                    { color: onBgTextTertiary },
                                    selectedTimeframe === 'week' && { color: onBgText }
                                ]}>
                                    Week
                                </ThemedText>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    styles.toggleBtn,
                                    selectedTimeframe === 'month' && [styles.toggleBtnActive, { backgroundColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)' }]
                                ]}
                                onPress={() => setSelectedTimeframe('month')}
                            >
                                <ThemedText style={[
                                    styles.toggleText,
                                    { color: onBgTextTertiary },
                                    selectedTimeframe === 'month' && { color: onBgText }
                                ]}>
                                    Month
                                </ThemedText>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>

                {selectedTimeframe === 'month' ? (
                    isReady && (
                        <>
                            {monthlyStatus === 'loading' && <ActivityIndicator style={{ marginVertical: 12 }} />}
                            {monthlyStatus === 'error' && monthlyError && (
                                <InsightErrorDisplay
                                    message={monthlyError.message}
                                    stage={monthlyError.stage}
                                    requestId={monthlyError.requestId}
                                />
                            )}
                            <MonthView
                                text={monthlyText}
                                currentMonth={currentMonth}
                                onMonthChange={handleMonthChange}
                                onGenerate={() => loadMonthlyInsight(true)}
                                isGenerating={monthlyStatus === 'loading'}
                                captures={captures}
                                dailyFlows={monthDailyFlows}
                                aiReasoning={aiReasoning}
                                monthPhrase={monthPhrase}
                                onArchiveFull={() => setIsArchiveFullModalVisible(true)}
                                isEligibleForInsight={isEligibleForInsight}
                                capturedDaysCount={capturedDaysCount}
                                pendingCount={0}
                            />
                        </>
                    )
                ) : (
                    <>
                        {dailyStatus === 'loading' && <ActivityIndicator style={{ marginVertical: 12 }} />}
                        {dailyStatus === 'error' && dailyError && (
                            <InsightErrorDisplay
                                message={dailyError.message}
                                stage={dailyError.stage}
                                requestId={dailyError.requestId}
                            />
                        )}
                        <TodayInsightCard
                            text={dailyText}
                            onRefresh={() => loadInsight(true)}
                            flat
                            onArchiveFull={() => setIsArchiveFullModalVisible(true)}
                        />

                        {/* Below fold: Render after interactions for smoothness */}
                        {isReady && (
                            <>
                                {/* DAILY FLOW - Mood Flow as a timeline trace */}
                                <SoftFadeDivider />
                                <SectionHeader title="DAILY FLOW" />
                                <MoodFlow moodFlow={todayMoodFlow} loading={dailyStatus === 'loading'} flat />

                                {/* MOOD SIGNAL - Weekly pattern analytics */}
                                <SectionHeader title="MOOD SIGNAL" />
                                <MoodSignal captures={captures} flat />

                                {/* STATS - Key metrics in 2x2 grid */}
                                <SectionHeader title="STATS" />
                                <View style={styles.statsGrid}>
                                    {/* Best Streak */}
                                    <View style={[styles.statGridItem, { backgroundColor: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)', borderColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)' }]}>
                                        <ThemedText type="caption" style={[styles.statLabel, { color: colors.text }]}>BEST STREAK</ThemedText>
                                        <ThemedText
                                            style={[styles.statValue, { color: colors.text }]}
                                            numberOfLines={1}
                                            adjustsFontSizeToFit
                                            minimumFontScale={0.7}
                                        >
                                            {bestStreak} <ThemedText style={styles.statUnit}>days</ThemedText>
                                        </ThemedText>
                                        <View style={styles.statBadge}>
                                            <Ionicons name="trophy" size={12} color="#F59E0B" />
                                            <ThemedText style={[styles.statBadgeText, { color: '#F59E0B' }]}>All-time</ThemedText>
                                        </View>
                                    </View>

                                    {/* Current Streak */}
                                    <View style={[styles.statGridItem, { backgroundColor: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)', borderColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)' }]}>
                                        <ThemedText type="caption" style={[styles.statLabel, { color: colors.text }]}>CURRENT STREAK</ThemedText>
                                        <ThemedText
                                            style={[styles.statValue, { color: colors.text }]}
                                            numberOfLines={1}
                                            adjustsFontSizeToFit
                                            minimumFontScale={0.7}
                                        >
                                            {streak} <ThemedText style={styles.statUnit}>days</ThemedText>
                                        </ThemedText>
                                        <View style={[styles.statBadge, { borderColor: '#A855F7' }]}>
                                            <Ionicons name="flame" size={12} color="#A855F7" />
                                            <ThemedText style={[styles.statBadgeText, { color: '#A855F7' }]}>Keep it up!</ThemedText>
                                        </View>
                                    </View>

                                    {/* Most Captures in a Day */}
                                    <View style={[styles.statGridItem, { backgroundColor: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)', borderColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)' }]}>
                                        <ThemedText type="caption" style={[styles.statLabel, { color: colors.text }]}>MOST IN A DAY</ThemedText>
                                        <ThemedText
                                            style={[styles.statValue, { color: colors.text }]}
                                            numberOfLines={1}
                                            adjustsFontSizeToFit
                                            minimumFontScale={0.7}
                                        >
                                            {mostCapturesDay.count} <ThemedText style={styles.statUnit}>captures</ThemedText>
                                        </ThemedText>
                                        <ThemedText style={styles.statDate}>
                                            {mostCapturesDay.date ? new Date(mostCapturesDay.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '--'}
                                        </ThemedText>
                                    </View>

                                    {/* Avg Captures per Day */}
                                    <View style={[styles.statGridItem, { backgroundColor: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)', borderColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)' }]}>
                                        <ThemedText type="caption" style={[styles.statLabel, { color: colors.text }]}>AVG PER DAY</ThemedText>
                                        <ThemedText
                                            style={[styles.statValue, { color: colors.text }]}
                                            numberOfLines={1}
                                            adjustsFontSizeToFit
                                            minimumFontScale={0.7}
                                        >
                                            {avgCapturesPerDay} <ThemedText style={styles.statUnit}>captures</ThemedText>
                                        </ThemedText>
                                        <View style={styles.statBadge}>
                                            <Ionicons name="analytics" size={12} color="#34D399" />
                                            <ThemedText style={[styles.statBadgeText, { color: '#34D399' }]}>Daily avg</ThemedText>
                                        </View>
                                    </View>
                                </View>

                                {/* MOOD BY TIME - Time-of-day mood patterns */}
                                <SectionHeader title="MOOD BY TIME" />
                                <View style={styles.timeOfDayGrid}>
                                    {/* Morning */}
                                    <View style={[styles.timeOfDayItem, { backgroundColor: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)', borderColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)' }]}>
                                        <View style={styles.timeOfDayHeader}>
                                            <Sunrise size={18} strokeWidth={1.5} color={isLight ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)'} />
                                            <ThemedText type="caption" style={[styles.timeOfDayLabel, { color: colors.textTertiary }]}>MORNING</ThemedText>
                                        </View>
                                        <ThemedText style={[styles.timeOfDayMood, { color: colors.text }]}>
                                            {morningMood.dominant || '—'}
                                        </ThemedText>
                                        <ThemedText style={[styles.timeOfDayMeta, { color: colors.textTertiary }]}>
                                            {morningMood.count > 0 ? `${morningMood.count} of ${morningMood.totalCaptures}` : 'No data'}
                                        </ThemedText>
                                    </View>

                                    {/* Afternoon */}
                                    <View style={[styles.timeOfDayItem, { backgroundColor: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)', borderColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)' }]}>
                                        <View style={styles.timeOfDayHeader}>
                                            <Sun size={18} strokeWidth={1.5} color={isLight ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)'} />
                                            <ThemedText type="caption" style={[styles.timeOfDayLabel, { color: colors.textTertiary }]}>AFTERNOON</ThemedText>
                                        </View>
                                        <ThemedText style={[styles.timeOfDayMood, { color: colors.text }]}>
                                            {afternoonMood.dominant || '—'}
                                        </ThemedText>
                                        <ThemedText style={[styles.timeOfDayMeta, { color: colors.textTertiary }]}>
                                            {afternoonMood.count > 0 ? `${afternoonMood.count} of ${afternoonMood.totalCaptures}` : 'No data'}
                                        </ThemedText>
                                    </View>

                                    {/* Evening */}
                                    <View style={[styles.timeOfDayItem, { backgroundColor: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)', borderColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)' }]}>
                                        <View style={styles.timeOfDayHeader}>
                                            <MoonStar size={18} strokeWidth={1.5} color={isLight ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)'} />
                                            <ThemedText type="caption" style={[styles.timeOfDayLabel, { color: colors.textTertiary }]}>EVENING</ThemedText>
                                        </View>
                                        <ThemedText style={[styles.timeOfDayMood, { color: colors.text }]}>
                                            {eveningMood.dominant || '—'}
                                        </ThemedText>
                                        <ThemedText style={[styles.timeOfDayMeta, { color: colors.textTertiary }]}>
                                            {eveningMood.count > 0 ? `${eveningMood.count} of ${eveningMood.totalCaptures}` : 'No data'}
                                        </ThemedText>
                                    </View>
                                </View>

                                {/* WEEKLY MOOD - Mood breakdown chart */}
                                <SoftFadeDivider />
                                <SectionHeader title={selectedTimeframe === 'week' ? "WEEKLY MOOD" : "MONTHLY MOOD"} />
                                <MoodChart captures={captures} timeframe={selectedTimeframe} />

                                {/* ROUTINES - Chronotype dial as hero artifact */}
                                <SoftFadeDivider />
                                <SectionHeader title="ROUTINES" />
                                <ChronotypeDial
                                    captures={captures}
                                    totalEntries={totalEntries}
                                    flat
                                />

                                {/* WEEKLY RECAP - Text narrative */}
                                <SoftFadeDivider />
                                <SectionHeader title="WEEKLY RECAP" />
                                <WeeklySummaryCard
                                    text={weeklyText}
                                    weeklyStats={weeklyStats}
                                    isGenerating={weeklyStatus === 'loading'}
                                    onGenerate={() => loadWeeklyInsight(true)}
                                    onViewHistory={() => { }}
                                    flat
                                    onArchiveFull={() => setIsArchiveFullModalVisible(true)}
                                    pendingCount={0}
                                    error={weeklyError}
                                />
                                <MicroDivider width="40%" />
                                <ObjectOfWeek objectOfWeek={weeklyStats?.objectOfWeek || undefined} flat />


                                {/* REFLECTIONS - Tag insights */}
                                <SectionHeader title="REFLECTIONS" />
                                <TagReflections
                                    tags={topTags}
                                    onGenerateTagInsight={handleGenerateTagInsight}
                                    generatedInsight={generatedTagInsight}
                                    loading={loadingTagInsight}
                                    onClose={() => setGeneratedTagInsight(null)}
                                    flat
                                    onArchiveFull={() => setIsArchiveFullModalVisible(true)}
                                />

                                {/* ARCHIVE - Quiet, secondary placement */}
                                <SoftFadeDivider />
                                <TouchableOpacity
                                    activeOpacity={0.8}
                                    onPress={() => router.push('/archive')}
                                    style={styles.archiveRow}
                                >
                                    <View style={styles.archiveContent}>
                                        <View>
                                            <ThemedText type="defaultSemiBold" style={[styles.archiveTitle, { color: onBgText }]}>Open Archive</ThemedText>
                                            <ThemedText style={[styles.archiveSubtitle, { color: onBgTextSecondary }]}>Browse all past insights by type</ThemedText>
                                        </View>
                                        <Ionicons name="chevron-forward" size={20} color={onBgTextSecondary} />
                                    </View>
                                </TouchableOpacity>

                            </>
                        )}
                    </>
                )}

            </ScrollView>

            <ToneSelector
                visible={toneSelectorVisible}
                onClose={() => setToneSelectorVisible(false)}
                currentToneId={currentTone}
                onSelectTone={handleToneSelect}
            />

            <ArchiveFullModal
                visible={isArchiveFullModalVisible}
                onClose={() => setIsArchiveFullModalVisible(false)}
                onManageArchive={() => {
                    setIsArchiveFullModalVisible(false);
                    router.push('/archive');
                }}
                onExportInsights={() => {
                    setIsArchiveFullModalVisible(false);
                    setIsExportModalVisible(true);
                }}
                onUnlockPremium={() => {
                    setIsArchiveFullModalVisible(false);
                }}
            />

            <ExportInsightsModal
                visible={isExportModalVisible}
                onClose={() => setIsExportModalVisible(false)}
                userId={user?.id || ''}
            />
        </ScreenWrapper >
    );
}

const styles = StyleSheet.create({
    header: {
        paddingTop: 60, // Status bar space
        paddingBottom: 16,
        // Transparent header - no background, blur, border, or shadow
        backgroundColor: 'transparent',
    },
    headerContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    headerTitle: {
        fontSize: 24,
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    iconButton: {
        padding: 8,
    },
    toggleContainer: {
        flexDirection: 'row',
        // backgroundColor and borderColor applied via inline override
        borderRadius: 20,
        padding: 4,
        borderWidth: 1,
    },
    toggleBtn: {
        paddingVertical: 6,
        paddingHorizontal: 16,
        borderRadius: 16,
    },
    toggleBtnActive: {
        // backgroundColor applied via inline override
    },
    toggleText: {
        fontSize: 12,
        color: Colors.obsy.silverStrong,
    },
    toggleTextActive: {
        color: Colors.obsy.silver,
        fontWeight: '600',
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 100,
        gap: 24,
    },
    cardPadding: {
        padding: 20,
        gap: 16,
    },
    sectionPadding: {
        padding: 20,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    iconPlaceholder: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: Colors.obsy.silver,
    },
    cardTitle: {
        textShadowColor: 'rgba(0, 0, 0, 0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
    },
    insightText: {
        fontSize: 15,
        lineHeight: 22,
        textShadowColor: 'rgba(0, 0, 0, 0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
    },
    expandIconContainer: {
        alignItems: 'center',
        marginTop: 8,
    },
    cardFooter: {
        alignItems: 'flex-end',
    },
    statsCardContainer: {
        marginBottom: 8,
    },
    statsRow: {
        flexDirection: 'row',
        padding: 20,
        alignItems: 'center',
    },
    statItem: {
        flex: 1,
        gap: 6,
    },
    statDivider: {
        width: 1,
        height: '80%',
        // backgroundColor applied via inline override
        marginHorizontal: 16,
    },
    statLabel: {
        letterSpacing: 1,
    },
    statValue: {
        fontSize: 28,
        lineHeight: 32,
        fontFamily: 'SpaceMono', // Default mono font in Expo template
        textShadowColor: 'rgba(0, 0, 0, 0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
        flexShrink: 1,
    },
    statUnit: {
        fontSize: 14,
        fontFamily: 'System',
        color: '#737373',
    },
    statBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 4,
    },
    statBadgeText: {
        fontSize: 12,
        color: '#A855F7', // obsy-purple
        fontWeight: '600',
    },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    statGridItem: {
        width: '47%',
        padding: 16,
        // backgroundColor and borderColor applied via inline override
        borderRadius: 12,
        borderWidth: 1,
        gap: 6,
    },
    statDate: {
        fontSize: 12,
        fontWeight: '600',
        color: '#34D399', // Green for date
        marginTop: 2,
    },
    sectionCard: {
        minHeight: 120,
    },
    emptyState: {
        padding: 20,
        alignItems: 'center',
    },
    emptyText: {
        // Color applied via inline override using colors.textSecondary
    },
    archiveCard: {
        padding: 16,
    },
    archiveRow: {
        paddingVertical: 12,
    },
    archiveContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    archiveTitle: {
        fontSize: 16,
        // Color applied via inline override using onBgText
    },
    archiveSubtitle: {
        fontSize: 12,
        marginTop: 2,
        // Color applied via inline override using onBgTextSecondary
    },
    // ─────────────────────────────────────────────────────────────────────────
    // Three-Tier Divider System
    // ─────────────────────────────────────────────────────────────────────────

    // 1. Section Header Divider (Primary) - "New chapter" feel
    sectionHeaderContainer: {
        marginTop: 30,
        marginBottom: 14,
    },
    sectionDividerLine: {
        height: 1,
        // backgroundColor applied via inline override
        marginBottom: 14,
    },
    sectionTitle: {
        fontSize: 11,
        fontWeight: '600',
        // color applied via inline override
        letterSpacing: 1.8,
        textTransform: 'uppercase',
    },

    // 2. Soft Fade Divider (Ambient) - Signature Obsy divider
    softFadeDivider: {
        height: 28,
        justifyContent: 'center',
        alignItems: 'center',
    },
    softFadeGradient: {
        height: 1,
        width: '100%',
        // backgroundColor applied via inline override
        // Note: For true gradient, use LinearGradient component
        // This is a subtle approximation
    },

    // 3. Inline Micro Divider (Utility) - Inside sections
    microDividerContainer: {
        alignItems: 'center',
        paddingVertical: 12,
    },
    microDividerLine: {
        height: 1,
        // backgroundColor applied via inline override
    },

    // Section content wrapper
    sectionContent: {
        // Content flows naturally, no extra padding needed
    },

    // Deprecated: keeping for compatibility during transition
    sectionHeader: {
        fontSize: 12,
        fontWeight: '500',
        // color applied via inline override using colors.textTertiary
        letterSpacing: 1,
        textTransform: 'uppercase',
        marginBottom: 12,
        marginLeft: 0,
        marginTop: 8,
    },
    flatSection: {
        marginBottom: 0,
    },
    flatSectionHeaderContainer: {
        marginTop: 24,
        marginBottom: 4,
    },
    flatSectionDivider: {
        height: 1,
        width: '100%',
        opacity: 0.15,
        marginBottom: 8,
    },
    rowDivider: {
        height: 1,
        width: '100%',
        // backgroundColor applied via inline override
        marginTop: 8,
    },
    statRowDivider: {
        width: 1,
        height: '80%',
        // backgroundColor applied via inline override
        marginHorizontal: 16,
    },
    revealContainer: {
        padding: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    revealInfo: {
        alignItems: 'center',
        gap: 8,
    },
    revealTitle: {
        fontSize: 18,
        fontWeight: '600',
        // color applied via inline override using colors.text
        textAlign: 'center',
    },
    revealSubtitle: {
        fontSize: 13,
        // color applied via inline override using colors.textSecondary
        textAlign: 'center',
        lineHeight: 18,
        paddingHorizontal: 10,
    },
    revealButton: {
        backgroundColor: Colors.obsy.silver,
        paddingVertical: 14,
        paddingHorizontal: 32,
        borderRadius: 24,
        minWidth: 200,
        alignItems: 'center',
        shadowColor: Colors.obsy.silver,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    revealButtonLoading: {
        opacity: 0.8,
    },
    revealButtonText: {
        color: '#000',
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    visionToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 16,
        // backgroundColor and borderColor applied via inline override
        borderWidth: 1,
    },
    visionToggleText: {
        fontSize: 12,
        fontWeight: '500',
    },
    visionPill: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    visionPillText: {
        fontSize: 8,
        fontWeight: '800',
        // color applied via inline override using colors.textTertiary
        letterSpacing: 0.5,
    },
    // MOOD BY TIME Styles
    timeOfDayGrid: {
        flexDirection: 'row',
        gap: 12,
    },
    timeOfDayItem: {
        flex: 1,
        padding: 16,
        // backgroundColor and borderColor applied via inline override
        borderRadius: 12,
        borderWidth: 1,
        gap: 8,
    },
    timeOfDayHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    timeOfDayLabel: {
        fontSize: 10,
        fontWeight: '600',
        // color applied via inline override using colors.textTertiary
        letterSpacing: 1,
    },
    timeOfDayMood: {
        fontSize: 16,
        fontWeight: '700',
        // color applied via inline override using colors.text
    },
    timeOfDayMeta: {
        fontSize: 10,
        // color applied via inline override using colors.textTertiary
        fontWeight: '500',
    },
});

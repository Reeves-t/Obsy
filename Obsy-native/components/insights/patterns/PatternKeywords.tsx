import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View, LayoutChangeEvent } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, cancelAnimation } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { ThemedText } from '@/components/ui/ThemedText';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCaptureStore } from '@/lib/captureStore';
import { usePatternKeywords } from '@/lib/patternKeywordsStore';
import { Capture } from '@/types/capture';
import type { PatternCategory, PatternTheme } from '@/types/patternKeywords';
import { CategoryTabs } from './CategoryTabs';
import { ThemeChip } from './ThemeChip';
import { DetailCard } from './DetailCard';
import { NewEmergingPatternModal } from './NewEmergingPatternModal';
import { getPatternTokens, CATEGORY_META } from './tokens';

const MIN_ELIGIBLE = 8;

interface PatternKeywordsProps {
    flat?: boolean;
}

const RefreshIcon: React.FC<{ color: string }> = ({ color }) => (
    <Svg width={15} height={15} viewBox="0 0 16 16">
        <Path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" stroke={color} strokeWidth={1.4} fill="none" strokeLinecap="round" />
        <Path d="M13.5 2.2v3.2h-3.2" stroke={color} strokeWidth={1.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
);

export const PatternKeywords: React.FC<PatternKeywordsProps> = () => {
    const { user } = useAuth();
    const { captures } = useCaptureStore();
    const { isLight, colors } = useObsyTheme();
    const tokens = getPatternTokens(isLight);

    const {
        status,
        payload,
        eligibleCount,
        error,
        hasLoadedSnapshot,
        lastChange,
        loadSnapshot,
        refreshPatterns,
        updateEligibleCount,
        clearLastChange,
        isLocked,
    } = usePatternKeywords();

    const [category, setCategory] = useState<PatternCategory>('positive');
    const [selectedId, setSelectedId] = useState<Record<PatternCategory, string | null>>({
        positive: null,
        draining: null,
        emerging: null,
    });
    const [cardWidth, setCardWidth] = useState(322);
    const [toastVisible, setToastVisible] = useState<{ kind: 'new' | 'none' } | null>(null);

    const spin = useSharedValue(0);
    useEffect(() => {
        if (status === 'loading') {
            spin.value = 0;
            spin.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.linear }), -1, false);
        } else {
            cancelAnimation(spin);
            spin.value = 0;
        }
        return () => cancelAnimation(spin);
    }, [status]);

    const spinStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${spin.value * 360}deg` }],
    }));

    useEffect(() => {
        if (user) loadSnapshot(user.id);
    }, [user?.id]);

    useEffect(() => {
        updateEligibleCount(captures);
    }, [captures]);

    // Auto-generate on first ready state
    useEffect(() => {
        if (!hasLoadedSnapshot || !user) return;
        if (payload) return;
        if (eligibleCount < MIN_ELIGIBLE) return;
        if (status === 'loading') return;
        refreshPatterns(user.id, captures);
    }, [hasLoadedSnapshot, payload, eligibleCount, status, user?.id]);

    const handleRefresh = useCallback(async () => {
        if (!user || status === 'loading') return;
        const result = await refreshPatterns(user.id, captures);
        setToastVisible({ kind: result.kind === 'new-emerging' ? 'new' : 'none' });
        setTimeout(() => setToastVisible(null), 3500);
    }, [user?.id, captures, status]);

    const onLayoutCard = (e: LayoutChangeEvent) => {
        setCardWidth(e.nativeEvent.layout.width);
    };

    const themes: PatternTheme[] = payload ? payload[category] : [];
    const currentSelectedId = selectedId[category];
    const activeTheme = themes.find(t => t.id === currentSelectedId) ?? themes[0] ?? null;

    const locked = isLocked();
    const showInitialLoading = status === 'loading' && !payload;
    const showError = status === 'error' && !payload;
    const meta = CATEGORY_META[category];

    return (
        <View style={styles.container}>
            <View style={styles.headerRow}>
                <View style={{ flex: 1 }}>
                    <ThemedText style={[styles.subHeader, { color: tokens.ink2 }]}>{meta.sub}.</ThemedText>
                    {payload?.dateRange ? (
                        <ThemedText style={[styles.dateRange, { color: tokens.ink3 }]}>{payload.dateRange}</ThemedText>
                    ) : null}
                </View>
                <TouchableOpacity
                    onPress={handleRefresh}
                    disabled={status === 'loading' || locked}
                    activeOpacity={0.7}
                    style={[styles.refreshBtn, { backgroundColor: tokens.paper, borderColor: tokens.line, opacity: status === 'loading' || locked ? 0.5 : 1 }]}
                    accessibilityLabel="Re-scan patterns"
                >
                    <Animated.View style={spinStyle}>
                        <RefreshIcon color={tokens.ink2} />
                    </Animated.View>
                </TouchableOpacity>
            </View>

            {toastVisible ? (
                <View style={[styles.toast, { backgroundColor: tokens.paper, borderColor: tokens.line }]}>
                    <View style={[styles.toastDot, { backgroundColor: toastVisible.kind === 'new' ? CATEGORY_META.emerging.color : tokens.ink4 }]} />
                    <ThemedText style={[styles.toastText, { color: tokens.ink2 }]}>
                        {toastVisible.kind === 'new'
                            ? 'New emerging pattern detected'
                            : 'No new pattern · checked just now'}
                    </ThemedText>
                </View>
            ) : null}

            {locked ? (
                <View style={[styles.lockedCard, { backgroundColor: colors.background, borderColor: tokens.line }]}>
                    <ThemedText style={[styles.lockedTitle, { color: tokens.ink2 }]}>
                        Patterns reveal themselves with time
                    </ThemedText>
                    <ThemedText style={[styles.lockedSub, { color: tokens.ink3 }]}>
                        Add at least {MIN_ELIGIBLE} entries to surface your first themes. {eligibleCount} of {MIN_ELIGIBLE} so far.
                    </ThemedText>
                </View>
            ) : showInitialLoading ? (
                <View style={[styles.lockedCard, { backgroundColor: colors.background, borderColor: tokens.line }]}>
                    <ActivityIndicator color={tokens.ink3} />
                    <ThemedText style={[styles.lockedSub, { color: tokens.ink3, marginTop: 10 }]}>
                        Reading your recent entries…
                    </ThemedText>
                </View>
            ) : showError ? (
                <View style={[styles.lockedCard, { backgroundColor: colors.background, borderColor: tokens.line }]}>
                    <ThemedText style={[styles.lockedTitle, { color: tokens.ink2 }]}>
                        Couldn't load patterns
                    </ThemedText>
                    <ThemedText style={[styles.lockedSub, { color: tokens.ink3 }]}>
                        {error?.message || 'Something went wrong.'}
                    </ThemedText>
                    <TouchableOpacity
                        onPress={handleRefresh}
                        activeOpacity={0.8}
                        style={[styles.retryBtn, { borderColor: tokens.line }]}
                    >
                        <ThemedText style={[styles.retryText, { color: tokens.ink2 }]}>Tap to retry</ThemedText>
                    </TouchableOpacity>
                </View>
            ) : payload ? (
                <>
                    <View style={styles.tabsWrap}>
                        <CategoryTabs value={category} onChange={setCategory} />
                    </View>

                    {themes.length > 0 && activeTheme ? (
                        <>
                            <View style={styles.chipRow}>
                                {themes.map((t) => (
                                    <ThemeChip
                                        key={t.id}
                                        theme={t}
                                        active={t.id === activeTheme.id}
                                        color={meta.color}
                                        onPress={() => setSelectedId({ ...selectedId, [category]: t.id })}
                                    />
                                ))}
                            </View>

                            <View onLayout={onLayoutCard}>
                                <DetailCard theme={activeTheme} category={category} width={cardWidth} />
                            </View>
                        </>
                    ) : (
                        <View style={[styles.lockedCard, { backgroundColor: colors.background, borderColor: tokens.line }]}>
                            <ThemedText style={[styles.lockedSub, { color: tokens.ink3 }]}>
                                Not enough signal here yet.
                            </ThemedText>
                        </View>
                    )}

                    <ThemedText style={[styles.footnote, { color: tokens.ink3 }]}>
                        Patterns are observations, not conclusions.
                    </ThemedText>
                </>
            ) : null}

            <NewEmergingPatternModal
                visible={lastChange?.kind === 'new-emerging'}
                theme={lastChange?.kind === 'new-emerging' ? lastChange.theme ?? null : null}
                onClose={clearLastChange}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: { width: '100%' },
    headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
    subHeader: { fontSize: 13.5, lineHeight: 19 },
    dateRange: { fontSize: 11, letterSpacing: 0.4, marginTop: 4 },
    refreshBtn: {
        width: 32, height: 32, borderRadius: 99,
        alignItems: 'center', justifyContent: 'center', borderWidth: 1,
    },
    toast: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingVertical: 10, paddingHorizontal: 12,
        borderRadius: 12, borderWidth: 1, marginBottom: 12,
    },
    toastDot: { width: 7, height: 7, borderRadius: 99 },
    toastText: { flex: 1, fontSize: 12.5, lineHeight: 17 },
    lockedCard: {
        borderRadius: 22, padding: 22, borderWidth: 1,
        alignItems: 'center', justifyContent: 'center', minHeight: 140,
    },
    lockedTitle: { fontSize: 16, fontWeight: '500', textAlign: 'center', marginBottom: 6 },
    lockedSub: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
    retryBtn: { marginTop: 14, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 99, borderWidth: 1 },
    retryText: { fontSize: 12.5, fontWeight: '500' },
    tabsWrap: { marginBottom: 16 },
    chipRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    footnote: { fontSize: 11, fontStyle: 'italic', textAlign: 'center', marginTop: 16 },
});

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, TouchableOpacity, Alert } from 'react-native';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { ThemedText } from '@/components/ui/ThemedText';
import { useMoodverseStore } from '@/lib/moodverseStore';
import { useSubscription } from '@/hooks/useSubscription';
import { VanguardPaywall } from '@/components/paywall/VanguardPaywall';
import { X, Link2, Sparkles, Filter, Lock } from 'lucide-react-native';
import { format } from 'date-fns';
import { useRouter } from 'expo-router';
import type { GalaxyOrb, GalaxyCluster } from './galaxyTypes';
import type { TransitionData } from './transitionCompute';
import { getProfile } from '@/services/profile';

interface BottomSheetMetadataProps {
    orbs: GalaxyOrb[];
    clusters: GalaxyCluster[];
    transitions?: TransitionData | null;
}

export function BottomSheetMetadata({ orbs, clusters, transitions }: BottomSheetMetadataProps) {
    const sheetRef = useRef<BottomSheet>(null);
    const router = useRouter();
    const {
        selectedOrbId,
        selectedOrbIds,
        selectionMode,
        showLinks,
        setShowLinks,
        clearSelection,
        setIsolateCluster,
        openChat,
    } = useMoodverseStore();

    const { tier } = useSubscription();
    const [showPaywall, setShowPaywall] = useState(false);
    const [aiFreeMode, setAiFreeMode] = useState(false);

    const isPro = tier === 'founder' || tier === 'subscriber';
    const hasSelection = selectedOrbId !== null || selectedOrbIds.length > 0;

    const snapPoints = useMemo(() => ['28%', '55%'], []);

    useEffect(() => {
        getProfile()
            .then((profile) => setAiFreeMode(!!profile?.ai_free_mode))
            .catch(() => setAiFreeMode(false));
    }, []);

    const selectedOrb = useMemo(() => {
        if (!selectedOrbId) return null;
        return orbs.find((o) => o.id === selectedOrbId) ?? null;
    }, [selectedOrbId, orbs]);

    const selectedOrbs = useMemo(() => {
        if (selectedOrbIds.length === 0) return [];
        const idSet = new Set(selectedOrbIds);
        return orbs.filter((o) => idSet.has(o.id));
    }, [selectedOrbIds, orbs]);

    const selectedCluster = useMemo(() => {
        if (selectionMode !== 'cluster' || selectedOrbIds.length === 0) return null;
        const first = orbs.find((o) => o.id === selectedOrbIds[0]);
        if (!first) return null;
        return clusters.find((c) => c.id === first.clusterId) ?? null;
    }, [selectionMode, selectedOrbIds, orbs, clusters]);

    const handleClose = useCallback(() => {
        clearSelection();
    }, [clearSelection]);

    const handleExplainPress = useCallback(() => {
        if (aiFreeMode) {
            Alert.alert('AI-Free Mode', 'Moodverse chat is disabled while AI-Free mode is on.');
            return;
        }
        if (!isPro) {
            setShowPaywall(true);
            return;
        }
        // Store context and navigate to full-screen chat
        const orbIds = selectionMode === 'single' && selectedOrbId
            ? [selectedOrbId]
            : selectedOrbIds;
        openChat(orbIds, selectionMode as 'single' | 'multi' | 'cluster');
        router.push('/moodverse/chat');
    }, [aiFreeMode, isPro, selectionMode, selectedOrbId, selectedOrbIds, openChat, router]);

    if (!hasSelection) return null;

    return (
        <>
            <BottomSheet
                ref={sheetRef}
                index={0}
                snapPoints={snapPoints}
                enablePanDownToClose
                onClose={handleClose}
                backgroundStyle={styles.sheetBg}
                handleIndicatorStyle={styles.handle}
            >
                <BottomSheetView style={styles.content}>
                    {/* Close button */}
                    <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
                        <X size={18} color="rgba(255,255,255,0.4)" />
                    </TouchableOpacity>

                    {selectionMode === 'single' && selectedOrb && (
                        <SingleOrbView
                            orb={selectedOrb}
                            showLinks={showLinks}
                            onToggleLinks={() => setShowLinks(!showLinks)}
                            onExplain={handleExplainPress}
                            isPro={isPro}
                            transitions={transitions}
                        />
                    )}

                    {selectionMode === 'multi' && selectedOrbs.length > 0 && (
                        <MultiSelectionView
                            orbs={selectedOrbs}
                            onExplain={handleExplainPress}
                            isPro={isPro}
                        />
                    )}

                    {selectionMode === 'cluster' && selectedCluster && (
                        <ClusterView
                            cluster={selectedCluster}
                            onIsolate={() => setIsolateCluster(selectedCluster.id)}
                            onExplain={handleExplainPress}
                            isPro={isPro}
                        />
                    )}
                </BottomSheetView>
            </BottomSheet>

            <VanguardPaywall
                visible={showPaywall}
                onClose={() => setShowPaywall(false)}
                featureName="moodverse_explain"
            />
        </>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Explain Button (shared)
// ─────────────────────────────────────────────────────────────────────────────

function ExplainButton({
    onPress,
    isPro,
    label = 'Talk About It',
}: {
    onPress: () => void;
    isPro: boolean;
    label?: string;
}) {
    return (
        <TouchableOpacity
            style={[styles.actionBtn, isPro && styles.actionBtnExplain]}
            onPress={onPress}
        >
            {isPro ? (
                <Sparkles size={14} color="#8B2252" />
            ) : (
                <Lock size={14} color="rgba(255,255,255,0.3)" />
            )}
            <ThemedText
                style={isPro ? styles.actionTextExplain : styles.actionTextDisabled}
            >
                {isPro ? label : `${label} (Obsy+)`}
            </ThemedText>
        </TouchableOpacity>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Single Orb View
// ─────────────────────────────────────────────────────────────────────────────

const AURA_DOT_COLORS = {
    after1: '#FFD700',
    after2: '#C0C0C0',
    before1: '#4A9EDE',
    before2: '#2AAA8A',
    none: 'rgba(255,255,255,0.15)',
};

function SingleOrbView({
    orb,
    showLinks,
    onToggleLinks,
    onExplain,
    isPro,
    transitions,
}: {
    orb: GalaxyOrb;
    showLinks: boolean;
    onToggleLinks: () => void;
    onExplain: () => void;
    isPro: boolean;
    transitions?: TransitionData | null;
}) {
    const date = new Date(orb.timestamp);

    const hasBefore = transitions && transitions.before.length > 0;
    const hasAfter = transitions && transitions.after.length > 0;
    const hasTransitions = hasBefore || hasAfter;

    return (
        <View style={styles.viewContainer}>
            <View style={styles.moodRow}>
                <View style={[styles.moodDot, { backgroundColor: orb.colorSolid }]} />
                <ThemedText style={styles.moodLabel}>{orb.moodLabel}</ThemedText>
            </View>

            <ThemedText style={styles.dateText}>
                {format(date, 'EEEE, MMMM d')} at {format(date, 'h:mm a')}
            </ThemedText>

            {orb.tags.length > 0 && (
                <View style={styles.tagsRow}>
                    {orb.tags.map((tag) => (
                        <View key={tag} style={styles.tagChip}>
                            <ThemedText style={styles.tagText}>{tag}</ThemedText>
                        </View>
                    ))}
                </View>
            )}

            {orb.notePreview && (
                <ThemedText style={styles.noteText} numberOfLines={3}>
                    {orb.notePreview}
                </ThemedText>
            )}

            <View style={styles.actionsRow}>
                <TouchableOpacity
                    style={[styles.actionBtn, showLinks && styles.actionBtnActive]}
                    onPress={onToggleLinks}
                >
                    <Link2 size={14} color={showLinks ? '#a855f7' : 'rgba(255,255,255,0.5)'} />
                    <ThemedText style={[styles.actionText, showLinks && styles.actionTextActive]}>
                        {showLinks ? 'Hide Links' : 'Show Links'}
                    </ThemedText>
                </TouchableOpacity>

                <ExplainButton onPress={onExplain} isPro={isPro} />
            </View>

            {/* Before/After Transition Cards */}
            {hasTransitions && (
                <View style={transitionStyles.container}>
                    <View style={transitionStyles.divider} />

                    {hasBefore && (
                        <View style={transitionStyles.section}>
                            <ThemedText style={transitionStyles.heading}>
                                Usually comes before {orb.moodLabel}:
                            </ThemedText>
                            {transitions.before.map((t, i) => {
                                const dotColor = i === 0
                                    ? AURA_DOT_COLORS.before1
                                    : i === 1
                                        ? AURA_DOT_COLORS.before2
                                        : AURA_DOT_COLORS.none;
                                return (
                                    <View key={t.moodId} style={transitionStyles.row}>
                                        <View style={[
                                            transitionStyles.dot,
                                            { backgroundColor: dotColor },
                                            i >= 2 && transitionStyles.dotHollow,
                                        ]} />
                                        <ThemedText style={transitionStyles.moodName}>
                                            {t.moodLabel}
                                        </ThemedText>
                                        <ThemedText style={transitionStyles.count}>
                                            ({t.count}x)
                                        </ThemedText>
                                    </View>
                                );
                            })}
                        </View>
                    )}

                    {hasAfter && (
                        <View style={transitionStyles.section}>
                            <ThemedText style={transitionStyles.heading}>
                                Often followed by:
                            </ThemedText>
                            {transitions.after.map((t, i) => {
                                const dotColor = i === 0
                                    ? AURA_DOT_COLORS.after1
                                    : i === 1
                                        ? AURA_DOT_COLORS.after2
                                        : AURA_DOT_COLORS.none;
                                return (
                                    <View key={t.moodId} style={transitionStyles.row}>
                                        <View style={[
                                            transitionStyles.dot,
                                            { backgroundColor: dotColor },
                                            i >= 2 && transitionStyles.dotHollow,
                                        ]} />
                                        <ThemedText style={transitionStyles.moodName}>
                                            {t.moodLabel}
                                        </ThemedText>
                                        <ThemedText style={transitionStyles.count}>
                                            ({t.count}x)
                                        </ThemedText>
                                    </View>
                                );
                            })}
                        </View>
                    )}

                    {!hasBefore && !hasAfter && (
                        <ThemedText style={transitionStyles.empty}>
                            Not enough data yet
                        </ThemedText>
                    )}
                </View>
            )}
        </View>
    );
}

const transitionStyles = StyleSheet.create({
    container: { marginTop: 4 },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.08)', marginBottom: 12 },
    section: { marginBottom: 10 },
    heading: { fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 6 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    dotHollow: { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
    moodName: { fontSize: 13, color: 'rgba(255,255,255,0.65)' },
    count: { fontSize: 12, color: 'rgba(255,255,255,0.3)' },
    empty: { fontSize: 12, color: 'rgba(255,255,255,0.25)', fontStyle: 'italic', marginTop: 4 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Multi Selection View
// ─────────────────────────────────────────────────────────────────────────────

function MultiSelectionView({
    orbs,
    onExplain,
    isPro,
}: {
    orbs: GalaxyOrb[];
    onExplain: () => void;
    isPro: boolean;
}) {
    const dateRange = useMemo(() => {
        if (orbs.length === 0) return '';
        const sorted = [...orbs].sort((a, b) => a.timestamp - b.timestamp);
        const first = format(new Date(sorted[0].timestamp), 'MMM d');
        const last = format(new Date(sorted[sorted.length - 1].timestamp), 'MMM d');
        return first === last ? first : `${first} – ${last}`;
    }, [orbs]);

    const moodBreakdown = useMemo(() => {
        const counts: Record<string, { label: string; color: string; count: number }> = {};
        for (const o of orbs) {
            if (!counts[o.moodId]) counts[o.moodId] = { label: o.moodLabel, color: o.colorSolid, count: 0 };
            counts[o.moodId].count++;
        }
        return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 3);
    }, [orbs]);

    const topTags = useMemo(() => {
        const tagCounts: Record<string, number> = {};
        for (const o of orbs) for (const t of o.tags) tagCounts[t] = (tagCounts[t] || 0) + 1;
        return Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([tag]) => tag);
    }, [orbs]);

    return (
        <View style={styles.viewContainer}>
            <ThemedText style={styles.sectionTitle}>
                {orbs.length} captures selected
            </ThemedText>
            <ThemedText style={styles.dateText}>{dateRange}</ThemedText>

            <View style={styles.breakdownRow}>
                {moodBreakdown.map((m) => (
                    <View key={m.label} style={styles.breakdownItem}>
                        <View style={[styles.moodDotSmall, { backgroundColor: m.color }]} />
                        <ThemedText style={styles.breakdownText}>
                            {m.label} ({Math.round((m.count / orbs.length) * 100)}%)
                        </ThemedText>
                    </View>
                ))}
            </View>

            {topTags.length > 0 && (
                <View style={styles.tagsRow}>
                    {topTags.map((tag) => (
                        <View key={tag} style={styles.tagChip}>
                            <ThemedText style={styles.tagText}>{tag}</ThemedText>
                        </View>
                    ))}
                </View>
            )}

            <View style={styles.actionsRow}>
                <ExplainButton onPress={onExplain} isPro={isPro} label="Talk About Selection" />
            </View>
        </View>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cluster View
// ─────────────────────────────────────────────────────────────────────────────

function ClusterView({
    cluster,
    onIsolate,
    onExplain,
    isPro,
}: {
    cluster: GalaxyCluster;
    onIsolate: () => void;
    onExplain: () => void;
    isPro: boolean;
}) {
    const moodBreakdown = useMemo(() => {
        const counts: Record<string, { label: string; color: string; count: number }> = {};
        for (const o of cluster.orbs) {
            if (!counts[o.moodId]) counts[o.moodId] = { label: o.moodLabel, color: o.colorSolid, count: 0 };
            counts[o.moodId].count++;
        }
        return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 4);
    }, [cluster.orbs]);

    const dateRange = useMemo(() => {
        if (cluster.orbs.length === 0) return '';
        const sorted = [...cluster.orbs].sort((a, b) => a.timestamp - b.timestamp);
        const first = format(new Date(sorted[0].timestamp), 'MMM d');
        const last = format(new Date(sorted[sorted.length - 1].timestamp), 'MMM d');
        return `${first} – ${last}`;
    }, [cluster.orbs]);

    return (
        <View style={styles.viewContainer}>
            <ThemedText style={styles.sectionTitle}>{cluster.label} cluster</ThemedText>
            <ThemedText style={styles.dateText}>
                {cluster.orbs.length} captures · {dateRange}
            </ThemedText>

            <View style={styles.breakdownRow}>
                {moodBreakdown.map((m) => (
                    <View key={m.label} style={styles.breakdownItem}>
                        <View style={[styles.moodDotSmall, { backgroundColor: m.color }]} />
                        <ThemedText style={styles.breakdownText}>
                            {m.label} ({m.count})
                        </ThemedText>
                    </View>
                ))}
            </View>

            <View style={styles.actionsRow}>
                <TouchableOpacity style={styles.actionBtn} onPress={onIsolate}>
                    <Filter size={14} color="rgba(255,255,255,0.5)" />
                    <ThemedText style={styles.actionText}>Isolate Cluster</ThemedText>
                </TouchableOpacity>

                <ExplainButton onPress={onExplain} isPro={isPro} />
            </View>
        </View>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    sheetBg: {
        backgroundColor: '#0a0a10',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
    },
    handle: {
        backgroundColor: 'rgba(255,255,255,0.15)',
        width: 36,
    },
    content: {
        flex: 1,
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    closeBtn: {
        position: 'absolute',
        right: 16,
        top: 0,
        padding: 4,
        zIndex: 1,
    },
    viewContainer: {
        gap: 12,
        paddingTop: 4,
    },
    moodRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    moodDot: {
        width: 14,
        height: 14,
        borderRadius: 7,
    },
    moodDotSmall: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    moodLabel: {
        fontSize: 20,
        fontWeight: '700',
        color: '#fff',
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
    },
    dateText: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.4)',
    },
    tagsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    tagChip: {
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    tagText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.5)',
    },
    noteText: {
        fontSize: 14,
        lineHeight: 20,
        color: 'rgba(255,255,255,0.55)',
    },
    breakdownRow: {
        gap: 6,
    },
    breakdownItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    breakdownText: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.55)',
    },
    actionsRow: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 4,
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    actionBtnActive: {
        borderColor: 'rgba(168, 85, 247, 0.3)',
        backgroundColor: 'rgba(168, 85, 247, 0.08)',
    },
    actionBtnExplain: {
        borderColor: 'rgba(139, 34, 82, 0.25)',
        backgroundColor: 'rgba(139, 34, 82, 0.06)',
    },
    actionText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.5)',
    },
    actionTextActive: {
        color: '#a855f7',
    },
    actionTextExplain: {
        fontSize: 12,
        color: '#8B2252',
    },
    actionTextDisabled: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.2)',
    },
});

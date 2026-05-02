import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, Text, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle as SvgCircle, Polyline } from 'react-native-svg';
import type { Topic, TopicStats } from '@/lib/topicStore';
import { useTopicStore } from '@/lib/topicStore';
import type { MoodSegment } from '@/lib/dailyMoodFlows';
import { getMoodTheme } from '@/lib/moods';
import { AiToneId, getToneDefinition, isPresetTone } from '@/lib/aiTone';
import { ToneSelector } from '@/components/insights/ToneSelector';
import { useCustomTones } from '@/hooks/useCustomTones';

interface MetaPanelProps {
    topic: Topic;
    stats: TopicStats;
    onClose: () => void;
}

// ── Trend helpers ─────────────────────────────────────────────

function getTrendColor(trend: number): string {
    if (trend > 0.05) return '#6fca7d';
    if (trend < -0.05) return '#e8935a';
    return 'rgba(255,255,255,0.55)';
}

function getTrendArrow(trend: number): string {
    if (trend > 0.05) return '↗';
    if (trend < -0.05) return '↘';
    return '→';
}

// ── Recent Pattern Chart ──────────────────────────────────────

function RecentPatternChart({ spark, trendColor }: { spark: number[]; trendColor: string }) {
    const { width } = useWindowDimensions();
    const W = width - 36 - 28; // card width accounting for panel margins + card padding
    const H = 52;
    const PAD_X = 8;
    const PAD_Y = 8;

    const dataPoints = useMemo(() => {
        return spark
            .map((v, i) => ({ v, i }))
            .filter(p => p.v > 0);
    }, [spark]);

    if (dataPoints.length < 2) {
        return (
            <Text style={styles.sectionEmpty}>
                Log a few reflections to reveal the pattern
            </Text>
        );
    }

    const values = dataPoints.map(p => p.v);
    const indices = dataPoints.map(p => p.i);
    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    const range = Math.max(0.5, maxV - minV);
    const totalSpan = spark.length - 1;

    const toXY = (idx: number, v: number) => ({
        x: PAD_X + (idx / totalSpan) * (W - PAD_X * 2),
        y: PAD_Y + (1 - (v - minV) / range) * (H - PAD_Y * 2),
    });

    const pts = dataPoints.map(p => toXY(p.i, p.v));
    const polyline = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const last = pts[pts.length - 1];

    return (
        <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
            {/* Soft line */}
            <Polyline
                points={polyline}
                fill="none"
                stroke={trendColor}
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.55}
            />
            {/* Dots at each data point */}
            {pts.map((p, i) => (
                <SvgCircle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={i === pts.length - 1 ? 4 : 2.5}
                    fill={i === pts.length - 1 ? trendColor : 'rgba(255,255,255,0.25)'}
                    opacity={i === pts.length - 1 ? 1 : 0.7}
                />
            ))}
            {/* Highlight ring on newest point */}
            <SvgCircle
                cx={last.x}
                cy={last.y}
                r={7}
                fill="none"
                stroke={trendColor}
                strokeWidth={1}
                opacity={0.25}
            />
        </Svg>
    );
}

// ── Topic Mood Flow Bar ───────────────────────────────────────

function buildFlowGradient(segments: MoodSegment[]): [string, string, ...string[]] {
    if (!segments.length) return ['#2a2a3a', '#1a1a2a'];
    if (segments.length === 1) {
        const s = segments[0];
        return [
            s.gradientFrom || s.color,
            s.gradientMid || s.color,
            s.gradientTo || s.color,
        ];
    }
    const colors: string[] = [];
    segments.forEach((s, idx) => {
        colors.push(s.gradientFrom || s.color);
        colors.push(s.gradientMid || s.color);
        if (idx < segments.length - 1) colors.push(s.gradientTo || s.color);
    });
    const last = segments[segments.length - 1];
    colors.push(last.gradientTo || last.color);
    return colors as [string, string, ...string[]];
}

function TopicMoodFlowBar({ segments }: { segments: MoodSegment[] }) {
    const gradientColors = useMemo(() => buildFlowGradient(segments), [segments]);

    if (!segments.length) {
        return (
            <Text style={styles.sectionEmpty}>
                Topic mood flow appears after your first mood check-ins
            </Text>
        );
    }

    const top2 = segments.slice(0, 2);

    return (
        <View style={styles.flowBarContent}>
            <View style={styles.gradientWrapper}>
                <LinearGradient
                    colors={gradientColors}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={styles.gradientBar}
                />
            </View>
            <View style={styles.flowLegend}>
                {top2.map(s => (
                    <View key={s.moodId || s.mood} style={styles.flowLegendItem}>
                        <View style={[styles.flowDot, { backgroundColor: s.color }]} />
                        <Text style={styles.flowLegendMood} numberOfLines={1}>
                            {s.mood}
                        </Text>
                        <Text style={styles.flowLegendPct}>
                            {Math.round(s.percentage)}%
                        </Text>
                    </View>
                ))}
            </View>
        </View>
    );
}

// ── Stat tile ────────────────────────────────────────────────

function StatTile({ label, value, suffix, accent, subtitle }: {
    label: string;
    value: string;
    suffix?: string;
    accent?: React.ReactNode;
    subtitle?: string;
}) {
    return (
        <View style={styles.statTile}>
            <Text style={styles.statLabel}>{label}</Text>
            <View style={styles.statValueRow}>
                <Text style={styles.statValue}>{value}</Text>
                {suffix && <Text style={styles.statSuffix}>{suffix}</Text>}
                {accent}
            </View>
            {subtitle && <Text style={styles.statSubtitle}>{subtitle}</Text>}
        </View>
    );
}

// ── Wide meta card ───────────────────────────────────────────

function MetaCard({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
    return (
        <View style={styles.metaCard}>
            <Text style={styles.metaCardLabel}>{label}</Text>
            <Text style={[styles.metaCardValue, valueColor ? { color: valueColor } : null]} numberOfLines={1}>
                {value}
            </Text>
        </View>
    );
}

// ── Sparkle icon ─────────────────────────────────────────────

function SparkleIcon() {
    return (
        <Svg width={14} height={14} viewBox="0 0 16 16" fill="none">
            <Path
                d="M8 1.5l1.4 3.6L13 6.5l-3.6 1.4L8 11.5 6.6 7.9 3 6.5l3.6-1.4L8 1.5z"
                fill="#0b0c10"
            />
            <SvgCircle cx={13} cy={12} r={1} fill="#0b0c10" />
            <SvgCircle cx={3.5} cy={12.5} r={0.7} fill="#0b0c10" opacity={0.6} />
        </Svg>
    );
}

// ── Main panel ────────────────────────────────────────────────

export function MetaPanel({ topic, stats, onClose }: MetaPanelProps) {
    const trendColor = getTrendColor(stats.moodTrend);
    const trendArrow = getTrendArrow(stats.moodTrend);
    const moodDisplay = stats.moodAvg > 0 ? stats.moodAvg.toFixed(1) : '—';
    const mostFeltDisplay = stats.mostFelt === '—' ? 'Not enough entries' : stats.mostFelt;
    const lastLoggedDisplay = stats.lastLogged === 'Never' ? 'No entries yet' : stats.lastLogged;

    // ── Tone ─────────────────────────────────────────────────────
    const updateTopicTone = useTopicStore(s => s.updateTopicTone);
    const { tones: customTones } = useCustomTones();
    const [toneSelectorVisible, setToneSelectorVisible] = useState(false);
    const activeToneId = (topic.toneId ?? 'neutral') as AiToneId;
    const activeToneName = isPresetTone(activeToneId)
        ? getToneDefinition(activeToneId).label
        : (customTones.find(t => t.id === activeToneId)?.name ?? 'Custom');

    const translateY = useSharedValue(8);
    const opacity = useSharedValue(0);

    useEffect(() => {
        opacity.value = withTiming(1, { duration: 540, easing: Easing.bezier(0.22, 1, 0.36, 1) });
        translateY.value = withTiming(0, { duration: 540, easing: Easing.bezier(0.22, 1, 0.36, 1) });
    }, []);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ translateY: translateY.value }],
    }));

    return (
        <Animated.View style={[styles.container, animatedStyle]}>
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* ── Title row ── */}
                <View style={styles.titleRow}>
                    <View style={{ flex: 1 }}>
                        <View style={styles.titleChipRow}>
                            <Text style={styles.topicTitle}>{topic.title}</Text>
                            {stats.impact ? (
                                <View style={styles.impactChip}>
                                    <Text style={[styles.impactText, { color: trendColor }]}>
                                        {stats.impact}
                                    </Text>
                                </View>
                            ) : null}
                        </View>
                        {topic.description ? (
                            <Text style={styles.topicDescription}>{topic.description}</Text>
                        ) : null}
                    </View>
                    <Pressable onPress={onClose} style={styles.closeBtn}>
                        <Text style={styles.closeBtnText}>{'✕'}</Text>
                    </Pressable>
                </View>

                {/* ── Tone row ── */}
                <Pressable style={styles.toneRow} onPress={() => setToneSelectorVisible(true)}>
                    <Text style={styles.toneRowLabel}>TONE</Text>
                    <View style={styles.toneRowRight}>
                        <Text style={styles.toneRowValue}>{activeToneName}</Text>
                        <Text style={styles.toneRowChevron}>›</Text>
                    </View>
                </Pressable>

                {/* ── Stat row 1: Mood avg · Streak · Active ── */}
                <View style={styles.statsRow}>
                    <StatTile
                        label="Mood avg"
                        value={moodDisplay}
                        accent={
                            stats.moodAvg > 0 ? (
                                <Text style={{ color: trendColor, fontWeight: '600', marginLeft: 4, fontSize: 16 }}>
                                    {trendArrow}
                                </Text>
                            ) : undefined
                        }
                        subtitle={stats.moodAvg === 0 ? 'No data yet' : undefined}
                    />
                    <StatTile
                        label="Streak"
                        value={`${stats.streak}`}
                        suffix="d"
                    />
                    <StatTile
                        label="Active"
                        value={`${stats.activeDaysThisWeek}`}
                        suffix={`/${stats.weekTotal}`}
                        subtitle="this week"
                    />
                </View>

                {/* ── Stat row 2: Most felt · Last logged ── */}
                <View style={styles.metaCardRow}>
                    <MetaCard
                        label="Most felt"
                        value={mostFeltDisplay}
                        valueColor={
                            stats.mostFelt !== '—'
                                ? getMoodTheme(stats.mostFelt).solid
                                : undefined
                        }
                    />
                    <View style={styles.metaCardDivider} />
                    <MetaCard label="Last logged" value={lastLoggedDisplay} />
                </View>

                {/* ── Recent pattern ── */}
                <View style={styles.sectionCard}>
                    <Text style={styles.sectionLabel}>Recent pattern</Text>
                    <RecentPatternChart spark={stats.spark} trendColor={trendColor} />
                </View>

                {/* ── Topic mood flow ── */}
                <View style={styles.sectionCard}>
                    <Text style={styles.sectionLabel}>Topic mood flow</Text>
                    <TopicMoodFlowBar segments={stats.moodSegments} />
                </View>

                {/* ── CTAs ── */}
                <View style={styles.ctaStack}>
                    <Pressable style={styles.ctaSecondary}>
                        <View style={styles.ctaLeft}>
                            <View style={styles.ctaPlusChip}>
                                <Text style={styles.ctaPlusGlyph}>+</Text>
                            </View>
                            <Text style={styles.ctaSecondaryLabel}>Log today</Text>
                        </View>
                        <Text style={styles.ctaCaption}>mood {'·'} note {'·'} progress</Text>
                    </Pressable>

                    <Pressable style={styles.ctaPrimary}>
                        <LinearGradient
                            colors={['rgba(255,255,255,0.96)', 'rgba(232,234,240,0.92)']}
                            start={{ x: 0.5, y: 0 }}
                            end={{ x: 0.5, y: 1 }}
                            style={[StyleSheet.absoluteFillObject, { borderRadius: 16 }]}
                        />
                        <View style={[styles.ctaLeft, { zIndex: 1 }]}>
                            <View style={styles.ctaSparkleChip}>
                                <SparkleIcon />
                            </View>
                            <Text style={styles.ctaPrimaryLabel}>Generate insight</Text>
                        </View>
                        <Text style={[styles.ctaPrimaryCaption, { zIndex: 1 }]}>
                            {activeToneName !== 'Neutral' ? `${activeToneName} · ` : ''}from your reflections
                        </Text>
                    </Pressable>
                </View>
            </ScrollView>

            <ToneSelector
                visible={toneSelectorVisible}
                onClose={() => setToneSelectorVisible(false)}
                currentToneId={activeToneId}
                onSelectTone={(toneId) => {
                    updateTopicTone(topic.id, toneId);
                    setToneSelectorVisible(false);
                }}
            />
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 96 + 168 + 26,
        left: 18,
        right: 18,
        bottom: 0,
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        gap: 10,
        flexGrow: 1,
        paddingBottom: 4,
    },

    // ── Title ──────────────────────────────────────────────────
    titleRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
        paddingHorizontal: 4,
    },
    titleChipRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
    },
    topicTitle: {
        fontSize: 22,
        fontWeight: '600',
        color: '#fff',
        letterSpacing: -0.3,
        lineHeight: 26,
    },
    impactChip: {
        paddingVertical: 3,
        paddingHorizontal: 8,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    impactText: {
        fontSize: 10.5,
        fontWeight: '600',
        letterSpacing: 0.6,
        textTransform: 'uppercase',
    },
    topicDescription: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.55)',
        marginTop: 4,
        lineHeight: 19,
    },
    closeBtn: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    closeBtnText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 14,
    },

    // ── Tone row ───────────────────────────────────────────────
    toneRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    toneRowLabel: {
        fontSize: 10,
        fontWeight: '600',
        letterSpacing: 1.0,
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.38)',
    },
    toneRowRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    toneRowValue: {
        fontSize: 13,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.75)',
        letterSpacing: -0.1,
    },
    toneRowChevron: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.3)',
        marginTop: -1,
    },

    // ── Stat row 1 ─────────────────────────────────────────────
    statsRow: {
        flexDirection: 'row',
        gap: 8,
    },
    statTile: {
        flex: 1,
        padding: 11,
        paddingBottom: 10,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    statLabel: {
        fontSize: 10,
        fontWeight: '600',
        letterSpacing: 1.0,
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.38)',
    },
    statValueRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        flexWrap: 'wrap',
        marginTop: 3,
    },
    statValue: {
        fontSize: 22,
        fontWeight: '600',
        color: '#fff',
        letterSpacing: -0.5,
    },
    statSuffix: {
        fontSize: 13,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.5)',
        marginLeft: 2,
    },
    statSubtitle: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.38)',
        marginTop: 2,
        letterSpacing: 0.2,
    },

    // ── Stat row 2 (meta cards) ────────────────────────────────
    metaCardRow: {
        flexDirection: 'row',
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        overflow: 'hidden',
    },
    metaCard: {
        flex: 1,
        padding: 12,
        paddingHorizontal: 14,
    },
    metaCardDivider: {
        width: 1,
        backgroundColor: 'rgba(255,255,255,0.06)',
        marginVertical: 10,
    },
    metaCardLabel: {
        fontSize: 10,
        fontWeight: '600',
        letterSpacing: 1.0,
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.38)',
    },
    metaCardValue: {
        fontSize: 15,
        fontWeight: '500',
        color: '#fff',
        marginTop: 4,
        letterSpacing: -0.2,
    },

    // ── Section card (pattern + flow) ─────────────────────────
    sectionCard: {
        padding: 12,
        paddingHorizontal: 14,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        gap: 10,
    },
    sectionLabel: {
        fontSize: 10,
        fontWeight: '600',
        letterSpacing: 1.0,
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.38)',
    },
    sectionEmpty: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.35)',
        fontStyle: 'italic',
        lineHeight: 17,
    },

    // ── Mood flow bar ──────────────────────────────────────────
    flowBarContent: {
        gap: 8,
    },
    gradientWrapper: {
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 999,
        padding: 5,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
    },
    gradientBar: {
        height: 10,
        borderRadius: 999,
    },
    flowLegend: {
        flexDirection: 'row',
        gap: 14,
    },
    flowLegendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    flowDot: {
        width: 7,
        height: 7,
        borderRadius: 4,
    },
    flowLegendMood: {
        fontSize: 11.5,
        color: 'rgba(255,255,255,0.65)',
        fontWeight: '500',
        textTransform: 'capitalize',
    },
    flowLegendPct: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.35)',
        fontWeight: '500',
    },

    // ── CTAs ───────────────────────────────────────────────────
    ctaStack: {
        gap: 10,
        marginTop: 'auto',
        paddingTop: 2,
    },
    ctaSecondary: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 14,
        paddingHorizontal: 16,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.07)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
    },
    ctaLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    ctaPlusChip: {
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: 'rgba(255,255,255,0.10)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    ctaPlusGlyph: {
        fontSize: 18,
        fontWeight: '400',
        color: '#fff',
    },
    ctaSecondaryLabel: {
        fontSize: 15,
        fontWeight: '500',
        color: '#fff',
        letterSpacing: -0.1,
    },
    ctaCaption: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.5)',
    },
    ctaPrimary: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 15,
        paddingHorizontal: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.6)',
        overflow: 'hidden',
        shadowColor: '#FFFFFF',
        shadowOpacity: 0.10,
        shadowRadius: 28,
        shadowOffset: { width: 0, height: 10 },
    },
    ctaSparkleChip: {
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: 'rgba(11,12,16,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    ctaPrimaryLabel: {
        fontSize: 15,
        fontWeight: '600',
        color: '#0b0c10',
        letterSpacing: -0.1,
    },
    ctaPrimaryCaption: {
        fontSize: 12,
        color: 'rgba(11,12,16,0.55)',
        fontWeight: '500',
    },
});

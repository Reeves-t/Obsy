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
import type { Topic, TopicStats, TopicNote } from '@/lib/topicStore';
import { useTopicStore } from '@/lib/topicStore';
import type { MoodSegment } from '@/lib/dailyMoodFlows';
import { getMoodTheme } from '@/lib/moods';
import { AiToneId, getToneDefinition, isPresetTone } from '@/lib/aiTone';
import { ToneSelector } from '@/components/insights/ToneSelector';
import { useCustomTones } from '@/hooks/useCustomTones';
import { useSubscription } from '@/hooks/useSubscription';
import { VanguardPaywall } from '@/components/paywall/VanguardPaywall';
import { TopicInsightModal } from '@/components/topics/TopicInsightModal';
import { MissingGapsModal } from '@/components/topics/MissingGapsModal';
import * as Haptics from 'expo-haptics';

interface MetaPanelProps {
    topic: Topic;
    stats: TopicStats;
    onClose: () => void;
    onAddEntry?: () => void;
    onAskObsy?: () => void;
    onBrowseEntries?: () => void;
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
    const W = width - 36 - 28;
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
            <Polyline
                points={polyline}
                fill="none"
                stroke={trendColor}
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.55}
            />
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

// ── Gap icon ────────────────────────────────────────────────

function GapIcon() {
    return (
        <Svg width={14} height={14} viewBox="0 0 16 16" fill="none">
            <Path
                d="M3 3h4v4H3V3zm6 0h4v4H9V3zM3 9h4v4H3V9zm6 3h4M9 10v3"
                stroke="rgba(255,255,255,0.85)"
                strokeWidth={1.4}
                strokeLinecap="round"
            />
        </Svg>
    );
}

// ── Chat bubble icon ─────────────────────────────────────────

function ChatBubbleIcon() {
    return (
        <Svg width={14} height={14} viewBox="0 0 16 16" fill="none">
            <Path
                d="M2 3.5C2 2.67 2.67 2 3.5 2h9C13.33 2 14 2.67 14 3.5v6c0 .83-.67 1.5-1.5 1.5H5.5L2 14V3.5z"
                fill="rgba(255,255,255,0.85)"
            />
        </Svg>
    );
}

// ── Notes section ────────────────────────────────────────────

const NOTE_PREVIEW_LINES = 2;

function NoteItem({ note, onRemove }: { note: TopicNote; onRemove: (id: string) => void }) {
    const kind = note.kind ?? 'note';
    const isInsight = kind === 'insight';
    const isGaps = kind === 'missing_gaps';
    const isCollapsible = isInsight || isGaps;
    const [expanded, setExpanded] = useState(false);
    const date = new Date(note.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
    });

    const handleRemove = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onRemove(note.id);
    };

    return (
        <View style={styles.noteItem}>
            <Pressable
                onPress={isCollapsible ? () => setExpanded(e => !e) : undefined}
                style={{ flex: 1 }}
            >
                <View style={styles.noteHeaderRow}>
                    {isInsight && (
                        <View style={styles.insightBadge}>
                            <Text style={styles.insightBadgeText}>INSIGHT</Text>
                        </View>
                    )}
                    {isGaps && (
                        <View style={styles.gapsBadge}>
                            <Text style={styles.gapsBadgeText}>GAPS</Text>
                        </View>
                    )}
                    <Text style={styles.noteDate}>{date}</Text>
                </View>
                <Text
                    style={styles.noteText}
                    numberOfLines={isCollapsible && !expanded ? NOTE_PREVIEW_LINES : undefined}
                >
                    {note.text}
                </Text>
                {isCollapsible && (
                    <Text style={styles.noteToggle}>
                        {expanded ? 'Tap to collapse' : 'Tap to expand'}
                    </Text>
                )}
            </Pressable>
            {isCollapsible && (
                <Pressable
                    onPress={handleRemove}
                    style={styles.noteRemoveBtn}
                    hitSlop={8}
                    accessibilityLabel={`Remove ${isGaps ? 'gap analysis' : 'insight'} from feed`}
                >
                    <Text style={styles.noteRemoveGlyph}>✕</Text>
                </Pressable>
            )}
        </View>
    );
}

// ── Main panel ────────────────────────────────────────────────

export function MetaPanel({ topic, stats, onClose, onAddEntry, onAskObsy, onBrowseEntries }: MetaPanelProps) {
    const trendColor = getTrendColor(stats.moodTrend);
    const trendArrow = getTrendArrow(stats.moodTrend);
    const moodDisplay = stats.moodAvg > 0 ? stats.moodAvg.toFixed(1) : '—';
    const mostFeltDisplay = stats.mostFelt === '—' ? 'Not enough entries' : stats.mostFelt;
    const lastLoggedDisplay = stats.lastLogged === 'Never' ? 'No entries yet' : stats.lastLogged;

    // ── Tone ─────────────────────────────────────────────────────
    const updateTopicTone = useTopicStore(s => s.updateTopicTone);
    // Subscribe directly to topicNotes so the panel re-renders when notes
    // or insights are added/removed from anywhere in the app.
    const topicNotes = useTopicStore(s => s.topicNotes);
    const removeTopicNote = useTopicStore(s => s.removeTopicNote);
    const { tones: customTones } = useCustomTones();
    const [toneSelectorVisible, setToneSelectorVisible] = useState(false);
    const [insightModalVisible, setInsightModalVisible] = useState(false);
    const [gapsModalVisible, setGapsModalVisible] = useState(false);
    const activeToneId = (topic.toneId ?? 'neutral') as AiToneId;
    const activeToneName = isPresetTone(activeToneId)
        ? getToneDefinition(activeToneId).label
        : (customTones.find(t => t.id === activeToneId)?.name ?? 'Custom');

    // ── Premium gate ─────────────────────────────────────────────
    const { checkLimit, tier } = useSubscription();
    const [showPaywall, setShowPaywall] = useState(false);

    const handleAskObsy = async () => {
        const allowed = checkLimit('topic_chat');
        if (!allowed) {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            setShowPaywall(true);
            return;
        }
        onAskObsy?.();
    };

    const handleGenerateInsight = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setInsightModalVisible(true);
    };

    const handleFindMissingGaps = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setGapsModalVisible(true);
    };

    // ── Notes ─────────────────────────────────────────────────────
    const savedNotes = useMemo(
        () => topicNotes.filter(n => n.topicId === topic.id),
        [topic.id, topicNotes],
    );

    // ── Entry animation ───────────────────────────────────────────
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

                {/* ── Notes section ── */}
                {savedNotes.length > 0 && (
                    <View style={styles.sectionCard}>
                        <Text style={styles.sectionLabel}>Notes</Text>
                        <View style={styles.notesList}>
                            {savedNotes.slice(0, 5).map(note => (
                                <NoteItem key={note.id} note={note} onRemove={removeTopicNote} />
                            ))}
                        </View>
                    </View>
                )}

                {/* ── CTAs ── */}
                <View style={styles.ctaStack}>
                    {/* Add entry */}
                    <Pressable style={styles.ctaSecondary} onPress={onAddEntry}>
                        <View style={styles.ctaLeft}>
                            <View style={styles.ctaPlusChip}>
                                <Text style={styles.ctaPlusGlyph}>+</Text>
                            </View>
                            <Text style={styles.ctaSecondaryLabel}>Add entry</Text>
                        </View>
                        <Text style={styles.ctaCaption}>voice {'·'} journal {'·'} mood {'·'} capture</Text>
                    </Pressable>

                    {/* Browse entries */}
                    {onBrowseEntries && (
                        <Pressable style={styles.ctaBrowse} onPress={onBrowseEntries}>
                            <View style={styles.ctaLeft}>
                                <View style={styles.ctaBrowseChip}>
                                    <Text style={styles.ctaBrowseChipGlyph}>▤</Text>
                                </View>
                                <Text style={styles.ctaBrowseLabel}>Browse entries</Text>
                            </View>
                            <Text style={styles.ctaBrowseCaption}>
                                {stats.totalEntries + savedNotes.length}
                            </Text>
                        </Pressable>
                    )}

                    {/* Generate insight */}
                    <Pressable style={styles.ctaPrimary} onPress={handleGenerateInsight}>
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

                    {/* Find missing gaps */}
                    <Pressable style={styles.ctaGaps} onPress={handleFindMissingGaps}>
                        <View style={styles.ctaLeft}>
                            <View style={styles.ctaGapsChip}>
                                <GapIcon />
                            </View>
                            <Text style={styles.ctaGapsLabel}>Find missing gaps</Text>
                        </View>
                        <Text style={styles.ctaGapsCaption}>meta-cognition</Text>
                    </Pressable>

                    {/* Ask Obsy — premium only */}
                    <Pressable style={styles.ctaAskObsy} onPress={handleAskObsy}>
                        <View style={styles.ctaLeft}>
                            <View style={styles.ctaChatChip}>
                                <ChatBubbleIcon />
                            </View>
                            <Text style={styles.ctaAskObsyLabel}>Ask Obsy</Text>
                        </View>
                        <Text style={styles.ctaAskObsyCaption}>
                            {tier === 'founder' || tier === 'subscriber' ? `about ${topic.title}` : 'Plus'}
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

            <VanguardPaywall
                visible={showPaywall}
                onClose={() => setShowPaywall(false)}
                featureName="topic_chat"
            />

            <TopicInsightModal
                visible={insightModalVisible}
                topic={topic}
                stats={stats}
                toneLabel={activeToneName}
                onClose={() => setInsightModalVisible(false)}
            />

            <MissingGapsModal
                visible={gapsModalVisible}
                topic={topic}
                stats={stats}
                onClose={() => setGapsModalVisible(false)}
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

    // ── Section card (pattern + flow + notes) ─────────────────
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

    // ── Notes list ─────────────────────────────────────────────
    notesList: {
        gap: 8,
    },
    noteItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        gap: 6,
    },
    noteHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },
    insightBadge: {
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderRadius: 4,
        backgroundColor: 'rgba(139,34,82,0.30)',
        borderWidth: 1,
        borderColor: 'rgba(139,34,82,0.50)',
    },
    insightBadgeText: {
        fontSize: 8.5,
        fontWeight: '700',
        letterSpacing: 0.6,
        color: 'rgba(255,210,225,0.95)',
    },
    gapsBadge: {
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderRadius: 4,
        backgroundColor: 'rgba(70,90,140,0.32)',
        borderWidth: 1,
        borderColor: 'rgba(120,150,210,0.55)',
    },
    gapsBadgeText: {
        fontSize: 8.5,
        fontWeight: '700',
        letterSpacing: 0.6,
        color: 'rgba(200,220,255,0.95)',
    },
    noteText: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.75)',
        lineHeight: 19,
        fontWeight: '400',
    },
    noteDate: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.30)',
        fontWeight: '500',
        letterSpacing: 0.2,
        textTransform: 'uppercase',
    },
    noteToggle: {
        fontSize: 10.5,
        color: 'rgba(255,255,255,0.4)',
        marginTop: 4,
        letterSpacing: 0.2,
    },
    noteRemoveBtn: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 2,
    },
    noteRemoveGlyph: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.55)',
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

    // ── Ask Obsy CTA ───────────────────────────────────────────
    ctaAskObsy: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 14,
        paddingHorizontal: 16,
        borderRadius: 16,
        backgroundColor: 'rgba(139,34,82,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(139,34,82,0.28)',
    },
    ctaChatChip: {
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: 'rgba(139,34,82,0.20)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    ctaAskObsyLabel: {
        fontSize: 15,
        fontWeight: '500',
        color: '#fff',
        letterSpacing: -0.1,
    },
    ctaAskObsyCaption: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.45)',
        fontWeight: '500',
    },
    ctaGaps: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 14,
        paddingHorizontal: 16,
        borderRadius: 16,
        backgroundColor: 'rgba(70,90,140,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(120,150,210,0.30)',
    },
    ctaGapsChip: {
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: 'rgba(70,90,140,0.30)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    ctaGapsLabel: {
        fontSize: 15,
        fontWeight: '500',
        color: '#fff',
        letterSpacing: -0.1,
    },
    ctaGapsCaption: {
        fontSize: 12,
        color: 'rgba(200,220,255,0.55)',
        fontWeight: '500',
        letterSpacing: 0.2,
    },
    ctaBrowse: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 14,
        paddingHorizontal: 16,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
    },
    ctaBrowseChip: {
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    ctaBrowseChipGlyph: {
        color: 'rgba(255,255,255,0.85)',
        fontSize: 14,
        lineHeight: 16,
    },
    ctaBrowseLabel: {
        fontSize: 15,
        fontWeight: '500',
        color: '#fff',
        letterSpacing: -0.1,
    },
    ctaBrowseCaption: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.55)',
        fontWeight: '600',
    },
});

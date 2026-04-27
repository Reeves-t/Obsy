import React, { useEffect } from 'react';
import { StyleSheet, View, Text, Pressable, ScrollView } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withDelay,
    Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle as SvgCircle } from 'react-native-svg';
import { Sparkline } from './Sparkline';
import type { Topic, TopicStats } from '@/lib/topicStore';

interface MetaPanelProps {
    topic: Topic;
    stats: TopicStats;
    onClose: () => void;
}

// ── Trend helpers ─────────────────────────────────────────────

function getTrendColor(trend: number): string {
    if (trend > 0.05) return '#6fca7d';   // soft green
    if (trend < -0.05) return '#e8935a';   // soft warm orange
    return 'rgba(255,255,255,0.55)';
}

function getTrendArrow(trend: number): string {
    if (trend > 0.05) return '\u2197';
    if (trend < -0.05) return '\u2198';
    return '\u2192';
}

// ── Sub-components ────────────────────────────────────────────

function StatTile({ label, value, suffix, accent, subtitle, extra }: {
    label: string;
    value: string;
    suffix?: string;
    accent?: React.ReactNode;
    subtitle?: string;
    extra?: React.ReactNode;
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
            {extra && <View style={{ marginTop: 6 }}>{extra}</View>}
        </View>
    );
}

function SoftMeta({ label, value }: { label: string; value: string }) {
    return (
        <View style={{ flex: 1 }}>
            <Text style={styles.softMetaLabel}>{label}</Text>
            <Text style={styles.softMetaValue} numberOfLines={1}>{value}</Text>
        </View>
    );
}

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

    // Slide-up animation
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
                {/* Title row */}
                <View style={styles.titleRow}>
                    <View style={{ flex: 1 }}>
                        <View style={styles.titleChipRow}>
                            <Text style={styles.topicTitle}>{topic.title}</Text>
                            {stats.impact ? (
                                <View style={[styles.impactChip, { borderColor: 'rgba(255,255,255,0.08)' }]}>
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
                        <Text style={styles.closeBtnText}>{'\u2715'}</Text>
                    </Pressable>
                </View>

                {/* Stats row */}
                <View style={styles.statsRow}>
                    <StatTile
                        label="Mood avg"
                        value={moodDisplay}
                        accent={
                            <Text style={{ color: trendColor, fontWeight: '600', marginLeft: 4, fontSize: 16 }}>
                                {trendArrow}
                            </Text>
                        }
                        extra={stats.spark.length >= 2 ? <Sparkline values={stats.spark} color={trendColor} /> : undefined}
                    />
                    <StatTile label="Streak" value={`${stats.streak}`} suffix="d" />
                    <StatTile
                        label="Active"
                        value={`${stats.activeDaysThisWeek}`}
                        suffix={`/${stats.weekTotal}`}
                        subtitle="this week"
                    />
                </View>

                {/* Soft meta strip */}
                <View style={styles.softMetaStrip}>
                    <SoftMeta label="Most felt" value={stats.mostFelt} />
                    <View style={styles.softMetaDivider} />
                    <SoftMeta label="Last logged" value={stats.lastLogged} />
                </View>

                {/* Last reflection */}
                {stats.lastNote ? (
                    <View style={styles.reflectionCard}>
                        <Text style={styles.reflectionLabel}>LAST REFLECTION</Text>
                        <Text style={styles.reflectionQuote}>
                            {'\u201C'}{stats.lastNote}{'\u201D'}
                        </Text>
                    </View>
                ) : null}

                {/* Spacer to push CTAs down */}
                <View style={{ flex: 1 }} />

                {/* CTAs */}
                <View style={styles.ctaStack}>
                    {/* Log today - secondary */}
                    <Pressable style={styles.ctaSecondary}>
                        <View style={styles.ctaLeft}>
                            <View style={styles.ctaPlusChip}>
                                <Text style={styles.ctaPlusGlyph}>+</Text>
                            </View>
                            <Text style={styles.ctaSecondaryLabel}>Log today</Text>
                        </View>
                        <Text style={styles.ctaCaption}>mood {'\u00B7'} note {'\u00B7'} progress</Text>
                    </Pressable>

                    {/* Generate insight - primary */}
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
                        <Text style={[styles.ctaPrimaryCaption, { zIndex: 1 }]}>from your reflections</Text>
                    </Pressable>
                </View>
            </ScrollView>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 96 + 168 + 26, // FOCUS_CIRCLE.topOffset + FOCUS_CIRCLE.size + 26
        left: 18,
        right: 18,
        bottom: 96,
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        gap: 12,
        flexGrow: 1,
    },
    // Title
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
    // Stats
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
        fontSize: 10.5,
        fontWeight: '600',
        letterSpacing: 1.1,
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.42)',
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
        fontSize: 10.5,
        color: 'rgba(255,255,255,0.42)',
        marginTop: 2,
        letterSpacing: 0.2,
    },
    // Soft meta
    softMetaStrip: {
        flexDirection: 'row',
        gap: 8,
        padding: 12,
        paddingHorizontal: 14,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    softMetaDivider: {
        width: 1,
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    softMetaLabel: {
        fontSize: 10.5,
        fontWeight: '600',
        letterSpacing: 1.1,
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.42)',
    },
    softMetaValue: {
        fontSize: 15,
        fontWeight: '500',
        color: '#fff',
        marginTop: 3,
        letterSpacing: -0.2,
    },
    // Reflection
    reflectionCard: {
        padding: 12,
        paddingHorizontal: 14,
        paddingBottom: 13,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    reflectionLabel: {
        fontSize: 10.5,
        fontWeight: '600',
        letterSpacing: 1.1,
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.42)',
        marginBottom: 6,
    },
    reflectionQuote: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.78)',
        lineHeight: 21,
        fontStyle: 'italic',
        letterSpacing: -0.1,
    },
    // CTAs
    ctaStack: {
        gap: 10,
        marginTop: 'auto',
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

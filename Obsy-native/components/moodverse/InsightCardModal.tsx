import React, { useState, useMemo, useCallback } from 'react';
import {
    Modal,
    View,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Text,
    ActivityIndicator,
    Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from '@/components/ui/ThemedText';
import { ToneSelector } from '@/components/insights/ToneSelector';
import { AI_TONES, type AiToneId } from '@/lib/aiTone';
import { useCustomTones } from '@/hooks/useCustomTones';
import { getCustomToneById } from '@/lib/customTone';
import type { Capture } from '@/types/capture';
import { callInsightCard, type CardType, type CardScope, type InsightCardResult } from '@/services/insightCardClient';
import { useInsightCardStore } from '@/lib/insightCardStore';
import { InsightCardView } from './InsightCardView';

// ─── Date helpers ──────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
    return d.toISOString().slice(0, 10);
}

function startOfWeek(d: Date): Date {
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.getFullYear(), d.getMonth(), diff);
}

function formatDisplayDate(iso: string): string {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

type DatePreset = 'this_week' | 'last_2_weeks' | 'this_month' | 'last_month' | 'custom';

function getPresetRange(preset: DatePreset): { from: string; to: string } {
    const now = new Date();
    const today = toDateStr(now);

    if (preset === 'this_week') {
        return { from: toDateStr(startOfWeek(now)), to: today };
    }
    if (preset === 'last_2_weeks') {
        const d = new Date(now);
        d.setDate(d.getDate() - 13);
        return { from: toDateStr(d), to: today };
    }
    if (preset === 'this_month') {
        return { from: toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
    }
    if (preset === 'last_month') {
        const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const last = new Date(now.getFullYear(), now.getMonth(), 0);
        return { from: toDateStr(first), to: toDateStr(last) };
    }
    // custom — caller manages
    return { from: today, to: today };
}

// ─── Props ─────────────────────────────────────────────────────────────────────

interface InsightCardModalProps {
    visible: boolean;
    onClose: () => void;
    allCaptures: Capture[];
}

// ─── Simple inline date stepper ────────────────────────────────────────────────

interface DateStepperProps {
    label: string;
    value: string;
    onChange: (iso: string) => void;
    min?: string;
    max?: string;
}

function DateStepper({ label, value, onChange, min, max }: DateStepperProps) {
    const bump = (days: number) => {
        const d = new Date(value + 'T00:00:00');
        d.setDate(d.getDate() + days);
        const next = toDateStr(d);
        if (min && next < min) return;
        if (max && next > max) return;
        onChange(next);
    };

    return (
        <View style={stepperStyles.row}>
            <Text style={stepperStyles.label}>{label}</Text>
            <View style={stepperStyles.controls}>
                <TouchableOpacity style={stepperStyles.btn} onPress={() => bump(-1)}>
                    <Ionicons name="chevron-back" size={16} color="rgba(255,255,255,0.7)" />
                </TouchableOpacity>
                <Text style={stepperStyles.value}>{formatDisplayDate(value)}</Text>
                <TouchableOpacity style={stepperStyles.btn} onPress={() => bump(1)}>
                    <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.7)" />
                </TouchableOpacity>
            </View>
        </View>
    );
}

const stepperStyles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 6,
    },
    label: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 13,
        fontWeight: '500',
    },
    controls: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    btn: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    value: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '600',
        minWidth: 120,
        textAlign: 'center',
    },
});

// ─── Main component ────────────────────────────────────────────────────────────

export function InsightCardModal({ visible, onClose, allCaptures }: InsightCardModalProps) {
    const insets = useSafeAreaInsets();
    const { tones: customTones } = useCustomTones();
    const { canGenerate, getRemainingGenerations, consumeGeneration, getCached, setCached } = useInsightCardStore();

    // Config state
    const [cardType, setCardType] = useState<CardType>('reflective');
    const [scope, setScope] = useState<CardScope>('all');
    const [moodFilter, setMoodFilter] = useState<string | null>(null);
    const [datePreset, setDatePreset] = useState<DatePreset>('this_month');
    const today = toDateStr(new Date());
    const [customFrom, setCustomFrom] = useState(today);
    const [customTo, setCustomTo] = useState(today);
    const [toneId, setToneId] = useState<AiToneId>('neutral');
    const [showToneSelector, setShowToneSelector] = useState(false);

    // UI state
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [generatedCard, setGeneratedCard] = useState<InsightCardResult | null>(null);

    // Derived date range
    const dateRange = useMemo(() => {
        if (datePreset === 'custom') return { from: customFrom, to: customTo };
        return getPresetRange(datePreset);
    }, [datePreset, customFrom, customTo]);

    // Filtered captures for the selected range + mood
    // All captures in the date range are included regardless of includeInInsights —
    // the card is a personal reflection tool, not the daily insights pipeline.
    const filteredCaptures = useMemo(() => {
        return allCaptures.filter((c) => {
            const day = c.created_at.slice(0, 10);
            if (day < dateRange.from || day > dateRange.to) return false;
            if (scope === 'specific' && moodFilter) {
                return c.mood_name_snapshot === moodFilter;
            }
            return true;
        });
    }, [allCaptures, dateRange, scope, moodFilter]);

    // Available moods in range (for specific scope picker)
    const availableMoodsInRange = useMemo(() => {
        const seen = new Set<string>();
        const moods: string[] = [];
        allCaptures.forEach((c) => {
            const day = c.created_at.slice(0, 10);
            if (day >= dateRange.from && day <= dateRange.to) {
                if (!seen.has(c.mood_name_snapshot)) {
                    seen.add(c.mood_name_snapshot);
                    moods.push(c.mood_name_snapshot);
                }
            }
        });
        return moods;
    }, [allCaptures, dateRange]);

    // Current tone label for display
    const toneName = useMemo(() => {
        if (toneId === 'neutral') return 'Neutral';
        const preset = AI_TONES.find((t) => t.id === toneId);
        if (preset) return preset.label;
        const custom = customTones.find((t) => t.id === toneId);
        return custom?.name ?? 'Custom';
    }, [toneId, customTones]);

    // Live preview summary
    const previewLine = useMemo(() => {
        const typePart = cardType === 'reflective' ? 'Reflective card' : 'Analytical card';
        const datePart = `${formatDisplayDate(dateRange.from)} – ${formatDisplayDate(dateRange.to)}`;
        const moodPart = scope === 'specific' && moodFilter ? ` for ${moodFilter}` : '';
        return `${typePart}${moodPart} · ${datePart} · ${toneName}`;
    }, [cardType, dateRange, scope, moodFilter, toneName]);

    const hasEnoughData = filteredCaptures.length >= 3;

    const handleGenerate = useCallback(async () => {
        if (!canGenerate()) {
            setError("You've reached today's generation limit. Try again tomorrow.");
            return;
        }

        setError(null);

        // Check cache first
        const cached = getCached(
            cardType, scope, moodFilter, dateRange.from, dateRange.to, toneId, filteredCaptures.length,
        );
        if (cached) {
            setGeneratedCard(cached);
            return;
        }

        setIsGenerating(true);

        try {
            // Resolve custom tone prompt if needed
            let customTonePrompt: string | undefined;
            const preset = AI_TONES.find((t) => t.id === toneId);
            if (!preset) {
                const ct = await getCustomToneById(toneId);
                customTonePrompt = ct?.prompt;
            }

            const captures = filteredCaptures.map((c) => ({
                mood: c.mood_name_snapshot,
                note: c.note ?? undefined,
                capturedAt: c.created_at,
                tags: c.tags ?? undefined,
            }));

            const response = await callInsightCard({
                cardType,
                scope,
                moodFilter: scope === 'specific' ? moodFilter : null,
                dateFrom: dateRange.from,
                dateTo: dateRange.to,
                tone: toneId,
                customTonePrompt,
                captures,
            });

            if (!response.ok) {
                if (response.error.stage === 'insufficient_data') {
                    setError('Not enough reflections yet for a meaningful card. Log more entries and try again.');
                } else {
                    setError(response.error.message || 'Something went wrong. Please try again.');
                }
                return;
            }

            consumeGeneration();
            setCached(cardType, scope, moodFilter, dateRange.from, dateRange.to, toneId, response, filteredCaptures.length);
            setGeneratedCard(response);
        } catch {
            setError('Something went wrong. Please try again.');
        } finally {
            setIsGenerating(false);
        }
    }, [canGenerate, getCached, setCached, consumeGeneration, cardType, scope, moodFilter, dateRange, toneId, filteredCaptures]);

    const handleClose = () => {
        setGeneratedCard(null);
        setError(null);
        onClose();
    };

    const handleRegenerate = () => {
        setGeneratedCard(null);
        setError(null);
    };

    const remaining = getRemainingGenerations();

    // ── If a card was generated, show the card view ─────────────────────────
    if (generatedCard) {
        return (
            <InsightCardView
                visible={visible}
                card={generatedCard}
                dateFrom={dateRange.from}
                dateTo={dateRange.to}
                toneId={toneId}
                scope={scope}
                moodFilter={scope === 'specific' ? moodFilter : null}
                onClose={handleClose}
                onRegenerate={handleRegenerate}
            />
        );
    }

    // ── Generator setup modal ───────────────────────────────────────────────
    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
            <View style={styles.overlay}>
                <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
                <TouchableOpacity style={styles.backdrop} onPress={handleClose} activeOpacity={1} />

                <View style={styles.sheet}>
                    {/* Drag indicator */}
                    <View style={styles.dragBar} />

                    {/* Header */}
                    <View style={styles.header}>
                        <View>
                            <Text style={styles.title}>Insight Card</Text>
                            <Text style={styles.subtitle}>Generate a shareable Moodverse card</Text>
                        </View>
                        <TouchableOpacity onPress={handleClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <Ionicons name="close" size={22} color="rgba(255,255,255,0.6)" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 20) + 16 }]} showsVerticalScrollIndicator={false}>

                        {/* ── Card type ─────────────────────────────── */}
                        <View style={styles.section}>
                            <Text style={styles.sectionLabel}>CARD TYPE</Text>
                            <View style={styles.segmentRow}>
                                {(['reflective', 'analytical'] as CardType[]).map((type) => (
                                    <TouchableOpacity
                                        key={type}
                                        style={[styles.segmentBtn, cardType === type && styles.segmentBtnActive]}
                                        onPress={() => setCardType(type)}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={[styles.segmentText, cardType === type && styles.segmentTextActive]}>
                                            {type === 'reflective' ? 'Reflective' : 'Analytical'}
                                        </Text>
                                        <Text style={[styles.segmentDesc, cardType === type && styles.segmentDescActive]}>
                                            {type === 'reflective' ? 'Memory & feeling' : 'Patterns & data'}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* ── Scope ─────────────────────────────────── */}
                        <View style={styles.section}>
                            <Text style={styles.sectionLabel}>SCOPE</Text>
                            <View style={styles.optionRow}>
                                {(['all', 'specific'] as CardScope[]).map((s) => (
                                    <TouchableOpacity
                                        key={s}
                                        style={[styles.optionBtn, scope === s && styles.optionBtnActive]}
                                        onPress={() => {
                                            setScope(s);
                                            if (s === 'all') setMoodFilter(null);
                                        }}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={[styles.optionText, scope === s && styles.optionTextActive]}>
                                            {s === 'all' ? 'All moods' : 'Specific mood'}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {scope === 'specific' && (
                                <View style={styles.moodPicker}>
                                    {availableMoodsInRange.length === 0 ? (
                                        <Text style={styles.moodEmpty}>No moods logged in this range.</Text>
                                    ) : (
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                            <View style={styles.moodChips}>
                                                {availableMoodsInRange.map((mood) => (
                                                    <TouchableOpacity
                                                        key={mood}
                                                        style={[styles.moodChip, moodFilter === mood && styles.moodChipActive]}
                                                        onPress={() => setMoodFilter(mood === moodFilter ? null : mood)}
                                                        activeOpacity={0.8}
                                                    >
                                                        <Text style={[styles.moodChipText, moodFilter === mood && styles.moodChipTextActive]}>
                                                            {mood}
                                                        </Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                        </ScrollView>
                                    )}
                                </View>
                            )}
                        </View>

                        {/* ── Date range ────────────────────────────── */}
                        <View style={styles.section}>
                            <Text style={styles.sectionLabel}>DATE RANGE</Text>
                            <View style={styles.presetGrid}>
                                {([
                                    ['this_week', 'This week'],
                                    ['last_2_weeks', 'Last 2 weeks'],
                                    ['this_month', 'This month'],
                                    ['last_month', 'Last month'],
                                    ['custom', 'Custom'],
                                ] as [DatePreset, string][]).map(([preset, label]) => (
                                    <TouchableOpacity
                                        key={preset}
                                        style={[styles.presetBtn, datePreset === preset && styles.presetBtnActive]}
                                        onPress={() => {
                                            setDatePreset(preset);
                                            if (preset !== 'custom') {
                                                const range = getPresetRange(preset);
                                                setCustomFrom(range.from);
                                                setCustomTo(range.to);
                                            }
                                        }}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={[styles.presetText, datePreset === preset && styles.presetTextActive]}>
                                            {label}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {datePreset === 'custom' && (
                                <View style={styles.customDateSection}>
                                    <DateStepper
                                        label="From"
                                        value={customFrom}
                                        onChange={(v) => {
                                            setCustomFrom(v);
                                            if (v > customTo) setCustomTo(v);
                                        }}
                                        max={customTo}
                                    />
                                    <View style={styles.dateDivider} />
                                    <DateStepper
                                        label="To"
                                        value={customTo}
                                        onChange={(v) => {
                                            setCustomTo(v);
                                            if (v < customFrom) setCustomFrom(v);
                                        }}
                                        min={customFrom}
                                        max={today}
                                    />
                                </View>
                            )}
                        </View>

                        {/* ── Tone ──────────────────────────────────── */}
                        <View style={styles.section}>
                            <Text style={styles.sectionLabel}>TONE</Text>
                            <TouchableOpacity
                                style={styles.toneBtn}
                                onPress={() => setShowToneSelector(true)}
                                activeOpacity={0.8}
                            >
                                <View style={styles.toneBtnLeft}>
                                    <Ionicons name="sparkles-outline" size={16} color="rgba(168,85,247,0.8)" />
                                    <Text style={styles.toneBtnText}>{toneName}</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.4)" />
                            </TouchableOpacity>
                        </View>

                        {/* ── Preview summary ───────────────────────── */}
                        <View style={styles.previewBox}>
                            <LinearGradient
                                colors={['rgba(168,85,247,0.08)', 'rgba(139,34,82,0.06)']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={StyleSheet.absoluteFill}
                            />
                            <Ionicons name="eye-outline" size={14} color="rgba(168,85,247,0.7)" />
                            <Text style={styles.previewText} numberOfLines={2}>{previewLine}</Text>
                        </View>

                        {/* ── Data count ────────────────────────────── */}
                        <View style={styles.countRow}>
                            <Ionicons
                                name={hasEnoughData ? 'checkmark-circle-outline' : 'alert-circle-outline'}
                                size={14}
                                color={hasEnoughData ? 'rgba(134,239,172,0.8)' : 'rgba(251,191,36,0.8)'}
                            />
                            <Text style={[styles.countText, !hasEnoughData && styles.countTextWarn]}>
                                {filteredCaptures.length} capture{filteredCaptures.length !== 1 ? 's' : ''} in range
                                {!hasEnoughData && ' — need at least 3'}
                            </Text>
                        </View>

                        {/* ── Rate limit ────────────────────────────── */}
                        {remaining < 5 && (
                            <View style={styles.limitRow}>
                                <Ionicons name="flash-outline" size={13} color="rgba(251,191,36,0.7)" />
                                <Text style={styles.limitText}>{remaining} generation{remaining !== 1 ? 's' : ''} remaining today</Text>
                            </View>
                        )}

                        {/* ── Error ─────────────────────────────────── */}
                        {error && (
                            <View style={styles.errorBox}>
                                <Ionicons name="warning-outline" size={14} color="rgba(248,113,113,0.9)" />
                                <Text style={styles.errorText}>{error}</Text>
                            </View>
                        )}

                        {/* ── Generate CTA ──────────────────────────── */}
                        <TouchableOpacity
                            style={[
                                styles.generateBtn,
                                (!hasEnoughData || !canGenerate() || isGenerating) && styles.generateBtnDisabled,
                            ]}
                            onPress={handleGenerate}
                            disabled={!hasEnoughData || !canGenerate() || isGenerating}
                            activeOpacity={0.85}
                        >
                            <LinearGradient
                                colors={['rgba(168,85,247,0.9)', 'rgba(139,34,82,0.85)']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={[StyleSheet.absoluteFill, { borderRadius: 16 }]}
                            />
                            {isGenerating ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <>
                                    <Ionicons name="sparkles" size={16} color="#fff" />
                                    <Text style={styles.generateBtnText}>Generate card</Text>
                                </>
                            )}
                        </TouchableOpacity>

                        <View style={{ height: 8 }} />
                    </ScrollView>
                </View>
            </View>

            {/* Tone selector */}
            <ToneSelector
                visible={showToneSelector}
                onClose={() => setShowToneSelector(false)}
                currentToneId={toneId}
                onSelectTone={(id) => {
                    setToneId(id);
                    setShowToneSelector(false);
                }}
            />
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    sheet: {
        backgroundColor: '#0A0A10',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        borderWidth: 1,
        borderBottomWidth: 0,
        borderColor: 'rgba(255,255,255,0.08)',
        maxHeight: '92%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -8 },
        shadowOpacity: 0.5,
        shadowRadius: 24,
        elevation: 20,
    },
    dragBar: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignSelf: 'center',
        marginTop: 12,
        marginBottom: 4,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 8,
    },
    title: {
        fontSize: 19,
        fontWeight: '700',
        color: '#fff',
        letterSpacing: -0.3,
    },
    subtitle: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.4)',
        marginTop: 3,
    },
    closeBtn: {
        padding: 4,
        marginTop: 2,
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingBottom: 32,
        gap: 20,
    },
    section: {
        gap: 10,
    },
    sectionLabel: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 1.2,
        color: 'rgba(255,255,255,0.35)',
    },
    // Segment (card type)
    segmentRow: {
        flexDirection: 'row',
        gap: 10,
    },
    segmentBtn: {
        flex: 1,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        gap: 3,
    },
    segmentBtnActive: {
        backgroundColor: 'rgba(168,85,247,0.12)',
        borderColor: 'rgba(168,85,247,0.4)',
    },
    segmentText: {
        fontSize: 14,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.6)',
    },
    segmentTextActive: {
        color: '#fff',
    },
    segmentDesc: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.3)',
    },
    segmentDescActive: {
        color: 'rgba(168,85,247,0.8)',
    },
    // Scope options
    optionRow: {
        flexDirection: 'row',
        gap: 10,
    },
    optionBtn: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
    },
    optionBtnActive: {
        backgroundColor: 'rgba(168,85,247,0.12)',
        borderColor: 'rgba(168,85,247,0.4)',
    },
    optionText: {
        fontSize: 13,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.5)',
    },
    optionTextActive: {
        color: '#fff',
    },
    // Mood picker
    moodPicker: {
        marginTop: 4,
    },
    moodChips: {
        flexDirection: 'row',
        gap: 8,
        paddingRight: 4,
    },
    moodChip: {
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    moodChipActive: {
        backgroundColor: 'rgba(168,85,247,0.18)',
        borderColor: 'rgba(168,85,247,0.5)',
    },
    moodChipText: {
        fontSize: 13,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.6)',
    },
    moodChipTextActive: {
        color: '#fff',
    },
    moodEmpty: {
        color: 'rgba(255,255,255,0.35)',
        fontSize: 13,
        fontStyle: 'italic',
    },
    // Date presets
    presetGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    presetBtn: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    presetBtnActive: {
        backgroundColor: 'rgba(168,85,247,0.15)',
        borderColor: 'rgba(168,85,247,0.4)',
    },
    presetText: {
        fontSize: 13,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.55)',
    },
    presetTextActive: {
        color: '#e9d5ff',
    },
    customDateSection: {
        marginTop: 8,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    dateDivider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.06)',
        marginVertical: 4,
    },
    // Tone
    toneBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 13,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.09)',
    },
    toneBtnLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    toneBtnText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#fff',
    },
    // Preview
    previewBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(168,85,247,0.2)',
        overflow: 'hidden',
    },
    previewText: {
        flex: 1,
        fontSize: 13,
        color: 'rgba(255,255,255,0.65)',
        lineHeight: 18,
        fontStyle: 'italic',
    },
    // Count + limit
    countRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    countText: {
        fontSize: 12,
        color: 'rgba(134,239,172,0.7)',
    },
    countTextWarn: {
        color: 'rgba(251,191,36,0.8)',
    },
    limitRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    limitText: {
        fontSize: 12,
        color: 'rgba(251,191,36,0.7)',
    },
    // Error
    errorBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        backgroundColor: 'rgba(248,113,113,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(248,113,113,0.2)',
        borderRadius: 12,
        padding: 12,
    },
    errorText: {
        flex: 1,
        fontSize: 13,
        color: 'rgba(248,113,113,0.9)',
        lineHeight: 18,
    },
    // Generate button
    generateBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 52,
        borderRadius: 16,
        overflow: 'hidden',
        marginTop: 4,
    },
    generateBtnDisabled: {
        opacity: 0.45,
    },
    generateBtnText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
        letterSpacing: 0.2,
    },
});

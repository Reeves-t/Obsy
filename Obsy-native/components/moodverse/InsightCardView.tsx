import React, { useState, useRef } from 'react';
import {
    Modal,
    View,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Text,
    TextInput,
    Share,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { InsightCardResult, CardScope } from '@/services/insightCardClient';
import { useInsightCardStore } from '@/lib/insightCardStore';
import { AI_TONES } from '@/lib/aiTone';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDisplayDate(iso: string): string {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateRange(from: string, to: string): string {
    if (from === to) return formatDisplayDate(from);
    return `${formatDisplayDate(from)} – ${formatDisplayDate(to)}`;
}

function getToneName(toneId: string): string {
    const preset = AI_TONES.find((t) => t.id === toneId);
    return preset?.label ?? 'Custom';
}

// ─── Props ─────────────────────────────────────────────────────────────────────

interface InsightCardViewProps {
    visible: boolean;
    card: InsightCardResult;
    dateFrom: string;
    dateTo: string;
    toneId: string;
    scope: CardScope;
    moodFilter?: string | null;
    onClose: () => void;
    onRegenerate: () => void;
}

// ─── Card display ──────────────────────────────────────────────────────────────

function CardArtifact({
    title,
    body,
    dateFrom,
    dateTo,
    cardType,
    dominantMoods,
    emotionalTheme,
    toneId,
}: {
    title: string;
    body: string;
    dateFrom: string;
    dateTo: string;
    cardType: 'reflective' | 'analytical';
    dominantMoods?: string[];
    emotionalTheme?: string;
    toneId: string;
}) {
    const isAnalytical = cardType === 'analytical';

    return (
        <View style={cardStyles.card}>
            {/* Card gradient background */}
            <LinearGradient
                colors={
                    isAnalytical
                        ? ['rgba(124,58,237,0.18)', 'rgba(76,29,149,0.12)', 'rgba(10,10,16,0.95)']
                        : ['rgba(139,34,82,0.18)', 'rgba(124,58,237,0.10)', 'rgba(10,10,16,0.95)']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
            />

            {/* Header row */}
            <View style={cardStyles.cardHeader}>
                <View style={cardStyles.cardTypePill}>
                    <Ionicons
                        name={isAnalytical ? 'bar-chart-outline' : 'heart-outline'}
                        size={11}
                        color="rgba(168,85,247,0.9)"
                    />
                    <Text style={cardStyles.cardTypeText}>
                        {isAnalytical ? 'Analytical' : 'Reflective'}
                    </Text>
                </View>
                <View style={cardStyles.obsy}>
                    <Text style={cardStyles.obsyText}>Obsy</Text>
                </View>
            </View>

            {/* Date range */}
            <Text style={cardStyles.dateRange}>{formatDateRange(dateFrom, dateTo)}</Text>

            {/* Title */}
            <Text style={cardStyles.cardTitle}>{title}</Text>

            {/* Analytical: dominant moods */}
            {isAnalytical && dominantMoods && dominantMoods.length > 0 && (
                <View style={cardStyles.moodsRow}>
                    {dominantMoods.slice(0, 4).map((m) => (
                        <View key={m} style={cardStyles.moodTag}>
                            <Text style={cardStyles.moodTagText}>{m}</Text>
                        </View>
                    ))}
                </View>
            )}

            {/* Body */}
            <Text style={cardStyles.cardBody}>{body}</Text>

            {/* Reflective: emotional theme */}
            {!isAnalytical && emotionalTheme && (
                <View style={cardStyles.themeRow}>
                    <View style={cardStyles.themeLine} />
                    <Text style={cardStyles.themeText}>{emotionalTheme}</Text>
                    <View style={cardStyles.themeLine} />
                </View>
            )}

            {/* Footer */}
            <View style={cardStyles.cardFooter}>
                <Text style={cardStyles.footerTone}>{getToneName(toneId)} tone</Text>
                <Text style={cardStyles.footerBrand}>moodverse</Text>
            </View>
        </View>
    );
}

const cardStyles = StyleSheet.create({
    card: {
        borderRadius: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(168,85,247,0.25)',
        padding: 20,
        gap: 12,
        minHeight: 280,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    cardTypePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: 'rgba(168,85,247,0.12)',
        borderWidth: 1,
        borderColor: 'rgba(168,85,247,0.25)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
    },
    cardTypeText: {
        fontSize: 10,
        fontWeight: '700',
        color: 'rgba(168,85,247,0.9)',
        letterSpacing: 0.5,
    },
    obsy: {
        opacity: 0.4,
    },
    obsyText: {
        fontSize: 11,
        color: '#fff',
        fontWeight: '600',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    dateRange: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
        fontWeight: '500',
        letterSpacing: 0.3,
    },
    cardTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: '#fff',
        lineHeight: 28,
        letterSpacing: -0.5,
    },
    moodsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    moodTag: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
    },
    moodTagText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.7)',
        fontWeight: '500',
    },
    cardBody: {
        fontSize: 15,
        color: 'rgba(255,255,255,0.82)',
        lineHeight: 23,
        letterSpacing: 0.1,
    },
    themeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginTop: 4,
    },
    themeLine: {
        flex: 1,
        height: 1,
        backgroundColor: 'rgba(168,85,247,0.2)',
    },
    themeText: {
        fontSize: 12,
        color: 'rgba(168,85,247,0.7)',
        fontWeight: '500',
        fontStyle: 'italic',
    },
    cardFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 4,
        opacity: 0.4,
    },
    footerTone: {
        fontSize: 11,
        color: '#fff',
    },
    footerBrand: {
        fontSize: 11,
        color: '#fff',
        fontWeight: '600',
        letterSpacing: 1,
    },
});

// ─── Main component ────────────────────────────────────────────────────────────

export function InsightCardView({
    visible,
    card,
    dateFrom,
    dateTo,
    toneId,
    scope,
    moodFilter,
    onClose,
    onRegenerate,
}: InsightCardViewProps) {
    const { saveCard, updateCardTitle, isCardSaved } = useInsightCardStore();

    const [editingTitle, setEditingTitle] = useState(false);
    const [title, setTitle] = useState(card.title);
    const [savedCardId, setSavedCardId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isSharing, setIsSharing] = useState(false);
    const titleInputRef = useRef<TextInput>(null);

    const alreadySaved = savedCardId !== null || isCardSaved(card.requestId);

    const handleSave = () => {
        if (alreadySaved) return;
        setIsSaving(true);
        try {
            const saved = saveCard(card, { dateFrom, dateTo, toneId, scope, moodFilter });
            setSavedCardId(saved.id);
        } finally {
            setIsSaving(false);
        }
    };

    const handleTitleSave = () => {
        setEditingTitle(false);
        if (savedCardId) {
            updateCardTitle(savedCardId, title);
        }
    };

    const handleShare = async () => {
        setIsSharing(true);
        try {
            const cardTypeName = card.cardType === 'reflective' ? 'Reflective' : 'Analytical';
            const dateRangeStr = formatDateRange(dateFrom, dateTo);
            const moodsPart = card.dominantMoods?.length
                ? `\nDominant moods: ${card.dominantMoods.join(', ')}`
                : '';
            const themePart = card.emotionalTheme ? `\n${card.emotionalTheme}` : '';

            const shareText = [
                `✦ ${title}`,
                `${cardTypeName} Moodverse card · ${dateRangeStr}`,
                '',
                card.body,
                moodsPart,
                themePart,
                '',
                '— via Obsy',
            ]
                .filter((l) => l !== undefined)
                .join('\n')
                .trim();

            await Share.share({
                message: shareText,
                title: title,
            });
        } catch {
            Alert.alert('Share failed', 'Could not open the share sheet. Please try again.');
        } finally {
            setIsSharing(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
                <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />

                <View style={styles.sheet}>
                    <View style={styles.dragBar} />

                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={onRegenerate} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Ionicons name="chevron-back" size={20} color="rgba(255,255,255,0.6)" />
                            <Text style={styles.backText}>Back</Text>
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>Your card</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Ionicons name="close" size={22} color="rgba(255,255,255,0.6)" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                        {/* ── Title editor ──────────────────────────── */}
                        <View style={styles.titleSection}>
                            {editingTitle ? (
                                <View style={styles.titleInputRow}>
                                    <TextInput
                                        ref={titleInputRef}
                                        style={styles.titleInput}
                                        value={title}
                                        onChangeText={setTitle}
                                        onSubmitEditing={handleTitleSave}
                                        onBlur={handleTitleSave}
                                        autoFocus
                                        returnKeyType="done"
                                        maxLength={80}
                                        selectionColor="rgba(168,85,247,0.8)"
                                    />
                                    <TouchableOpacity onPress={handleTitleSave} style={styles.titleDoneBtn}>
                                        <Ionicons name="checkmark" size={18} color="rgba(168,85,247,0.9)" />
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <TouchableOpacity
                                    style={styles.titleDisplay}
                                    onPress={() => setEditingTitle(true)}
                                    activeOpacity={0.8}
                                >
                                    <Text style={styles.titleDisplayText} numberOfLines={2}>{title}</Text>
                                    <Ionicons name="pencil-outline" size={14} color="rgba(255,255,255,0.35)" style={{ marginTop: 3 }} />
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* ── Card artifact ─────────────────────────── */}
                        <CardArtifact
                            title={title}
                            body={card.body}
                            dateFrom={dateFrom}
                            dateTo={dateTo}
                            cardType={card.cardType}
                            dominantMoods={card.dominantMoods}
                            emotionalTheme={card.emotionalTheme}
                            toneId={toneId}
                        />

                        {/* ── Edit title hint ───────────────────────── */}
                        <Text style={styles.editHint}>Tap the title above to edit it</Text>

                        {/* ── Actions ───────────────────────────────── */}
                        <View style={styles.actionsRow}>
                            {/* Save */}
                            <TouchableOpacity
                                style={[styles.actionBtn, alreadySaved && styles.actionBtnSaved]}
                                onPress={handleSave}
                                disabled={alreadySaved || isSaving}
                                activeOpacity={0.8}
                            >
                                {isSaving ? (
                                    <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" />
                                ) : (
                                    <Ionicons
                                        name={alreadySaved ? 'bookmark' : 'bookmark-outline'}
                                        size={18}
                                        color={alreadySaved ? 'rgba(168,85,247,0.9)' : 'rgba(255,255,255,0.7)'}
                                    />
                                )}
                                <Text style={[styles.actionText, alreadySaved && styles.actionTextSaved]}>
                                    {alreadySaved ? 'Saved' : 'Save'}
                                </Text>
                            </TouchableOpacity>

                            {/* Share */}
                            <TouchableOpacity
                                style={[styles.actionBtn, styles.actionBtnPrimary]}
                                onPress={handleShare}
                                disabled={isSharing}
                                activeOpacity={0.85}
                            >
                                <LinearGradient
                                    colors={['rgba(168,85,247,0.85)', 'rgba(139,34,82,0.8)']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={StyleSheet.absoluteFill}
                                />
                                {isSharing ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <Ionicons name="share-outline" size={18} color="#fff" />
                                )}
                                <Text style={[styles.actionText, styles.actionTextPrimary]}>Share</Text>
                            </TouchableOpacity>

                            {/* Regenerate */}
                            <TouchableOpacity
                                style={styles.actionBtn}
                                onPress={onRegenerate}
                                activeOpacity={0.8}
                            >
                                <Ionicons name="refresh-outline" size={18} color="rgba(255,255,255,0.7)" />
                                <Text style={styles.actionText}>Redo</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={{ height: 12 }} />
                    </ScrollView>
                </View>
            </View>
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
        maxHeight: '94%',
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
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    backBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    backText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.55)',
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
    closeBtn: {
        padding: 4,
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        padding: 20,
        gap: 16,
    },
    // Title editor
    titleSection: {
        minHeight: 44,
    },
    titleDisplay: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
    },
    titleDisplayText: {
        flex: 1,
        fontSize: 20,
        fontWeight: '700',
        color: '#fff',
        lineHeight: 26,
        letterSpacing: -0.3,
    },
    titleInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(168,85,247,0.35)',
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    titleInput: {
        flex: 1,
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
    },
    titleDoneBtn: {
        padding: 4,
    },
    // Edit hint
    editHint: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.25)',
        textAlign: 'center',
        marginTop: -4,
    },
    // Actions
    actionsRow: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 4,
    },
    actionBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        height: 48,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        overflow: 'hidden',
    },
    actionBtnSaved: {
        borderColor: 'rgba(168,85,247,0.3)',
        backgroundColor: 'rgba(168,85,247,0.06)',
    },
    actionBtnPrimary: {
        flex: 1.4,
        borderColor: 'transparent',
    },
    actionText: {
        fontSize: 13,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.7)',
    },
    actionTextSaved: {
        color: 'rgba(168,85,247,0.9)',
    },
    actionTextPrimary: {
        color: '#fff',
    },
});

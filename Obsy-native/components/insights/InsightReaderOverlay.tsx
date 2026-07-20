import React, { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
    Extrapolation,
    interpolate,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ui/ThemedText";
import { useObsyTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/i18n/config";
import { InsightText } from "./InsightText";
import { PendingInsightMessage } from "./PendingInsightMessage";
import { BookmarkButton } from "./BookmarkButton";
import { RING_VISUAL_SIZE } from "./ring/moodRingShader";

export interface OriginRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface InsightReaderOverlayProps {
    visible: boolean;
    /** Window rect of the ring's wrapper, measured at tap time; the reader inflates from it. */
    originRect: OriginRect | null;
    monthPhrase?: string | null;
    aiReasoning?: string | null;
    text?: string | null;
    isEligible?: boolean;
    isGenerating?: boolean;
    onGenerate?: () => void;
    pendingCount?: number;
    isSaved?: boolean;
    saving?: boolean;
    onSave?: () => void;
    onClose: () => void;
    /** Top mood colors, used by the continuity "ghost" circle during the morph. */
    ghostColors?: [string, string];
}

const SPRING = { damping: 18, stiffness: 90 };

export function InsightReaderOverlay({
    visible,
    originRect,
    monthPhrase,
    aiReasoning,
    text,
    isEligible = true,
    isGenerating = false,
    onGenerate,
    pendingCount = 0,
    isSaved = false,
    saving = false,
    onSave,
    onClose,
    ghostColors = ['#3f3f46', '#3f3f46'],
}: InsightReaderOverlayProps) {
    const { colors, isLight } = useObsyTheme();
    const { t } = useI18n();
    const insets = useSafeAreaInsets();

    const progress = useSharedValue(0);
    // The modal root is measured instead of using window dimensions so the card
    // fills the actual modal window on Android under statusBarTranslucent.
    const [target, setTarget] = useState({ width: 0, height: 0 });
    const [viewportH, setViewportH] = useState(0);
    const [contentH, setContentH] = useState(0);
    const scrollNeeded = viewportH > 0 && contentH > viewportH + 1;

    // The morph starts at the ring's visible circle, not the padded canvas rect
    const originCx = (originRect?.x ?? 0) + (originRect?.width ?? RING_VISUAL_SIZE) / 2;
    const originCy = (originRect?.y ?? 0) + (originRect?.height ?? RING_VISUAL_SIZE) / 2;
    const circleLeft = originCx - RING_VISUAL_SIZE / 2;
    const circleTop = originCy - RING_VISUAL_SIZE / 2;

    const openReader = () => {
        progress.value = 0;
        progress.value = withSpring(1, SPRING);
    };

    const requestClose = () => {
        progress.value = withSpring(0, SPRING, () => {
            runOnJS(onClose)();
        });
    };

    const backdropStyle = useAnimatedStyle(() => ({
        opacity: interpolate(progress.value, [0, 1], [0, 1], Extrapolation.CLAMP),
    }));

    const cardStyle = useAnimatedStyle(() => ({
        left: interpolate(progress.value, [0, 1], [circleLeft, 0]),
        top: interpolate(progress.value, [0, 1], [circleTop, 0]),
        width: interpolate(progress.value, [0, 1], [RING_VISUAL_SIZE, target.width]),
        height: interpolate(progress.value, [0, 1], [RING_VISUAL_SIZE, target.height]),
        borderRadius: interpolate(progress.value, [0, 1], [RING_VISUAL_SIZE / 2, 0]),
    }));

    const surfaceStyle = useAnimatedStyle(() => ({
        opacity: interpolate(progress.value, [0, 1], [0.35, 1], Extrapolation.CLAMP),
    }));

    const ghostStyle = useAnimatedStyle(() => ({
        opacity: interpolate(progress.value, [0, 0.3], [0.85, 0], Extrapolation.CLAMP),
    }));

    const contentStyle = useAnimatedStyle(() => ({
        opacity: interpolate(progress.value, [0.45, 1], [0, 1], Extrapolation.CLAMP),
        transform: [{ translateY: interpolate(progress.value, [0.45, 1], [16, 0], Extrapolation.CLAMP) }],
    }));

    return (
        <Modal
            visible={visible}
            transparent
            statusBarTranslucent
            navigationBarTranslucent
            animationType="none"
            onShow={openReader}
            onRequestClose={requestClose}
        >
            <View
                style={styles.root}
                onLayout={(e) => setTarget({
                    width: e.nativeEvent.layout.width,
                    height: e.nativeEvent.layout.height,
                })}
            >
                <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
                    <BlurView
                        intensity={40}
                        tint={isLight ? 'light' : 'dark'}
                        style={StyleSheet.absoluteFill}
                    />
                    <View
                        style={[
                            StyleSheet.absoluteFill,
                            { backgroundColor: isLight ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)' },
                        ]}
                    />
                </Animated.View>

                {target.width > 0 && (
                    <Animated.View style={[styles.card, cardStyle]}>
                        <Animated.View
                            style={[
                                StyleSheet.absoluteFill,
                                { backgroundColor: colors.background },
                                surfaceStyle,
                            ]}
                        />
                        {/* Continuity ghost: carries the ring's colors through the first
                            moments of the morph (no second live Skia canvas in the modal). */}
                        <Animated.View style={[StyleSheet.absoluteFill, ghostStyle]} pointerEvents="none">
                            <LinearGradient
                                colors={ghostColors}
                                start={{ x: 0.1, y: 0.1 }}
                                end={{ x: 0.9, y: 0.9 }}
                                style={StyleSheet.absoluteFill}
                            />
                        </Animated.View>

                        <Animated.View style={[styles.content, contentStyle, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
                            {/* Header */}
                            <View style={styles.headerRow}>
                                <Pressable onPress={requestClose} hitSlop={12} style={styles.closeBtn}>
                                    <Ionicons name="close" size={24} color={colors.textSecondary} />
                                </Pressable>
                                <ThemedText style={[styles.headerText, { color: colors.text }]} numberOfLines={2}>
                                    Why "{monthPhrase || 'This Month'}"?
                                </ThemedText>
                                <View style={styles.closeBtn} />
                            </View>
                            <View style={[styles.divider, { backgroundColor: isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.15)' }]} />

                            {/* Body — fills the screen; scrolls only when the insight truly overflows */}
                            <ScrollView
                                style={styles.bodyScroll}
                                contentContainerStyle={styles.bodyScrollContent}
                                showsVerticalScrollIndicator={false}
                                scrollEnabled={scrollNeeded}
                                onLayout={(e) => setViewportH(e.nativeEvent.layout.height)}
                                onContentSizeChange={(_, h) => setContentH(h)}
                            >
                                {/* The "why" — phrase reasoning */}
                                {aiReasoning ? (
                                    <View style={styles.reasoningBlock}>
                                        <ThemedText style={[styles.bodyText, { color: colors.text }]}>
                                            {aiReasoning.split('\n')[0]}
                                        </ThemedText>
                                        <View style={styles.bulletContainer}>
                                            {aiReasoning
                                                .split('\n')
                                                .slice(1) // Skip the first line as it's the header summary
                                                .filter((line: string) => line.trim().length > 0)
                                                .map((line: string, index: number) => {
                                                    const cleanLine = line.trim().replace(/^(-\s*|\x20*-\s*)/, '');
                                                    return (
                                                        <ThemedText key={index} style={[styles.bulletText, { color: colors.text }]}>
                                                            - {cleanLine}
                                                        </ThemedText>
                                                    );
                                                })}
                                        </View>
                                    </View>
                                ) : null}

                                {pendingCount > 0 && (
                                    <View style={styles.pendingWrap}>
                                        <PendingInsightMessage
                                            pendingCount={pendingCount}
                                            onRefresh={onGenerate ?? (() => { })}
                                            isRefreshing={isGenerating}
                                        />
                                    </View>
                                )}

                                {/* The actual monthly insight narrative */}
                                {text ? (
                                    <InsightText
                                        fallbackText={text}
                                        collapsedSentences={0}
                                        expandable={false}
                                        textStyle={[styles.bodyText, { color: colors.text }]}
                                    />
                                ) : (
                                    <ThemedText style={[styles.placeholderText, { color: colors.textSecondary }]}>
                                        {isEligible ? t('insight.createMonthly') : t('insight.keepCapturing')}
                                    </ThemedText>
                                )}
                            </ScrollView>

                            {/* Action row: regenerate + save */}
                            <View style={styles.actionRow}>
                                {isEligible && onGenerate && (
                                    <Pressable
                                        onPress={onGenerate}
                                        disabled={isGenerating}
                                        style={[
                                            styles.refreshPill,
                                            {
                                                backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)',
                                                borderColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)',
                                            },
                                        ]}
                                    >
                                        {isGenerating ? (
                                            <ActivityIndicator size="small" color={colors.textSecondary} />
                                        ) : (
                                            <Ionicons name="refresh" size={14} color={colors.textSecondary} />
                                        )}
                                        <ThemedText style={[styles.refreshText, { color: colors.textSecondary }]}>
                                            {t('common.refresh')}
                                        </ThemedText>
                                    </Pressable>
                                )}
                                {text && onSave && (
                                    <BookmarkButton isSaved={isSaved} onPress={onSave} disabled={saving} />
                                )}
                            </View>
                        </Animated.View>
                    </Animated.View>
                )}
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    card: {
        position: 'absolute',
        overflow: 'hidden',
    },
    content: {
        flex: 1,
        paddingHorizontal: 24,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    closeBtn: {
        width: 32,
        alignItems: 'flex-start',
        justifyContent: 'center',
    },
    headerText: {
        flex: 1,
        fontSize: 22,
        lineHeight: 28,
        fontWeight: '700',
        textAlign: 'center',
    },
    divider: {
        height: 1,
        width: '40%',
        alignSelf: 'center',
        marginTop: 14,
        marginBottom: 18,
    },
    bodyScroll: {
        flex: 1,
    },
    bodyScrollContent: {
        flexGrow: 1,
        justifyContent: 'center',
        paddingBottom: 8,
    },
    reasoningBlock: {
        width: '100%',
    },
    bulletContainer: {
        width: '100%',
    },
    bodyText: {
        fontSize: 17,
        lineHeight: 27,
        textAlign: 'left',
        marginBottom: 18,
    },
    bulletText: {
        fontSize: 16,
        lineHeight: 25,
        textAlign: 'left',
        marginBottom: 8,
    },
    pendingWrap: {
        marginBottom: 16,
    },
    placeholderText: {
        fontSize: 15,
        lineHeight: 22,
        textAlign: 'center',
    },
    actionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 14,
    },
    refreshPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
    },
    refreshText: {
        fontSize: 13,
        fontWeight: '600',
    },
});

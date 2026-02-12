import React, { useEffect, useCallback } from 'react';
import { StyleSheet, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    withSequence,
    Easing,
} from 'react-native-reanimated';
import { ThemedText } from '@/components/ui/ThemedText';
import { InsightText } from '@/components/insights/InsightText';
import { useObservedPatterns } from '@/lib/observedPatternsStore';
import { useCaptureStore } from '@/lib/captureStore';
import { useAuth } from '@/contexts/AuthContext';
import { useObsyTheme } from '@/contexts/ThemeContext';

const GENERATION_THRESHOLD = 5;

export const ObservedPatternsCard: React.FC = () => {
    const { user } = useAuth();
    const { captures } = useCaptureStore();
    const { isLight } = useObsyTheme();
    const {
        status,
        text,
        eligibleCount,
        error,
        generationNumber,
        hasLoadedSnapshot,
        loadSnapshot,
        refreshPatterns,
        updateEligibleCount,
        needsGeneration,
        isLocked,
    } = useObservedPatterns();

    // Breathing animation for locked state
    const breatheOpacity = useSharedValue(0.3);

    useEffect(() => {
        breatheOpacity.value = withRepeat(
            withSequence(
                withTiming(0.6, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
                withTiming(0.3, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
            ),
            -1,
            false,
        );
    }, []);

    const breatheStyle = useAnimatedStyle(() => ({
        opacity: breatheOpacity.value,
    }));

    // Load snapshot on mount
    useEffect(() => {
        if (user) {
            loadSnapshot(user.id);
        }
    }, [user?.id]);

    // Update eligible count when captures change
    useEffect(() => {
        updateEligibleCount(captures);
    }, [captures]);

    const handleGenerate = useCallback(() => {
        if (user) {
            refreshPatterns(user.id, captures);
        }
    }, [user?.id, captures]);

    const locked = isLocked();
    const ready = needsGeneration();

    // Locked state: atmospheric teaser
    if (locked && status !== 'loading') {
        const progress = Math.min(eligibleCount, GENERATION_THRESHOLD);
        return (
            <View style={styles.container}>
                <ThemedText type="subtitle" style={styles.title}>
                    Observed Patterns
                </ThemedText>
                <View style={styles.divider} />
                <View style={styles.content}>
                    <Animated.View style={[styles.lockedContainer, breatheStyle]}>
                        <ThemedText style={styles.lockedText}>
                            Not enough moments yet. Keep capturing.
                        </ThemedText>
                        <ThemedText style={styles.lockedProgress}>
                            {progress} of {GENERATION_THRESHOLD}
                        </ThemedText>
                    </Animated.View>
                </View>
            </View>
        );
    }

    // Loading state
    if (status === 'loading') {
        return (
            <View style={styles.container}>
                <ThemedText type="subtitle" style={styles.title}>
                    Observed Patterns
                </ThemedText>
                <View style={styles.divider} />
                <View style={styles.content}>
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" />
                        <ThemedText style={styles.loadingText}>
                            Observing patterns across {eligibleCount} captures...
                        </ThemedText>
                    </View>
                </View>
            </View>
        );
    }

    // Error state
    if (status === 'error' && error) {
        return (
            <View style={styles.container}>
                <ThemedText type="subtitle" style={styles.title}>
                    Observed Patterns
                </ThemedText>
                <View style={styles.divider} />
                <View style={styles.content}>
                    <ThemedText style={styles.errorText}>
                        Something went wrong. Try again later.
                    </ThemedText>
                    <TouchableOpacity onPress={handleGenerate} style={styles.retryButton}>
                        <ThemedText style={styles.retryText}>Retry</ThemedText>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    // Success state (with or without pending update)
    return (
        <View style={styles.container}>
            <ThemedText type="subtitle" style={styles.title}>
                Observed Patterns
            </ThemedText>
            <View style={styles.divider} />

            {/* New patterns available prompt */}
            {ready && text && (
                <TouchableOpacity onPress={handleGenerate} style={styles.updatePrompt}>
                    <ThemedText style={styles.updateText}>
                        New patterns available. Tap to update.
                    </ThemedText>
                </TouchableOpacity>
            )}

            <View style={styles.content}>
                {text ? (
                    <View>
                        <InsightText
                            fallbackText={text}
                            collapsedSentences={6}
                            expandable={true}
                            textStyle={styles.insightText}
                        />
                        <View style={styles.footer}>
                            <ThemedText type="caption" style={styles.footerText}>
                                Shaped by {eligibleCount} selected captures.
                            </ThemedText>
                        </View>
                    </View>
                ) : (
                    // First generation available but not yet triggered
                    <View style={styles.firstGenContainer}>
                        <ThemedText style={styles.firstGenText}>
                            Enough moments have been gathered. Patterns are ready to emerge.
                        </ThemedText>
                        <TouchableOpacity onPress={handleGenerate} style={styles.generateButton}>
                            <ThemedText style={styles.generateButtonText}>Reveal Patterns</ThemedText>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        backgroundColor: '#000000',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        overflow: 'hidden',
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
        paddingHorizontal: 20,
        paddingTop: 18,
        paddingBottom: 14,
    },
    divider: {
        height: 0.5,
        backgroundColor: 'rgba(255,255,255,0.06)',
        marginHorizontal: 16,
    },
    content: {
        padding: 20,
    },
    // Locked state
    lockedContainer: {
        paddingVertical: 30,
        alignItems: 'center',
        gap: 12,
    },
    lockedText: {
        fontSize: 15,
        lineHeight: 22,
        color: 'rgba(255,255,255,0.5)',
        textAlign: 'center',
        fontStyle: 'italic',
    },
    lockedProgress: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.25)',
        letterSpacing: 1,
    },
    // Loading state
    loadingContainer: {
        paddingVertical: 30,
        alignItems: 'center',
        gap: 16,
    },
    loadingText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.4)',
        textAlign: 'center',
    },
    // Error state
    errorText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.5)',
        textAlign: 'center',
        marginBottom: 16,
    },
    retryButton: {
        alignSelf: 'center',
        paddingVertical: 8,
        paddingHorizontal: 20,
    },
    retryText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 14,
        fontWeight: '600',
    },
    // Update prompt
    updatePrompt: {
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 4,
    },
    updateText: {
        fontSize: 13,
        color: '#38BDF8',
        fontWeight: '500',
    },
    // Success state
    insightText: {
        fontSize: 16,
        lineHeight: 25,
        color: 'rgba(255,255,255,0.85)',
    },
    footer: {
        marginTop: 14,
    },
    footerText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 0.3,
    },
    // First generation
    firstGenContainer: {
        paddingVertical: 20,
        alignItems: 'center',
        gap: 20,
    },
    firstGenText: {
        fontSize: 15,
        lineHeight: 22,
        color: 'rgba(255,255,255,0.5)',
        textAlign: 'center',
        fontStyle: 'italic',
        paddingHorizontal: 10,
    },
    generateButton: {
        paddingVertical: 12,
        paddingHorizontal: 30,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    generateButtonText: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 15,
        fontWeight: '600',
    },
});

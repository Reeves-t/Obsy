import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { InsightSentence } from '@/services/dailyInsights';
import { useObsyTheme } from '@/contexts/ThemeContext';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface InsightTextProps {
    /** Array of sentences with highlight info */
    sentences?: InsightSentence[];
    /** Fallback plain text if sentences not available */
    fallbackText?: string;
    /** Maximum sentences to show when collapsed (0 = no limit) */
    collapsedSentences?: number;
    /** Whether the insight is expandable */
    expandable?: boolean;
    /** Custom text style overrides */
    textStyle?: object;
}

/**
 * InsightText Component
 *
 * Renders insight text with:
 * - Stacked sentence blocks with 12px spacing
 * - lineHeight: 1.6 for readability
 * - Optional expand/collapse functionality
 */
export function InsightText({
    sentences = [],
    fallbackText = '',
    collapsedSentences = 3,
    expandable = true,
    textStyle,
}: InsightTextProps) {
    const { isLight } = useObsyTheme();
    const [isExpanded, setIsExpanded] = useState(false);

    // Theme-aware colors
    const textColor = isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.9)';
    const ellipsisColor = isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)';
    const iconColor = isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)';

    // Determine which sentences to show (structured sentences)
    const visibleSentences = React.useMemo(() => {
        if (!expandable || isExpanded || sentences.length <= collapsedSentences) {
            return sentences;
        }
        return sentences.slice(0, collapsedSentences);
    }, [sentences, isExpanded, expandable, collapsedSentences]);

    // Handle plain text split into sentences if structured sentences not available
    const fallbackSentences = React.useMemo(() => {
        return fallbackText
            .split(/(?<=[.!?])\s+/)
            .filter(s => s.trim().length > 0);
    }, [fallbackText]);

    const visibleFallback = React.useMemo(() => {
        if (!expandable || isExpanded || fallbackSentences.length <= collapsedSentences) {
            return fallbackSentences;
        }
        return fallbackSentences.slice(0, collapsedSentences);
    }, [fallbackSentences, isExpanded, expandable, collapsedSentences]);

    const handleToggleExpand = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setIsExpanded(!isExpanded);
    };

    const hasMoreContent = sentences.length > collapsedSentences && !isExpanded;
    const hasMoreFallback = fallbackSentences.length > collapsedSentences && !isExpanded;

    // If we have structured sentences, render as stacked blocks with spacing
    if (sentences.length > 0) {
        return (
            <TouchableOpacity
                activeOpacity={expandable ? 0.8 : 1}
                onPress={expandable ? handleToggleExpand : undefined}
                disabled={!expandable}
            >
                <View style={styles.sentenceContainer}>
                    {visibleSentences.map((sentence, index) => (
                        <View
                            key={index}
                            style={[
                                styles.sentenceBlock,
                                index < visibleSentences.length - 1 && styles.sentenceSpacing,
                            ]}
                        >
                            <Text style={[styles.normalText, { color: textColor }, textStyle]}>
                                {sentence.text}
                            </Text>
                        </View>
                    ))}
                    {hasMoreContent && (
                        <Text style={[styles.ellipsis, { color: ellipsisColor }]}>...</Text>
                    )}
                </View>

                {expandable && (
                    <View style={styles.expandIconContainer}>
                        <Ionicons
                            name={isExpanded ? 'chevron-up' : 'chevron-down'}
                            size={16}
                            color={iconColor}
                        />
                    </View>
                )}
            </TouchableOpacity>
        );
    }

    // Fallback: render plain text as stacked sentence blocks
    return (
        <TouchableOpacity
            activeOpacity={expandable ? 0.8 : 1}
            onPress={expandable ? handleToggleExpand : undefined}
            disabled={!expandable}
        >
            <View style={styles.sentenceContainer}>
                {visibleFallback.map((sentence, index) => (
                    <View
                        key={index}
                        style={[
                            styles.sentenceBlock,
                            index < visibleFallback.length - 1 && styles.sentenceSpacing,
                        ]}
                    >
                        <Text style={[styles.normalText, { color: textColor }, textStyle]}>
                            {sentence}
                        </Text>
                    </View>
                ))}
                {hasMoreFallback && (
                    <Text style={[styles.ellipsis, { color: ellipsisColor }]}>...</Text>
                )}
            </View>

            {expandable && (
                <View style={styles.expandIconContainer}>
                    <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color={iconColor}
                    />
                </View>
            )}
        </TouchableOpacity>
    );
}

const FONT_SIZE = 15;
const LINE_HEIGHT = FONT_SIZE * 1.6; // 1.6 line height ratio

const styles = StyleSheet.create({
    sentenceContainer: {
        flexDirection: 'column',
    },
    sentenceBlock: {
        // Each sentence is its own block
    },
    sentenceSpacing: {
        marginBottom: 12, // 12px spacing between sentence blocks
    },
    normalText: {
        fontSize: FONT_SIZE,
        lineHeight: LINE_HEIGHT,
        color: 'rgba(255,255,255,0.9)',
        textShadowColor: 'rgba(0, 0, 0, 0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
        letterSpacing: 0.2,
    },
    ellipsis: {
        fontSize: FONT_SIZE,
        color: 'rgba(255,255,255,0.5)',
        marginTop: 4,
    },
    expandIconContainer: {
        alignItems: 'center',
        marginTop: 8,
    },
});

export default InsightText;


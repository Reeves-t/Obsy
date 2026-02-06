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
    /** Array of sentences with highlight info (legacy, requires useSentences=true) */
    sentences?: InsightSentence[];
    /** Canonical narrative text - primary content source */
    fallbackText?: string;
    /** Maximum sentences to show when collapsed (0 = no limit) */
    collapsedSentences?: number;
    /** Whether the insight is expandable */
    expandable?: boolean;
    /** Custom text style overrides */
    textStyle?: object;
    /** Show debug info in development mode */
    showDebug?: boolean;
    /** Opt-in to use legacy sentence arrays instead of canonical text (default: false) */
    useSentences?: boolean;
}

/**
 * InsightText Component
 *
 * Renders insight text with:
 * - Stacked paragraph blocks with 16px spacing
 * - Sentences flow together naturally within paragraphs
 * - lineHeight: 1.6 for readability
 * - Optional expand/collapse functionality
 *
 * By default, renders canonical narrative.text (fallbackText).
 * Set useSentences=true to use legacy sentence arrays.
 */
export function InsightText({
    sentences = [],
    fallbackText = '',
    collapsedSentences = 3,
    expandable = true,
    textStyle,
    showDebug = false,
    useSentences = false,
}: InsightTextProps) {
    const { isLight } = useObsyTheme();
    const [isExpanded, setIsExpanded] = useState(false);
    const [debugExpanded, setDebugExpanded] = useState(false);

    // Theme-aware colors
    const textColor = isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.9)';
    const ellipsisColor = isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)';
    const iconColor = isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)';
    const debugBgColor = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
    const debugTextColor = isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)';

    // Debug info for development
    const usingFallback = sentences.length === 0 && fallbackText.length > 0;
    const debugInfo = {
        textLength: fallbackText.length,
        sentenceCount: sentences.length,
        usingFallback,
    };

    // Render debug section (only in development)
    const renderDebugSection = () => {
        if (!__DEV__ || !showDebug) return null;

        return (
            <TouchableOpacity
                onPress={() => setDebugExpanded(!debugExpanded)}
                style={[styles.debugContainer, { backgroundColor: debugBgColor }]}
            >
                <Text style={[styles.debugText, { color: debugTextColor }]}>
                    🔍 Debug {debugExpanded ? '▼' : '▶'}
                </Text>
                {debugExpanded && (
                    <View style={styles.debugContent}>
                        <Text style={[styles.debugText, { color: debugTextColor }]}>
                            Text length: {debugInfo.textLength}
                        </Text>
                        <Text style={[styles.debugText, { color: debugTextColor }]}>
                            Sentence count: {debugInfo.sentenceCount}
                        </Text>
                        <Text style={[styles.debugText, { color: debugTextColor }]}>
                            Using fallback: {debugInfo.usingFallback ? 'Yes' : 'No'}
                        </Text>
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    // Determine which sentences to show (structured sentences)
    const visibleSentences = React.useMemo(() => {
        if (!expandable || isExpanded || sentences.length <= collapsedSentences) {
            return sentences;
        }
        return sentences.slice(0, collapsedSentences);
    }, [sentences, isExpanded, expandable, collapsedSentences]);

    // Split text on double newlines to preserve paragraph structure
    // Within each paragraph, normalize internal whitespace for flowing prose
    const fallbackParagraphs = React.useMemo(() => {
        return fallbackText
            .split(/\n\n+/)  // Split on double (or more) newlines to identify paragraphs
            .map(paragraph =>
                paragraph
                    .replace(/\n/g, ' ')   // Collapse single newlines within paragraph to spaces
                    .replace(/\s+/g, ' ')  // Collapse multiple spaces into one
                    .trim()
            )
            .filter(p => p.length > 0);  // Remove empty paragraphs
    }, [fallbackText]);

    const visibleFallback = React.useMemo(() => {
        if (!expandable || isExpanded || fallbackParagraphs.length <= collapsedSentences) {
            return fallbackParagraphs;
        }
        return fallbackParagraphs.slice(0, collapsedSentences);
    }, [fallbackParagraphs, isExpanded, expandable, collapsedSentences]);

    const handleToggleExpand = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setIsExpanded(!isExpanded);
    };

    // Only show "more content" indicator when expandable AND there's actually hidden content
    const hasMoreContent = expandable && sentences.length > collapsedSentences && !isExpanded;
    const hasMoreFallback = expandable && collapsedSentences > 0 && fallbackParagraphs.length > collapsedSentences && !isExpanded;

    // Determine whether to use sentences:
    // 1. Explicitly opted in via useSentences flag, OR
    // 2. Legacy behavior: sentences provided but no fallbackText (auto-detect)
    const shouldUseSentences = (useSentences && sentences.length > 0) ||
                               (sentences.length > 0 && !fallbackText);

    if (shouldUseSentences) {
        // Join all visible sentences into a single flowing paragraph
        const flowingText = visibleSentences.map(s => s.text).join(' ');

        return (
            <View>
                <TouchableOpacity
                    activeOpacity={expandable ? 0.8 : 1}
                    onPress={expandable ? handleToggleExpand : undefined}
                    disabled={!expandable}
                >
                    <View style={styles.sentenceContainer}>
                        <Text style={[styles.normalText, { color: textColor }, textStyle]}>
                            {flowingText}
                        </Text>
                        {hasMoreContent && (
                            <Text style={[styles.ellipsis, { color: ellipsisColor }]}>...</Text>
                        )}
                    </View>

                    {expandable && sentences.length > collapsedSentences && (
                        <View style={styles.expandIconContainer}>
                            <Ionicons
                                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                                size={16}
                                color={iconColor}
                            />
                        </View>
                    )}
                </TouchableOpacity>
                {renderDebugSection()}
            </View>
        );
    }

    // Fallback: render plain text as stacked sentence blocks
    return (
        <View>
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
            {renderDebugSection()}
        </View>
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
        marginBottom: 16, // 16px spacing between paragraph blocks
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
    debugContainer: {
        marginTop: 12,
        padding: 8,
        borderRadius: 6,
    },
    debugContent: {
        marginTop: 4,
    },
    debugText: {
        fontSize: 11,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
});

export default InsightText;


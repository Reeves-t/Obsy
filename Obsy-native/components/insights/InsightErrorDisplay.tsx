import React from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ThemedText } from '@/components/ui/ThemedText';
import { useObsyTheme } from '@/contexts/ThemeContext';

export interface InsightErrorDisplayProps {
    message: string;
    stage: string;
    requestId?: string;
    onRetry?: () => void;
    isRetrying?: boolean;
}

// requestId is accepted for caller convenience but intentionally not displayed to users

/**
 * Maps raw API/edge-function error messages to friendly user-facing copy.
 */
function getFriendlyMessage(stage: string, message: string): string {
    const lower = message.toLowerCase();

    if (lower.includes('high demand') || lower.includes('overloaded') || lower.includes('capacity')) {
        return 'Our AI is a bit busy right now. Give it a moment and try again.';
    }
    if (lower.includes('rate limit') || lower.includes('429') || stage === 'validate') {
        return "You've reached your insight limit for today. Check back tomorrow.";
    }
    if (lower.includes('timeout') || lower.includes('timed out')) {
        return 'The request took too long. Try again in a moment.';
    }
    if (stage === 'auth') {
        return 'Session expired. Please sign in again to generate insights.';
    }
    if (stage === 'fetch' || lower.includes('network') || lower.includes('failed to fetch')) {
        return 'Could not reach the server. Check your connection and try again.';
    }
    if (stage === 'parse' || stage === 'extract') {
        return 'Something went wrong generating your insight. Try again.';
    }

    return 'Something unexpected happened. Try again in a moment.';
}

export const InsightErrorDisplay: React.FC<InsightErrorDisplayProps> = ({
    message,
    stage,
    requestId: _requestId,
    onRetry,
    isRetrying = false,
}) => {
    const { isLight } = useObsyTheme();
    const friendly = getFriendlyMessage(stage, message);

    return (
        <View style={[
            styles.errorCard,
            isLight ? styles.errorCardLight : styles.errorCardDark,
        ]}>
            <ThemedText style={[
                styles.errorTitle,
                { color: isLight ? '#991b1b' : '#fca5a5' },
            ]}>
                {friendly}
            </ThemedText>

            {onRetry && (
                <TouchableOpacity
                    onPress={onRetry}
                    disabled={isRetrying}
                    activeOpacity={0.7}
                    style={[
                        styles.retryButton,
                        isLight ? styles.retryButtonLight : styles.retryButtonDark,
                        isRetrying && styles.retryButtonDisabled,
                    ]}
                >
                    {isRetrying ? (
                        <ActivityIndicator size="small" color={isLight ? '#000' : '#fff'} />
                    ) : (
                        <ThemedText style={[
                            styles.retryText,
                            { color: isLight ? '#000' : '#fff' },
                        ]}>
                            Try again
                        </ThemedText>
                    )}
                </TouchableOpacity>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    errorCard: {
        width: '100%',
        borderRadius: 14,
        paddingVertical: 20,
        paddingHorizontal: 20,
        borderWidth: 1,
        alignItems: 'center',
        gap: 14,
    },
    errorCardLight: {
        backgroundColor: '#fef2f2',
        borderColor: 'rgba(185, 28, 28, 0.15)',
    },
    errorCardDark: {
        backgroundColor: 'rgba(185, 28, 28, 0.08)',
        borderColor: 'rgba(248, 113, 113, 0.2)',
    },
    errorTitle: {
        fontSize: 14,
        fontWeight: '500',
        textAlign: 'center',
        lineHeight: 20,
    },
    retryButton: {
        paddingHorizontal: 24,
        paddingVertical: 10,
        borderRadius: 20,
        minWidth: 120,
        alignItems: 'center',
    },
    retryButtonLight: {
        backgroundColor: 'rgba(0,0,0,0.08)',
    },
    retryButtonDark: {
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    retryButtonDisabled: {
        opacity: 0.5,
    },
    retryText: {
        fontSize: 14,
        fontWeight: '600',
    },
});

import React from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ThemedText } from '@/components/ui/ThemedText';

export interface InsightErrorDisplayProps {
    message: string;
    stage: string;
    requestId?: string;
    onRetry?: () => void;
    isRetrying?: boolean;
}

export const InsightErrorDisplay: React.FC<InsightErrorDisplayProps> = ({
    message,
    stage,
    requestId,
    onRetry,
    isRetrying = false,
}) => {
    return (
        <View style={styles.errorCard}>
            <ThemedText style={styles.errorTitle}>
                {message}
            </ThemedText>
            <ThemedText style={styles.errorDetails}>
                ({stage}) {message}
            </ThemedText>
            {requestId && (
                <ThemedText style={styles.errorMeta}>
                    Error ID: {requestId}
                </ThemedText>
            )}
            {onRetry && (
                <TouchableOpacity onPress={onRetry} disabled={isRetrying} style={styles.retryButton}>
                    {isRetrying ? (
                        <ActivityIndicator />
                    ) : (
                        <ThemedText style={styles.retryText}>Retry</ThemedText>
                    )}
                </TouchableOpacity>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    errorCard: {
        width: '100%',
        borderRadius: 12,
        paddingVertical: 16,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderColor: 'rgba(248, 113, 113, 0.35)',
        backgroundColor: 'rgba(185, 28, 28, 0.12)',
        alignItems: 'center',
        gap: 8,
    },
    errorTitle: {
        fontSize: 15,
        fontWeight: '700',
        textAlign: 'center',
    },
    errorDetails: {
        fontSize: 14,
        textAlign: 'center',
        opacity: 0.85,
    },
    errorMeta: {
        fontSize: 12,
        textAlign: 'center',
        opacity: 0.7,
    },
    retryButton: {
        marginTop: 8,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: '#fff',
    },
    retryText: {
        fontWeight: '700',
    },
});

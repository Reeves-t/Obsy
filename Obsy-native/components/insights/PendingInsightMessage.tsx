import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { ThemedText } from '@/components/ui/ThemedText';
import { useObsyTheme } from '@/contexts/ThemeContext';

interface PendingInsightMessageProps {
    pendingCount: number;
    onRefresh: () => void;
    isRefreshing?: boolean;
}

export const PendingInsightMessage: React.FC<PendingInsightMessageProps> = ({
    pendingCount,
    onRefresh,
    isRefreshing = false,
}) => {
    const { isLight } = useObsyTheme();

    if (pendingCount <= 0) return null;

    // Soft blue colors: sky-600 for light, sky-400 for dark
    const color = isLight ? 'rgba(14, 165, 233, 0.85)' : 'rgba(56, 189, 248, 0.8)';

    return (
        <TouchableOpacity
            style={styles.container}
            onPress={onRefresh}
            disabled={isRefreshing}
            activeOpacity={0.7}
        >
            <View style={[styles.dot, { backgroundColor: color }]} />
            <ThemedText style={[styles.text, { color }]}>
                {pendingCount} new capture{pendingCount > 1 ? 's' : ''} not yet included · Refresh to update
            </ThemedText>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
        marginBottom: 8,
        gap: 8,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    text: {
        fontSize: 13,
        fontWeight: '500',
    },
});

import React from 'react';
import { StyleSheet, View, ViewStyle, Platform } from 'react-native';
import { ThemedText } from './ThemedText';

interface NotificationBadgeProps {
    count: number;
    forceShow?: boolean;
    style?: ViewStyle;
}

/**
 * Reusable Notification Badge component.
 * - 0: Hidden (unless forceShow is true)
 * - 1-9: Circular (16x16)
 * - 10-99: Pill shape
 * - 99+: Pill displaying "99+"
 * 
 * Centered number with optical adjustment for perfect vertical alignment.
 */
export const NotificationBadge: React.FC<NotificationBadgeProps> = ({
    count,
    forceShow = false,
    style,
}) => {
    if (count <= 0 && !forceShow) return null;

    const displayCount = count > 99 ? '99+' : count.toString();
    const isPill = count >= 10;

    return (
        <View style={[
            styles.badge,
            isPill ? styles.pillShape : styles.circleShape,
            style
        ]}>
            <ThemedText style={styles.text}>{displayCount}</ThemedText>
        </View>
    );
};

const styles = StyleSheet.create({
    badge: {
        backgroundColor: '#ff4444',
        justifyContent: 'center',
        alignItems: 'center',
        // Position absolute is usually handled by the parent
        // but we can provide defaults if needed.
        // In HomeScreen it was at: top: -5, right: -5,
    },
    circleShape: {
        width: 16,
        height: 16,
        borderRadius: 8,
    },
    pillShape: {
        minWidth: 16,
        height: 16,
        borderRadius: 8,
        paddingHorizontal: 4,
    },
    text: {
        color: 'white',
        fontSize: 10,
        fontWeight: '800',
        // Perfect centering logic
        textAlign: 'center',
        textAlignVertical: 'center',
        ...Platform.select({
            ios: {
                lineHeight: 16,
                transform: [{ translateY: -0.5 }], // Optical nudge upward
            },
            android: {
                includeFontPadding: false,
                transform: [{ translateY: -0.5 }], // Optical nudge upward
            },
        }),
    },
});

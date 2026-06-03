import React from 'react';
import { StyleSheet, View, Text } from 'react-native';

/** Subtle rounded pills for the Discover "Themes" card. */
export function ThemePills({ themes }: { themes: string[] }) {
    return (
        <View style={styles.row}>
            {themes.map((theme, i) => (
                <View key={`${theme}-${i}`} style={styles.pill}>
                    <Text style={styles.pillText}>{theme}</Text>
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    pill: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.09)',
    },
    pillText: {
        fontSize: 13.5,
        color: 'rgba(255,255,255,0.72)',
        fontWeight: '500',
        letterSpacing: 0.1,
    },
});

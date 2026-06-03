import React from 'react';
import { StyleSheet, View, Text } from 'react-native';

/** Simple bulleted list used for Perspectives, Connections and Open Threads. */
export function BulletList({ items }: { items: string[] }) {
    return (
        <View style={styles.list}>
            {items.map((item, i) => (
                <View key={i} style={styles.row}>
                    <Text style={styles.dot}>{'•'}</Text>
                    <Text style={styles.text}>{item}</Text>
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    list: {
        gap: 9,
    },
    row: {
        flexDirection: 'row',
        gap: 9,
    },
    dot: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.4)',
        lineHeight: 21,
    },
    text: {
        flex: 1,
        fontSize: 14.5,
        color: 'rgba(255,255,255,0.8)',
        lineHeight: 21,
    },
});

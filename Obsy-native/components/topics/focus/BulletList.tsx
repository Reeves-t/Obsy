import React from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';

interface BulletListProps {
    items: string[];
    /**
     * When provided, each item becomes individually respondable (tap the row).
     * This is what lets the user reply to a single prompt instead of a whole
     * list of them sharing one response.
     */
    onRespondItem?: (item: string) => void;
}

/** Simple bulleted list used for Perspectives, Connections and Open Threads. */
export function BulletList({ items, onRespondItem }: BulletListProps) {
    return (
        <View style={styles.list}>
            {items.map((item, i) => {
                const inner = (
                    <>
                        <Text style={styles.dot}>{'•'}</Text>
                        <Text style={styles.text}>{item}</Text>
                        {onRespondItem && <Text style={styles.chevron}>›</Text>}
                    </>
                );
                return onRespondItem ? (
                    <Pressable
                        key={i}
                        onPress={() => onRespondItem(item)}
                        style={styles.row}
                        hitSlop={4}
                    >
                        {inner}
                    </Pressable>
                ) : (
                    <View key={i} style={styles.row}>
                        {inner}
                    </View>
                );
            })}
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
    chevron: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.28)',
        lineHeight: 21,
        marginLeft: 4,
    },
});

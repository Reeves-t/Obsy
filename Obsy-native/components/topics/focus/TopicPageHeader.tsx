import React from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { TopicOrb } from '@/components/topics/TopicOrb';
import type { Topic } from '@/lib/topicStore';

interface TopicPageHeaderProps {
    topic: Topic;
    entryCount: number;
    /** Page name shown alongside the entry count, e.g. "Discover". */
    pageLabel: string;
    onClose: () => void;
}

/**
 * Compact identity header for the Discover / Evolve pages — the topic orb
 * minimized into a small header element to prioritise vertical reading space.
 */
export function TopicPageHeader({ topic, entryCount, pageLabel, onClose }: TopicPageHeaderProps) {
    const countLabel = entryCount === 1 ? '1 entry' : `${entryCount} entries`;

    return (
        <View style={styles.row}>
            <TopicOrb size={40} title="" selected />
            <View style={styles.textCol}>
                <Text style={styles.title} numberOfLines={1}>
                    {topic.title}
                </Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                    {pageLabel} {'·'} {countLabel}
                </Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8} accessibilityLabel="Close focus mode">
                <Text style={styles.closeGlyph}>✕</Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 2,
    },
    textCol: {
        flex: 1,
    },
    title: {
        fontSize: 18,
        fontWeight: '600',
        color: '#fff',
        letterSpacing: -0.3,
    },
    subtitle: {
        fontSize: 11.5,
        color: 'rgba(255,255,255,0.45)',
        marginTop: 2,
        letterSpacing: 0.2,
        textTransform: 'capitalize',
    },
    closeBtn: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    closeGlyph: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
    },
});

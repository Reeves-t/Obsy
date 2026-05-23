import React from 'react';
import { StyleSheet, View, Text, Pressable, Image } from 'react-native';
import Svg, { Path, Circle as SvgCircle } from 'react-native-svg';
import type { Capture } from '@/types/capture';
import type { TopicNote } from '@/lib/topicStore';
import { getMoodTheme } from '@/lib/moods';

export type TopicEntryItem =
    | { kind: 'capture'; capture: Capture }
    | { kind: 'note' | 'insight' | 'missing_gaps'; note: TopicNote };

export const TOPIC_ENTRY_TYPE_LABELS: Record<TopicEntryItem['kind'], string> = {
    capture: 'Captures',
    note: 'Notes',
    insight: 'Insights',
    missing_gaps: 'Gaps',
};

interface TopicEntryTileProps {
    item: TopicEntryItem;
    size: number;
    onPress: (item: TopicEntryItem) => void;
}

// ── Type glyphs ─────────────────────────────────────────────

function NoteGlyph() {
    return (
        <Svg width={11} height={11} viewBox="0 0 16 16" fill="none">
            <Path
                d="M3 2.5h7.5L13 5v8.5H3V2.5z"
                stroke="rgba(255,255,255,0.85)"
                strokeWidth={1.2}
                strokeLinejoin="round"
            />
            <Path
                d="M5.5 7h5M5.5 9.5h5M5.5 12h3"
                stroke="rgba(255,255,255,0.85)"
                strokeWidth={1.2}
                strokeLinecap="round"
            />
        </Svg>
    );
}

function SparkleGlyph() {
    return (
        <Svg width={11} height={11} viewBox="0 0 16 16" fill="none">
            <Path
                d="M8 1.5l1.4 3.6L13 6.5l-3.6 1.4L8 11.5 6.6 7.9 3 6.5l3.6-1.4L8 1.5z"
                fill="rgba(255,255,255,0.85)"
            />
        </Svg>
    );
}

function GapGlyph() {
    return (
        <Svg width={11} height={11} viewBox="0 0 16 16" fill="none">
            <Path
                d="M3 3h4v4H3V3zm6 0h4v4H9V3zM3 9h4v4H3V9zm6 3h4M9 10v3"
                stroke="rgba(255,255,255,0.85)"
                strokeWidth={1.2}
                strokeLinecap="round"
            />
        </Svg>
    );
}

function VoiceGlyph() {
    return (
        <Svg width={11} height={11} viewBox="0 0 16 16" fill="none">
            <Path
                d="M8 2v8M5 4v4M11 4v4M2 6v2M14 6v2"
                stroke="rgba(255,255,255,0.85)"
                strokeWidth={1.2}
                strokeLinecap="round"
            />
        </Svg>
    );
}

function JournalGlyph() {
    return (
        <Svg width={11} height={11} viewBox="0 0 16 16" fill="none">
            <Path
                d="M3.5 2h7c1 0 1.8.8 1.8 1.8v9.4c0 .5-.6.7-1 .4L8 11.5l-3.3 2.1c-.4.3-1 0-1-.4V3.8C3.7 2.8 4.5 2 5.5 2z"
                stroke="rgba(255,255,255,0.85)"
                strokeWidth={1.2}
                strokeLinejoin="round"
            />
        </Svg>
    );
}

function LinkGlyph() {
    return (
        <Svg width={11} height={11} viewBox="0 0 16 16" fill="none">
            <Path
                d="M7 9.5L9 7.5M5 5h2.5a3 3 0 010 6H5M11 11H8.5a3 3 0 010-6H11"
                stroke="rgba(255,255,255,0.85)"
                strokeWidth={1.2}
                strokeLinecap="round"
            />
        </Svg>
    );
}

function CaptureGlyph({ color = 'rgba(255,255,255,0.85)' }: { color?: string }) {
    return (
        <Svg width={11} height={11} viewBox="0 0 16 16" fill="none">
            <SvgCircle cx={8} cy={8} r={5} stroke={color} strokeWidth={1.2} />
        </Svg>
    );
}

// ── Format helpers ─────────────────────────────────────────

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
    });
}

function previewForCapture(c: Capture): { title: string; body: string } {
    if (c.source_type === 'shared_link') {
        return {
            title: c.shared_link_platform || 'Link',
            body: c.shared_link_title || c.note || c.mood_name_snapshot,
        };
    }
    if (c.source_type === 'voice') {
        return { title: c.mood_name_snapshot, body: c.note || 'Voice note' };
    }
    if (c.source_type === 'journal') {
        return { title: c.mood_name_snapshot, body: c.note || 'Journal entry' };
    }
    return { title: c.mood_name_snapshot, body: c.note || 'Capture' };
}

function previewForNote(note: TopicNote): { title: string; body: string } {
    const kind = note.kind ?? 'note';
    const title = kind === 'insight' ? 'Insight' : kind === 'missing_gaps' ? 'Gap analysis' : 'Note';
    const firstLine = note.text.split('\n').find(l => l.trim().length > 0)?.trim() ?? note.text;
    return { title, body: firstLine };
}

function glyphForCapture(c: Capture) {
    switch (c.source_type) {
        case 'voice': return <VoiceGlyph />;
        case 'journal': return <JournalGlyph />;
        case 'shared_link': return <LinkGlyph />;
        default: return <CaptureGlyph />;
    }
}

function glyphForKind(kind: 'note' | 'insight' | 'missing_gaps') {
    if (kind === 'insight') return <SparkleGlyph />;
    if (kind === 'missing_gaps') return <GapGlyph />;
    return <NoteGlyph />;
}

// ── Tile ───────────────────────────────────────────────────

export function TopicEntryTile({ item, size, onPress }: TopicEntryTileProps) {
    const isCapture = item.kind === 'capture';
    const moodColor = isCapture
        ? (getMoodTheme(item.capture.mood_id || item.capture.mood_name_snapshot)?.solid ?? 'rgba(255,255,255,0.10)')
        : null;

    const accent =
        item.kind === 'insight'
            ? 'rgba(139,34,82,0.65)'
            : item.kind === 'missing_gaps'
                ? 'rgba(120,150,210,0.55)'
                : item.kind === 'note'
                    ? 'rgba(255,255,255,0.20)'
                    : moodColor || 'rgba(255,255,255,0.20)';

    const date = isCapture ? formatDate(item.capture.created_at) : formatDate(item.note.createdAt);
    const { title, body } = isCapture ? previewForCapture(item.capture) : previewForNote(item.note);

    const thumbnail =
        isCapture && (item.capture.source_type === 'shared_link'
            ? item.capture.shared_link_thumbnail_url
            : item.capture.image_url && !item.capture.image_url.startsWith('blank://')
                ? item.capture.image_url
                : null);

    return (
        <Pressable
            style={[styles.tile, { width: size, height: size, borderLeftColor: accent }]}
            onPress={() => onPress(item)}
        >
            {/* Optional thumbnail layer */}
            {thumbnail ? (
                <Image source={{ uri: thumbnail }} style={styles.thumbnail} blurRadius={0} />
            ) : null}
            {thumbnail ? <View style={styles.thumbnailDarken} /> : null}

            {/* Top row: type chip + date */}
            <View style={styles.topRow}>
                <View style={[styles.typeChip, { backgroundColor: accent }]}>
                    {isCapture ? glyphForCapture(item.capture) : glyphForKind(item.kind)}
                </View>
                <Text style={styles.dateText}>{date}</Text>
            </View>

            {/* Body */}
            <View style={styles.bodyArea}>
                <Text style={styles.title} numberOfLines={1}>
                    {title}
                </Text>
                <Text style={styles.preview} numberOfLines={3}>
                    {body}
                </Text>
            </View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    tile: {
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        borderLeftWidth: 2,
        padding: 11,
        justifyContent: 'space-between',
        overflow: 'hidden',
    },
    thumbnail: {
        ...StyleSheet.absoluteFillObject,
        opacity: 0.45,
    },
    thumbnailDarken: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(6,6,10,0.55)',
    },
    topRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    typeChip: {
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dateText: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.45)',
        fontWeight: '500',
        letterSpacing: 0.3,
        textTransform: 'uppercase',
    },
    bodyArea: {
        gap: 3,
    },
    title: {
        fontSize: 12.5,
        fontWeight: '600',
        color: '#fff',
        letterSpacing: -0.1,
    },
    preview: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.65)',
        lineHeight: 15,
    },
});

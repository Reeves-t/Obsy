import React from 'react';
import { StyleSheet, View, Text, Pressable, Image } from 'react-native';
import Svg, { Path, Circle as SvgCircle } from 'react-native-svg';
import type { Capture } from '@/types/capture';
import type { TopicNote } from '@/lib/topicStore';
import type { TopicAttachment } from '@/services/topicAttachments';
import { getMoodTheme } from '@/lib/moods';

export type TopicEntryItem =
    | { kind: 'capture'; capture: Capture }
    | { kind: 'note' | 'insight' | 'missing_gaps'; note: TopicNote }
    | { kind: 'attachment'; attachment: TopicAttachment };

export const TOPIC_ENTRY_TYPE_LABELS: Record<TopicEntryItem['kind'], string> = {
    capture: 'Captures',
    note: 'Notes',
    insight: 'Insights',
    missing_gaps: 'Gaps',
    attachment: 'Files',
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

function formatBytes(bytes: number | null): string {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function previewForAttachment(a: TopicAttachment): { title: string; body: string } {
    const sizeLabel = formatBytes(a.size_bytes);
    const typeLabel = a.kind === 'image' ? 'Image' : (a.mime_type?.split('/')[1]?.toUpperCase() || 'Document');
    return {
        title: a.file_name,
        body: sizeLabel ? `${typeLabel} · ${sizeLabel}` : typeLabel,
    };
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

function glyphForAttachment(a: TopicAttachment) {
    if (a.kind === 'image') {
        return (
            <Svg width={11} height={11} viewBox="0 0 16 16" fill="none">
                <Path
                    d="M2 3.5h12v9H2z M2 11l3-3 2 2 3-3 4 4"
                    stroke="rgba(255,255,255,0.85)"
                    strokeWidth={1.2}
                    strokeLinejoin="round"
                />
                <SvgCircle cx={5} cy={6} r={1} stroke="rgba(255,255,255,0.85)" strokeWidth={1.2} />
            </Svg>
        );
    }
    // Document glyph (page with folded corner)
    return (
        <Svg width={11} height={11} viewBox="0 0 16 16" fill="none">
            <Path
                d="M3.5 2h6.5L13 5v8.5H3.5V2z M10 2v3h3"
                stroke="rgba(255,255,255,0.85)"
                strokeWidth={1.2}
                strokeLinejoin="round"
            />
        </Svg>
    );
}

// ── Tile ───────────────────────────────────────────────────

export function TopicEntryTile({ item, size, onPress }: TopicEntryTileProps) {
    // Derive accent color, glyph, date, title/body, optional thumbnail per kind.
    let accent = 'rgba(255,255,255,0.20)';
    let glyph: React.ReactNode = null;
    let date = '';
    let title = '';
    let body = '';
    let thumbnail: string | null = null;

    if (item.kind === 'capture') {
        const moodColor = getMoodTheme(item.capture.mood_id || item.capture.mood_name_snapshot)?.solid;
        accent = moodColor || 'rgba(255,255,255,0.20)';
        glyph = glyphForCapture(item.capture);
        date = formatDate(item.capture.created_at);
        const p = previewForCapture(item.capture);
        title = p.title;
        body = p.body;
        thumbnail = item.capture.source_type === 'shared_link'
            ? item.capture.shared_link_thumbnail_url ?? null
            : (item.capture.image_url && !item.capture.image_url.startsWith('blank://')
                ? item.capture.image_url
                : null);
    } else if (item.kind === 'attachment') {
        accent = item.attachment.kind === 'image'
            ? 'rgba(255,200,120,0.55)'
            : 'rgba(180,170,230,0.55)';
        glyph = glyphForAttachment(item.attachment);
        date = formatDate(item.attachment.created_at);
        const p = previewForAttachment(item.attachment);
        title = p.title;
        body = p.body;
    } else {
        accent = item.kind === 'insight'
            ? 'rgba(139,34,82,0.65)'
            : item.kind === 'missing_gaps'
                ? 'rgba(120,150,210,0.55)'
                : 'rgba(255,255,255,0.20)';
        glyph = glyphForKind(item.kind);
        date = formatDate(item.note.createdAt);
        const p = previewForNote(item.note);
        title = p.title;
        body = p.body;
    }

    return (
        <Pressable
            style={[styles.tile, { width: size, height: size, borderLeftColor: accent }]}
            onPress={() => onPress(item)}
        >
            {/* Optional thumbnail layer (captures only — attachment image previews
                need a signed URL fetched on demand, handled in the viewer modal) */}
            {thumbnail ? (
                <Image source={{ uri: thumbnail }} style={styles.thumbnail} blurRadius={0} />
            ) : null}
            {thumbnail ? <View style={styles.thumbnailDarken} /> : null}

            {/* Top row: type chip + date */}
            <View style={styles.topRow}>
                <View style={[styles.typeChip, { backgroundColor: accent }]}>
                    {glyph}
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

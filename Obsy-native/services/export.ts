import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Share, Platform } from 'react-native';
import { format } from 'date-fns';
import { getProfile } from './profile';
import { fetchArchives } from './archive';
import { getCustomTones } from '@/lib/customTone';
import { useCaptureStore } from '@/lib/captureStore';
import { useYearInPixelsStore } from '@/lib/yearInPixelsStore';

export interface ExportData {
    exportedAt: string;
    version: '1.0';
    profile: {
        id: string;
        ai_tone: string;
        selected_custom_tone_id?: string | null;
    };
    captures: Array<{
        id: string;
        created_at: string;
        mood_id: string;
        mood_name: string;
        note: string | null;
        tags: string[];
        obsy_note: string | null;
    }>;
    archives: Array<{
        id: string;
        type: string;
        title: string;
        body: string;
        date_scope: string;
        tone: string | null;
        tags: string[];
        created_at: string;
    }>;
    customTones: Array<{
        id: string;
        name: string;
        prompt: string;
        created_at: string;
    }>;
    yearInPixels: {
        year: number;
        legend: Array<{ id: string; color: string; label: string }>;
        pixels: Record<string, { color: string | null; date: string }>;
    };
    stats: {
        totalCaptures: number;
        totalArchives: number;
        totalCustomTones: number;
        dateRange: { first: string | null; last: string | null };
    };
}

export async function buildExportData(userId: string): Promise<ExportData> {
    const [profile, archives, customTones] = await Promise.all([
        getProfile(),
        fetchArchives(userId),
        getCustomTones(),
    ]);

    const captures = useCaptureStore.getState().captures;
    const { year, pixels, legend } = useYearInPixelsStore.getState();

    const sortedCaptures = [...captures].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    // Strip image URLs (local file paths aren't useful in export)
    const cleanCaptures = sortedCaptures.map(c => ({
        id: c.id,
        created_at: c.created_at,
        mood_id: c.mood_id,
        mood_name: c.mood_name_snapshot || c.mood_id,
        note: c.note || null,
        tags: c.tags || [],
        obsy_note: c.obsy_note || null,
    }));

    const cleanArchives = archives.map(a => ({
        id: a.id,
        type: a.type,
        title: a.title || '',
        body: a.body || '',
        date_scope: a.date_scope || '',
        tone: a.tone || null,
        tags: a.tags || [],
        created_at: a.created_at,
    }));

    const cleanTones = customTones.map(t => ({
        id: t.id,
        name: t.name,
        prompt: t.prompt,
        created_at: t.created_at,
    }));

    // Simplify pixel data (strip strokes/photos for the export)
    const cleanPixels: Record<string, { color: string | null; date: string }> = {};
    for (const [dateKey, pixel] of Object.entries(pixels)) {
        if (pixel.color) {
            cleanPixels[dateKey] = { color: pixel.color, date: dateKey };
        }
    }

    const cleanLegend = legend.map(l => ({
        id: l.id,
        color: l.color,
        label: l.label,
    }));

    return {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        profile: {
            id: profile?.id || userId,
            ai_tone: profile?.ai_tone || 'neutral',
            selected_custom_tone_id: profile?.selected_custom_tone_id,
        },
        captures: cleanCaptures,
        archives: cleanArchives,
        customTones: cleanTones,
        yearInPixels: {
            year,
            legend: cleanLegend,
            pixels: cleanPixels,
        },
        stats: {
            totalCaptures: cleanCaptures.length,
            totalArchives: cleanArchives.length,
            totalCustomTones: cleanTones.length,
            dateRange: {
                first: sortedCaptures[0]?.created_at || null,
                last: sortedCaptures[sortedCaptures.length - 1]?.created_at || null,
            },
        },
    };
}

export async function exportUserData(userId: string): Promise<void> {
    const data = await buildExportData(userId);
    const json = JSON.stringify(data, null, 2);

    const dateStr = format(new Date(), 'yyyy-MM-dd');
    const filename = `obsy-export-${dateStr}.json`;
    const filePath = `${FileSystem.cacheDirectory}${filename}`;

    await FileSystem.writeAsStringAsync(filePath, json, {
        encoding: FileSystem.EncodingType.UTF8,
    });

    if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath, {
            mimeType: 'application/json',
            dialogTitle: 'Export Obsy Data',
            UTI: 'public.json',
        });
    } else {
        // Fallback for platforms without native share
        await Share.share({
            title: 'Obsy Data Export',
            message: json.slice(0, 500) + '…\n\n(Full export requires a device with file sharing)',
        });
    }
}

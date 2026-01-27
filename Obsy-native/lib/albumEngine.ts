import { supabase } from '@/lib/supabase';
import { getLocalDayKey } from '@/lib/utils';

export interface AlbumContextEntry {
    id: string;
    user_name: string;
    time: string; // HH:MM
    mood: string;
    description: string;
}

export async function getAlbumDayContext(albumId: string): Promise<AlbumContextEntry[]> {
    try {
        // 1. Get today's date range in local time (or UTC if simplified)
        // For now, we'll use the server's UTC day to match the SQL default
        // Ideally, we should pass the user's local timezone, but let's stick to the prompt's "Today"

        const today = new Date();
        const startOfDay = new Date(today);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(today);
        endOfDay.setHours(23, 59, 59, 999);

        // 2. Fetch entries for this album created today
        // We fetch entries first, then profiles separately (no FK between entries and profiles)
        // Fetch all album entries for the day (no filtering by use_photo_for_insight)
        const { data, error } = await supabase
            .from('album_entries')
            .select(`
                created_at,
                entries!inner (
                    id,
                    mood,
                    mood_name_snapshot,
                    note,
                    ai_summary,
                    photo_path,
                    created_at,
                    user_id
                )
            `)
            .eq('album_id', albumId)
            .gte('created_at', startOfDay.toISOString())
            .lte('created_at', endOfDay.toISOString())
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Error fetching album entries:', error);
            return [];
        }

        if (!data || data.length === 0) {
            return [];
        }

        // 2b. Fetch profiles separately for the user_ids we have
        const userIds = [...new Set(data.map((item: any) => item.entries.user_id))];
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', userIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

        // 3. Map to AlbumContextEntry
        const context: AlbumContextEntry[] = data.map((entry: any) => {
            const capture = entry.entries;
            const date = new Date(capture.created_at);

            // Format time as HH:MM
            const time = date.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });

            // Get first name from profileMap, with fallback if not found
            const fullName = profileMap.get(capture.user_id);
            const userName = fullName ? fullName.split(' ')[0] : 'Someone';

            // Use ai_summary (AI-generated obsy_note) as the description
            // Use mood_name_snapshot for AI context (human-readable)
            // NEVER use capture.note as it is for the user's private journal
            const description = capture.ai_summary || `A ${capture.mood_name_snapshot || 'neutral'} moment.`;

            return {
                id: capture.id,
                user_name: userName,
                time: time,
                mood: capture.mood_name_snapshot || capture.mood || 'Neutral',
                description: description
            };
        });

        return context;

    } catch (error) {
        console.error('Unexpected error in getAlbumDayContext:', error);
        return [];
    }
}

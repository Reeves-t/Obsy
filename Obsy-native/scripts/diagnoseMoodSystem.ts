import { supabase } from '@/lib/supabase';

export async function diagnoseMoodSystem() {
    console.log('=== Mood System Diagnostic ===\n');

    // 1. Check moods table
    const { data: moods, error: moodsError } = await supabase
        .from('moods')
        .select('type')
        .then(async (result) => {
            if (result.error) return result;
            // Group by type manually since Supabase doesn't support GROUP BY in select
            const typeCounts: Record<string, number> = {};
            result.data?.forEach((m: any) => {
                typeCounts[m.type] = (typeCounts[m.type] || 0) + 1;
            });
            return { data: typeCounts, error: null };
        });
    
    console.log('Moods table counts by type:', moods, moodsError);

    // 2. Check function exists by testing it
    const { data: funcCheck, error: funcError } = await supabase
        .rpc('validate_mood_reference', { mood_id: 'calm' });
    
    console.log('Function test (calm):', { result: funcCheck, error: funcError });

    // 3. Check sample entries
    const { data: entries, error: entriesError } = await supabase
        .from('entries')
        .select('id, mood, mood_name_snapshot')
        .limit(5);
    
    console.log('Sample entries:', entries, entriesError);

    // 4. Check for entries with NULL mood_name_snapshot
    const { data: nullSnapshots, error: nullError } = await supabase
        .from('entries')
        .select('id, mood, mood_name_snapshot')
        .is('mood_name_snapshot', null)
        .limit(5);
    
    console.log('Entries with NULL mood_name_snapshot:', nullSnapshots, nullError);

    // 5. Check for orphaned mood references (moods that don't exist)
    const { data: allEntries, error: allEntriesError } = await supabase
        .from('entries')
        .select('id, mood')
        .not('mood', 'is', null)
        .limit(100);

    if (allEntries && !allEntriesError) {
        const moodIds = [...new Set(allEntries.map(e => e.mood))];
        const { data: existingMoods, error: existingError } = await supabase
            .from('moods')
            .select('id')
            .in('id', moodIds);

        const existingMoodIds = new Set(existingMoods?.map(m => m.id) || []);
        const orphanedEntries = allEntries.filter(e => !existingMoodIds.has(e.mood));
        
        console.log('Orphaned mood references:', {
            totalEntriesChecked: allEntries.length,
            uniqueMoodIds: moodIds.length,
            existingMoods: existingMoods?.length,
            orphanedCount: orphanedEntries.length,
            orphanedSample: orphanedEntries.slice(0, 5)
        });
    }

    console.log('\n=== Diagnostic Complete ===');
}


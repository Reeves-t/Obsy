import { Mood } from '@/types/mood';
import { MoodGradient } from './types';
import { generateMoodGradient } from './theme';

/**
 * Pre-built 3-stop gradient schemes for custom moods.
 * Assigned in order as users create custom moods.
 * Built from colors that don't appear as primaries in any preset mood,
 * ensuring custom moods look distinct from the system palette.
 */
export const CUSTOM_MOOD_POOL: Array<{ id: string } & MoodGradient> = [
    {
        id: 'custom_pool_1',
        primary:   '#F2A679',  // warm peach
        mid:       '#D9A0C5',  // dusty pink
        secondary: '#7C3F8C',  // dusty amethyst
    },
    {
        id: 'custom_pool_2',
        primary:   '#84C1C4',  // dusty teal
        mid:       '#F2D6A2',  // warm cream gold
        secondary: '#A65D63',  // muted rose
    },
    {
        id: 'custom_pool_3',
        primary:   '#E0B64A',  // bright gold
        mid:       '#A576A6',  // muted orchid
        secondary: '#54678C',  // slate blue
    },
    {
        id: 'custom_pool_4',
        primary:   '#A3BFBA',  // dusty sage teal
        mid:       '#BF8888',  // faded rose
        secondary: '#653273',  // deep plum
    },
    {
        id: 'custom_pool_5',
        primary:   '#F26B5E',  // salmon coral
        mid:       '#A68863',  // dusty metallic gold
        secondary: '#025949',  // deep emerald
    },
    {
        id: 'custom_pool_6',
        primary:   '#AED3F2',  // soft periwinkle
        mid:       '#F2AD94',  // dusty peach
        secondary: '#73323E',  // deep raspberry
    },
    {
        id: 'custom_pool_7',
        primary:   '#D9ADAD',  // dusty blush
        mid:       '#629799',  // jewel teal
        secondary: '#2F1B59',  // deep indigo
    },
    {
        id: 'custom_pool_8',
        primary:   '#F2D0D0',  // soft blush
        mid:       '#B9C48D',  // sage green
        secondary: '#4F818C',  // deep dusty teal
    },
    {
        id: 'custom_pool_9',
        primary:   '#E08B4A',  // amber orange
        mid:       '#84A9BF',  // powder blue
        secondary: '#4B32A6',  // deep violet
    },
    {
        id: 'custom_pool_10',
        primary:   '#BACDD9',  // icy blue gray
        mid:       '#E0A44A',  // warm amber
        secondary: '#A62139',  // deep rose crimson
    },
];

/**
 * Assign a 3-stop gradient to a new custom mood.
 *
 * Works through the pool in order. Once all 10 are claimed,
 * falls back to a deterministic hash-based gradient from the mood name.
 */
export function assignCustomMoodGradient(
    moodName: string,
    existingCustomMoods: Pick<Mood, 'color_pool_id'>[],
): { poolId: string | null } & MoodGradient {
    const usedIds = new Set(
        existingCustomMoods.map(m => m.color_pool_id).filter(Boolean)
    );

    const available = CUSTOM_MOOD_POOL.find(p => !usedIds.has(p.id));

    if (available) {
        return {
            poolId:    available.id,
            primary:   available.primary,
            mid:       available.mid,
            secondary: available.secondary,
        };
    }

    // Pool exhausted — generate deterministically from the mood name
    const generated = generateMoodGradient(moodName);
    return { poolId: null, ...generated };
}

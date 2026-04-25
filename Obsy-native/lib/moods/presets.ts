import { MoodId, MOODS } from '@/constants/Moods';
import { MoodGradient, PresetMood } from './types';

/**
 * Handcrafted 3-stop radial gradients for all 40 system moods.
 *
 * Design principles (dusty pastel & jewel tone palette):
 * - primary:   dominant/center color — the emotional "face" of the mood
 * - mid:       transition tone — bridges primary → secondary
 * - secondary: shadow/depth color — visible at orb edges
 *
 * Moods with design-doc equivalents use those exact values.
 * Remaining moods are mapped using the same master color palette for
 * visual coherence across the full set.
 */
export const MOOD_GRADIENT_MAP: Record<MoodId, MoodGradient> = {
    // ── Low Energy (13) ─────────────────────────────────────────────────
    calm:        { primary: '#84C1C4', mid: '#A3BFBA', secondary: '#629799' },   // dusty teal → sage teal → jewel teal
    relaxed:     { primary: '#AED3F2', mid: '#789EBF', secondary: '#4F818C' },   // soft periwinkle → steel blue → deep dusty teal
    peaceful:    { primary: '#BACDD9', mid: '#84A9BF', secondary: '#54678C' },   // icy blue gray → powder blue → slate blue
    tired:       { primary: '#8FA9BF', mid: '#54678C', secondary: '#2F1B59' },   // dusty blue → slate blue → deep indigo
    drained:     { primary: '#C49D84', mid: '#A6654E', secondary: '#592D23' },   // dusty terracotta → burnt umber → dark umber
    bored:       { primary: '#D9ADAD', mid: '#BBABC4', secondary: '#8FA9BF' },   // dusty blush → muted lavender → dusty blue
    reflective:  { primary: '#BBABC4', mid: '#A576A6', secondary: '#7C3F8C' },   // muted lavender → muted orchid → dusty amethyst
    melancholy:  { primary: '#84A9BF', mid: '#7C3F8C', secondary: '#653273' },   // powder blue → dusty amethyst → deep plum
    nostalgic:   { primary: '#F2D6A2', mid: '#BBABC4', secondary: '#653273' },   // warm cream gold → muted lavender → deep plum
    lonely:      { primary: '#84A9BF', mid: '#BBABC4', secondary: '#73323E' },   // powder blue → muted lavender → deep raspberry
    depressed:   { primary: '#54678C', mid: '#244673', secondary: '#2F1B59' },   // slate blue → deep navy jewel → deep indigo
    numb:        { primary: '#8FA9BF', mid: '#BACDD9', secondary: '#54678C' },   // dusty blue → icy gray blue → slate blue
    safe:        { primary: '#C5EDD8', mid: '#A3BFBA', secondary: '#629799' },   // ice green → dusty sage teal → jewel teal

    // ── Medium Energy (10) ──────────────────────────────────────────────
    neutral:     { primary: '#EDDFC5', mid: '#D9ADAD', secondary: '#BBABC4' },   // soft vanilla → dusty blush → muted lavender
    focused:     { primary: '#789EBF', mid: '#54678C', secondary: '#244673' },   // steel blue → slate blue → deep navy jewel
    grateful:    { primary: '#F2D6A2', mid: '#C49D84', secondary: '#A68863' },   // warm cream gold → dusty terracotta → dusty metallic gold
    hopeful:     { primary: '#B9C48D', mid: '#A3BFBA', secondary: '#025949' },   // sage green → dusty sage teal → deep emerald
    curious:     { primary: '#C5ECED', mid: '#84A9BF', secondary: '#4F818C' },   // ice teal → powder blue → deep dusty teal
    scattered:   { primary: '#F2D0D0', mid: '#D9ADAD', secondary: '#BBABC4' },   // soft blush → dusty blush → muted lavender
    annoyed:     { primary: '#D94F30', mid: '#A62139', secondary: '#73323E' },   // burnt coral → deep rose crimson → deep raspberry
    unbothered:  { primary: '#F2D6B3', mid: '#EDD4C5', secondary: '#C49D84' },   // warm cream → soft peach cream → dusty terracotta
    awkward:     { primary: '#EDD4C5', mid: '#BF8888', secondary: '#A65D63' },   // soft peach cream → faded rose → muted rose
    tender:      { primary: '#D9A0C5', mid: '#BF8888', secondary: '#A65D63' },   // dusty pink → faded rose → muted rose

    // ── High Energy (17) ────────────────────────────────────────────────
    productive:  { primary: '#789EBF', mid: '#4F818C', secondary: '#025949' },   // steel blue → deep dusty teal → deep emerald
    creative:    { primary: '#E0B64A', mid: '#A576A6', secondary: '#653273' },   // bright gold → muted orchid → deep plum
    inspired:    { primary: '#D9A0C5', mid: '#A576A6', secondary: '#653273' },   // dusty pink → muted orchid → deep plum
    confident:   { primary: '#E0A44A', mid: '#D98452', secondary: '#A6654E' },   // warm amber → warm sienna → burnt umber
    joyful:      { primary: '#F2D6A2', mid: '#F2AD94', secondary: '#F2913D' },   // warm cream gold → dusty peach → tangerine
    social:      { primary: '#F2A679', mid: '#F2913D', secondary: '#D95F76' },   // warm peach → tangerine → coral pink
    busy:        { primary: '#F2AB27', mid: '#E0A44A', secondary: '#D98452' },   // rich amber → warm amber → warm sienna
    restless:    { primary: '#7C3F8C', mid: '#653273', secondary: '#4B32A6' },   // dusty amethyst → deep plum → deep violet
    stressed:    { primary: '#E0714A', mid: '#D94F30', secondary: '#A62139' },   // orange red → burnt coral → deep rose crimson
    overwhelmed: { primary: '#D95F76', mid: '#7C3F8C', secondary: '#4B32A6' },   // coral pink → dusty amethyst → deep violet
    anxious:     { primary: '#E0714A', mid: '#C49D84', secondary: '#A6654E' },   // orange red → dusty terracotta → burnt umber
    angry:       { primary: '#D94F30', mid: '#A62139', secondary: '#592D23' },   // burnt coral → deep rose crimson → dark umber
    pressured:   { primary: '#F29D52', mid: '#E0714A', secondary: '#D94F30' },   // bright amber → orange red → burnt coral
    enthusiastic:{ primary: '#F2913D', mid: '#F26B5E', secondary: '#D95F76' },   // tangerine → salmon coral → coral pink
    hyped:       { primary: '#F2AB27', mid: '#F2913D', secondary: '#F26B5E' },   // rich amber → tangerine → salmon coral
    manic:       { primary: '#F26B5E', mid: '#D95F76', secondary: '#7C3F8C' },   // salmon coral → coral pink → dusty amethyst
    playful:     { primary: '#D95F76', mid: '#F2913D', secondary: '#E0C94A' },   // coral pink → tangerine → warm yellow
};

/**
 * Complete preset mood list with gradient data.
 * Built from the canonical MOODS array + gradient map.
 */
export const MOODS_PRESET: PresetMood[] = MOODS.map(m => ({
    id: m.id,
    label: m.label,
    tone: m.tone,
    gradient: MOOD_GRADIENT_MAP[m.id],
}));

/**
 * Quick lookup map: MoodId → PresetMood
 */
export const MOOD_MAP: Map<MoodId, PresetMood> = new Map(
    MOODS_PRESET.map(m => [m.id, m])
);

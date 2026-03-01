import { MoodId, MOODS } from '@/constants/Moods';
import { MoodGradient, PresetMood } from './types';

/**
 * Handcrafted 2-stop gradients for all 40 system moods.
 *
 * Design principles:
 * - Each gradient spans ~20-40 hue degrees between stops for visual richness
 * - Low moods spread across the full cool spectrum (teal → blue → purple)
 *   instead of clustering in the same blue-gray lane
 * - No two moods in the same tone band share similar avg hue + lightness
 * - Overall palette stays "Obsy calm": muted saturation, no neon (except manic/hyped)
 * - `from` is the lighter/brighter stop, `to` is the deeper/darker stop
 */
export const MOOD_GRADIENT_MAP: Record<MoodId, MoodGradient> = {
    // ── Low Energy (13) ─────────────────────────────────────────────────
    // Spread across teal (160°) → blue (220°) → purple (290°)
    calm:        { from: '#7DD3C8', to: '#5BAED6' },   // teal → sky blue
    relaxed:     { from: '#6BCBAB', to: '#4DA69D' },   // seafoam → deep teal
    peaceful:    { from: '#88E0E0', to: '#60C4D4' },   // cyan → aqua
    tired:       { from: '#9896C8', to: '#706AA0' },   // periwinkle → muted indigo
    drained:     { from: '#7A8CA4', to: '#5A6B84' },   // steel → slate blue
    bored:       { from: '#B0A8C4', to: '#8E8EA6' },   // lavender → ash gray
    reflective:  { from: '#B4A8E4', to: '#9488D0' },   // soft purple → lilac
    melancholy:  { from: '#9A7ED0', to: '#7660B8' },   // orchid → deep violet
    nostalgic:   { from: '#D0A8E0', to: '#B488C8' },   // orchid pink → mauve
    lonely:      { from: '#6A88B8', to: '#4A6898' },   // steel blue → navy
    depressed:   { from: '#605A90', to: '#3E3870' },   // dusk indigo → ink
    numb:        { from: '#9CAAB4', to: '#7A8894' },   // cool gray → slate
    safe:        { from: '#A0CCC8', to: '#80B4A8' },   // warm teal → sage

    // ── Medium Energy (10) ──────────────────────────────────────────────
    // Neutral + warm/cool mix for transitions and anchors
    neutral:     { from: '#B4B0AC', to: '#949498' },   // warm gray → cool gray
    focused:     { from: '#8AA4BE', to: '#6A88A4' },   // steel → denim
    grateful:    { from: '#B0C496', to: '#8EA878' },   // sage → olive green
    hopeful:     { from: '#8CD4F0', to: '#64BCE0' },   // sky → clear cyan
    curious:     { from: '#C8A0E0', to: '#A880D0' },   // bright orchid → purple
    scattered:   { from: '#D0CCC0', to: '#B8B0A0' },   // ecru → sand
    annoyed:     { from: '#C8B498', to: '#B09878' },   // tan → warm brown
    unbothered:  { from: '#BCC8D4', to: '#A0B0C0' },   // ice → pale blue
    awkward:     { from: '#BCA8B8', to: '#A090A0' },   // mauve → gray rose
    tender:      { from: '#F0C0D8', to: '#D8A0C0' },   // dusty rose → pink

    // ── High Energy (17) ────────────────────────────────────────────────
    // Warm, vibrant, full spectrum — high visual energy
    productive:  { from: '#20B8F0', to: '#0890D0' },   // electric blue → deep sky
    creative:    { from: '#FCC832', to: '#E8A820' },   // amber → gold
    inspired:    { from: '#F8AE18', to: '#E89008' },   // golden → deep orange
    confident:   { from: '#FCA048', to: '#E88028' },   // sunset → tangerine
    joyful:      { from: '#F888C0', to: '#E060A0' },   // pink → hot pink
    social:      { from: '#FC8090', to: '#E46078' },   // watermelon → rose
    busy:        { from: '#FF7878', to: '#E05858' },   // coral → warm red
    restless:    { from: '#FF8868', to: '#E06848' },   // orange-red → burnt
    stressed:    { from: '#E83838', to: '#C01818' },   // scarlet → crimson
    overwhelmed: { from: '#A82848', to: '#881030' },   // burgundy → dark wine
    anxious:     { from: '#E050B0', to: '#C83898' },   // magenta → deep pink
    angry:       { from: '#A82020', to: '#881010' },   // dark red → deep crimson
    pressured:   { from: '#F46858', to: '#D84838' },   // tomato → brick
    enthusiastic:{ from: '#FCC068', to: '#E8A048' },   // peach → warm amber
    hyped:       { from: '#FFE020', to: '#E8C400' },   // bright gold → deep gold
    manic:       { from: '#FF20FF', to: '#D800E0' },   // electric magenta → neon purple
    playful:     { from: '#FC8828', to: '#E07010' },   // bright orange → deep amber
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

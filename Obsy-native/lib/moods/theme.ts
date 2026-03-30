import { MoodId, isCustomMoodId } from '@/constants/Moods';
import { moodCache } from '@/lib/moodCache';
import { MOOD_GRADIENT_MAP, MOOD_MAP } from './presets';
import { MoodGradient, MoodTheme } from './types';

// ── Color math helpers ──────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    return [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16),
    ];
}

function rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map(c =>
        Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')
    ).join('');
}

function hslToHex(h: number, s: number, l: number): string {
    s /= 100;
    l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

/** djb2 hash for deterministic color generation */
function hashString(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) + str.charCodeAt(i);
    }
    return hash >>> 0;
}

/**
 * WCAG relative luminance of an RGB color.
 * Values 0 (black) to 1 (white).
 */
function relativeLuminance(r: number, g: number, b: number): number {
    const [rs, gs, bs] = [r, g, b].map(c => {
        c /= 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/** Blend two hex colors at the midpoint */
function blendHex(a: string, b: string): string {
    const [r1, g1, b1] = hexToRgb(a);
    const [r2, g2, b2] = hexToRgb(b);
    return rgbToHex(
        Math.round((r1 + r2) / 2),
        Math.round((g1 + g2) / 2),
        Math.round((b1 + b2) / 2),
    );
}

// ── Derivation helpers ──────────────────────────────────────────────────

/**
 * Single representative color for a mood gradient.
 * Uses the mid stop directly — it IS the visual center of the 3-stop gradient.
 */
export function gradientMidpoint(gradient: MoodGradient): string {
    return gradient.mid;
}

/** Whether text on this gradient should be light or dark for readability */
export function contrastTextColor(gradient: MoodGradient): 'light' | 'dark' {
    const mid = gradientMidpoint(gradient);
    const [r, g, b] = hexToRgb(mid);
    const lum = relativeLuminance(r, g, b);
    return lum > 0.35 ? 'dark' : 'light';
}

// ── Custom mood gradient generation ─────────────────────────────────────

/**
 * Generate a deterministic 3-stop gradient from a mood name.
 * Same name always produces the same gradient — no API calls needed.
 */
export function generateMoodGradient(name: string): MoodGradient {
    const hash = hashString(name.toLowerCase().trim());
    const baseHue = hash % 360;
    const saturation = 55;

    const primaryHue = (baseHue - 15 + 360) % 360;
    const primary = hslToHex(primaryHue, saturation, 62);

    const mid = hslToHex(baseHue, saturation, 55);

    const secondaryHue = (baseHue + 20) % 360;
    const secondary = hslToHex(secondaryHue, saturation, 44);

    return { primary, mid, secondary };
}

// ── Theme cache ─────────────────────────────────────────────────────────

const DEFAULT_GRADIENT: MoodGradient = { primary: '#A8A8A8', mid: '#909090', secondary: '#808080' };

// Cache built themes to avoid recomputation on hot paths (MoodRingDial renders 180 segments)
const themeCache = new Map<string, MoodTheme>();

function buildTheme(
    id: string,
    label: string,
    tone: 'low' | 'medium' | 'high',
    gradient: MoodGradient,
): MoodTheme {
    const solid = gradientMidpoint(gradient);
    return { id, label, tone, gradient, solid, textOn: contrastTextColor(gradient) };
}

// ── Main API ────────────────────────────────────────────────────────────

/**
 * Get the full design token for any mood (system or custom).
 *
 * Resolution order:
 * 1. Preset mood by ID → handcrafted 3-stop gradient
 * 2. Cached custom mood from DB → stored colors or deterministic from name
 * 3. Custom-looking ID → deterministic gradient from ID
 * 4. Fallback → treat as a name string, generate gradient deterministically
 */
export function getMoodTheme(moodIdOrLabel: string): MoodTheme {
    // Check cache first
    const cached = themeCache.get(moodIdOrLabel);
    if (cached) return cached;

    let theme: MoodTheme;

    // 1. Preset mood lookup
    const preset = MOOD_MAP.get(moodIdOrLabel as MoodId);
    if (preset) {
        theme = buildTheme(preset.id, preset.label, preset.tone, preset.gradient);
        themeCache.set(moodIdOrLabel, theme);
        return theme;
    }

    // 2. Custom mood from cache — prefer stored colors, fall back to hash
    const dbMood = moodCache.getMoodById(moodIdOrLabel);
    if (dbMood) {
        let gradient: MoodGradient;
        if (dbMood.gradient_from && dbMood.gradient_to) {
            gradient = {
                primary: dbMood.gradient_from,
                mid: dbMood.gradient_mid ?? blendHex(dbMood.gradient_from, dbMood.gradient_to),
                secondary: dbMood.gradient_to,
            };
        } else {
            gradient = generateMoodGradient(dbMood.name);
        }
        theme = buildTheme(dbMood.id, dbMood.name, 'medium', gradient);
        themeCache.set(moodIdOrLabel, theme);
        return theme;
    }

    // 3. Looks like a custom_xxx ID
    if (isCustomMoodId(moodIdOrLabel)) {
        const gradient = generateMoodGradient(moodIdOrLabel);
        theme = buildTheme(moodIdOrLabel, 'Custom Mood', 'medium', gradient);
        // Don't cache unresolved custom IDs — the DB mood may load later
        return theme;
    }

    // 4. Treat as a name/label string
    const gradient = generateMoodGradient(moodIdOrLabel);
    const label = moodIdOrLabel.charAt(0).toUpperCase() + moodIdOrLabel.slice(1);
    theme = buildTheme(moodIdOrLabel, label, 'medium', gradient);
    themeCache.set(moodIdOrLabel, theme);
    return theme;
}

/**
 * Invalidate the theme cache. Call when custom moods are created/deleted
 * or the mood cache is refreshed.
 */
export function invalidateMoodThemeCache(): void {
    themeCache.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// Theme Registry — Pluggable theme system for Obsy
//
// To add a new theme:
//   1. Add a ThemeDefinition object to the THEMES array below
//   2. Set contrast: 'dark' for dark backgrounds (white text/icons)
//      or contrast: 'light' for light backgrounds (dark text/icons)
//   3. That's it — colors, text, icons, and cards auto-derive from contrast
// ─────────────────────────────────────────────────────────────────────────────

export type ContrastMode = 'dark' | 'light';

export interface ThemeCornerColors {
    topLeft: string;
    topRight: string;
    bottomLeft: string;
    bottomRight: string;
}

export interface ThemeColors {
    background: string;
    text: string;
    textSecondary: string;
    textTertiary: string;
    cardBackground: string;
    cardText: string;
    cardTextSecondary: string;
    cardBorder: string;
    glass: string;
    glassBorder: string;
}

export interface ThemeDefinition {
    /** Unique identifier — stored in AsyncStorage */
    id: string;
    /** Display name shown in the theme picker */
    name: string;
    /** Determines text/icon treatment: 'dark' = white text, 'light' = dark text */
    contrast: ContrastMode;
    /** Main screen background color */
    background: string;
    /** Corner wash colors for the ambient background */
    cornerColors: ThemeCornerColors;
    /** Opacity of corner washes (0–1) */
    cornerOpacity: number;
    /** Optional color overrides — anything not specified auto-derives from contrast */
    overrides?: Partial<ThemeColors>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Contrast-based color derivation
// Dark contrast → light text/icons on dark background
// Light contrast → dark text/icons on light background
// ─────────────────────────────────────────────────────────────────────────────

const DARK_CONTRAST_COLORS: Omit<ThemeColors, 'background'> = {
    text: '#FFFFFF',
    textSecondary: 'rgba(255,255,255,0.6)',
    textTertiary: 'rgba(255,255,255,0.4)',
    cardBackground: 'rgba(255, 255, 255, 0.08)',
    cardText: '#FFFFFF',
    cardTextSecondary: 'rgba(255,255,255,0.6)',
    cardBorder: 'rgba(255, 255, 255, 0.1)',
    glass: 'rgba(255, 255, 255, 0.08)',
    glassBorder: 'rgba(255, 255, 255, 0.1)',
};

const LIGHT_CONTRAST_COLORS: Omit<ThemeColors, 'background'> = {
    text: '#1A1A1A',
    textSecondary: 'rgba(26,26,26,0.7)',
    textTertiary: 'rgba(26,26,26,0.5)',
    cardBackground: 'rgba(20, 20, 22, 0.92)',
    cardText: '#FFFFFF',
    cardTextSecondary: 'rgba(255,255,255,0.65)',
    cardBorder: 'rgba(255, 255, 255, 0.08)',
    glass: 'rgba(20, 20, 22, 0.92)',
    glassBorder: 'rgba(255, 255, 255, 0.08)',
};

/** Derive the full color set for a theme definition */
export function resolveThemeColors(theme: ThemeDefinition): ThemeColors {
    const base = theme.contrast === 'dark' ? DARK_CONTRAST_COLORS : LIGHT_CONTRAST_COLORS;
    return {
        background: theme.background,
        ...base,
        ...theme.overrides,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Theme Definitions
// ─────────────────────────────────────────────────────────────────────────────

export const THEMES: ThemeDefinition[] = [
    // ── Dark themes (white text/icons) ────────────────────────────────────
    {
        id: 'midnight',
        name: 'Midnight',
        contrast: 'dark',
        background: '#000000',
        cornerColors: {
            topLeft: '#FB923C',   // Orange
            topRight: '#60A5FA',  // Blue
            bottomLeft: '#34D399', // Green
            bottomRight: '#A78BFA', // Purple
        },
        cornerOpacity: 0.5,
    },
    {
        id: 'aurora',
        name: 'Aurora',
        contrast: 'dark',
        background: '#0A0A1A',
        cornerColors: {
            topLeft: '#2DD4BF',   // Teal
            topRight: '#22D3EE',  // Cyan
            bottomLeft: '#E879F9', // Magenta
            bottomRight: '#8B5CF6', // Violet
        },
        cornerOpacity: 0.45,
    },
    {
        id: 'ember',
        name: 'Ember',
        contrast: 'dark',
        background: '#0D0806',
        cornerColors: {
            topLeft: '#EF4444',   // Red
            topRight: '#F59E0B',  // Amber
            bottomLeft: '#FB923C', // Orange
            bottomRight: '#EAB308', // Gold
        },
        cornerOpacity: 0.4,
    },
    {
        id: 'ocean',
        name: 'Ocean',
        contrast: 'dark',
        background: '#020617',
        cornerColors: {
            topLeft: '#06B6D4',   // Cyan
            topRight: '#3B82F6',  // Blue
            bottomLeft: '#14B8A6', // Teal
            bottomRight: '#6366F1', // Indigo
        },
        cornerOpacity: 0.45,
    },

    // ── Light themes (dark text/icons) ────────────────────────────────────
    {
        id: 'kraft',
        name: 'Kraft',
        contrast: 'light',
        background: '#E8E4D9',
        cornerColors: {
            topLeft: '#FB923C',   // Orange
            topRight: '#60A5FA',  // Blue
            bottomLeft: '#34D399', // Green
            bottomRight: '#A78BFA', // Purple
        },
        cornerOpacity: 0.65,
    },
    {
        id: 'frost',
        name: 'Frost',
        contrast: 'light',
        background: '#E8EDF2',
        cornerColors: {
            topLeft: '#60A5FA',   // Blue
            topRight: '#67E8F9',  // Cyan
            bottomLeft: '#818CF8', // Indigo
            bottomRight: '#C4B5FD', // Lavender
        },
        cornerOpacity: 0.55,
    },
    {
        id: 'bloom',
        name: 'Bloom',
        contrast: 'light',
        background: '#F0E6E8',
        cornerColors: {
            topLeft: '#FB7185',   // Rose
            topRight: '#F97316',  // Coral
            bottomLeft: '#C084FC', // Mauve
            bottomRight: '#FDA4AF', // Blush
        },
        cornerOpacity: 0.55,
    },
    {
        id: 'sage',
        name: 'Sage',
        contrast: 'light',
        background: '#E2E8E0',
        cornerColors: {
            topLeft: '#86EFAC',   // Sage
            topRight: '#34D399',  // Mint
            bottomLeft: '#A3E635', // Olive
            bottomRight: '#4ADE80', // Forest
        },
        cornerOpacity: 0.55,
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Default theme IDs for each contrast mode */
export const DEFAULT_DARK_THEME = 'midnight';
export const DEFAULT_LIGHT_THEME = 'kraft';
export const DEFAULT_THEME = DEFAULT_DARK_THEME;

/** Look up a theme by ID (falls back to midnight) */
export function getThemeById(id: string): ThemeDefinition {
    return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/** Get all dark-contrast themes */
export function getDarkThemes(): ThemeDefinition[] {
    return THEMES.filter((t) => t.contrast === 'dark');
}

/** Get all light-contrast themes */
export function getLightThemes(): ThemeDefinition[] {
    return THEMES.filter((t) => t.contrast === 'light');
}

/** Migrate old 'dark'/'light' storage values to theme IDs */
export function migrateThemeValue(stored: string): string {
    if (stored === 'dark') return DEFAULT_DARK_THEME;
    if (stored === 'light') return DEFAULT_LIGHT_THEME;
    // Already a theme ID or unknown — validate it
    const found = THEMES.find((t) => t.id === stored);
    return found ? stored : DEFAULT_THEME;
}

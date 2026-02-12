import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    ThemeDefinition,
    ThemeColors,
    ThemeCornerColors,
    ContrastMode,
    THEMES,
    DEFAULT_THEME,
    DEFAULT_DARK_THEME,
    DEFAULT_LIGHT_THEME,
    getThemeById,
    resolveThemeColors,
    migrateThemeValue,
} from '@/constants/themes';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Kept for backward compatibility — derived from the active theme's contrast */
export type ThemeMode = 'dark' | 'light';

interface ThemeContextType {
    /** Active theme ID (e.g. 'midnight', 'kraft', 'aurora') */
    themeId: string;
    /** Contrast mode of the active theme — backward-compatible with old ThemeMode */
    theme: ThemeMode;
    /** Switch to a specific theme by ID */
    setThemeById: (id: string) => void;
    /** Toggle between the default dark/light themes (backward compat) */
    toggleTheme: () => void;
    /** Legacy: set theme by contrast mode — maps to default dark/light theme */
    setTheme: (theme: ThemeMode) => void;
    isDark: boolean;
    isLight: boolean;
    /** Resolved color palette for the active theme */
    colors: ThemeColors;
    /** Corner wash colors for AmbientBackground */
    cornerColors: ThemeCornerColors;
    /** Corner wash opacity for AmbientBackground */
    cornerOpacity: number;
    /** The full active theme definition */
    activeTheme: ThemeDefinition;
    /** All available themes */
    availableThemes: ThemeDefinition[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy exports — kept so existing imports don't break
// ─────────────────────────────────────────────────────────────────────────────
export const DARK_COLORS = resolveThemeColors(getThemeById(DEFAULT_DARK_THEME));
export const LIGHT_COLORS = resolveThemeColors(getThemeById(DEFAULT_LIGHT_THEME));

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'obsy-theme-mode'; // Same key — migration handles old values

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────
export function ObsyThemeProvider({ children }: { children: React.ReactNode }) {
    const [themeId, setThemeIdState] = useState<string>(DEFAULT_THEME);
    const [isLoaded, setIsLoaded] = useState(false);

    // Load theme from storage on mount (migrates old 'dark'/'light' values)
    useEffect(() => {
        const loadTheme = async () => {
            try {
                const stored = await AsyncStorage.getItem(STORAGE_KEY);
                if (stored) {
                    const migrated = migrateThemeValue(stored);
                    setThemeIdState(migrated);
                    // Persist migrated value if it changed
                    if (migrated !== stored) {
                        await AsyncStorage.setItem(STORAGE_KEY, migrated);
                    }
                }
            } catch (error) {
                console.error('Error loading theme:', error);
            } finally {
                setIsLoaded(true);
            }
        };
        loadTheme();
    }, []);

    // Persist theme when it changes
    const setThemeById = useCallback(async (newId: string) => {
        const validated = migrateThemeValue(newId);
        setThemeIdState(validated);
        try {
            await AsyncStorage.setItem(STORAGE_KEY, validated);
        } catch (error) {
            console.error('Error saving theme:', error);
        }
    }, []);

    // Legacy: set by contrast mode → maps to default dark/light theme
    const setTheme = useCallback((mode: ThemeMode) => {
        setThemeById(mode === 'dark' ? DEFAULT_DARK_THEME : DEFAULT_LIGHT_THEME);
    }, [setThemeById]);

    // Toggle between default dark ↔ light
    const activeTheme = getThemeById(themeId);
    const toggleTheme = useCallback(() => {
        setThemeById(activeTheme.contrast === 'dark' ? DEFAULT_LIGHT_THEME : DEFAULT_DARK_THEME);
    }, [activeTheme.contrast, setThemeById]);

    const isDark = activeTheme.contrast === 'dark';
    const isLight = activeTheme.contrast === 'light';
    const colors = useMemo(() => resolveThemeColors(activeTheme), [activeTheme]);

    const value = useMemo(() => ({
        themeId,
        theme: activeTheme.contrast as ThemeMode,
        setThemeById,
        toggleTheme,
        setTheme,
        isDark,
        isLight,
        colors,
        cornerColors: activeTheme.cornerColors,
        cornerOpacity: activeTheme.cornerOpacity,
        activeTheme,
        availableThemes: THEMES,
    }), [themeId, activeTheme, setThemeById, toggleTheme, setTheme, isDark, isLight, colors]);

    // Don't render until theme is loaded to prevent flash
    if (!isLoaded) {
        return null;
    }

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────
export function useObsyTheme(): ThemeContextType {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useObsyTheme must be used within an ObsyThemeProvider');
    }
    return context;
}

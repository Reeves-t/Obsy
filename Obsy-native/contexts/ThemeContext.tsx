import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export type ThemeMode = 'dark' | 'light';

interface ThemeContextType {
    theme: ThemeMode;
    toggleTheme: () => void;
    setTheme: (theme: ThemeMode) => void;
    isDark: boolean;
    isLight: boolean;
    // Colors for easy access
    colors: {
        background: string;
        text: string;
        textSecondary: string;
        textTertiary: string;
        // Card colors (for GlassCard and similar)
        cardBackground: string;
        cardText: string;
        cardTextSecondary: string;
        cardBorder: string;
        // Legacy glass (for compatibility)
        glass: string;
        glassBorder: string;
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Theme Colors
// ─────────────────────────────────────────────────────────────────────────────
const DARK_COLORS = {
    background: '#000000',
    text: '#FFFFFF',
    textSecondary: 'rgba(255,255,255,0.6)',
    textTertiary: 'rgba(255,255,255,0.4)',
    // Dark theme: cards are semi-transparent white overlay
    cardBackground: 'rgba(255, 255, 255, 0.08)',
    cardText: '#FFFFFF',
    cardTextSecondary: 'rgba(255,255,255,0.6)',
    cardBorder: 'rgba(255, 255, 255, 0.1)',
    // Legacy
    glass: 'rgba(255, 255, 255, 0.08)',
    glassBorder: 'rgba(255, 255, 255, 0.1)',
};

const LIGHT_COLORS = {
    background: '#E8E4D9', // Rich cream - "Kraft Paper" vibe
    text: '#1A1A1A', // Dark grey for text ON cream background (not pure black)
    textSecondary: 'rgba(26,26,26,0.7)',
    textTertiary: 'rgba(26,26,26,0.5)',
    // Light theme: cards are NEAR-BLACK with WHITE text inside
    cardBackground: 'rgba(20, 20, 22, 0.92)', // Near-black, slightly transparent
    cardText: '#FFFFFF', // White text inside cards
    cardTextSecondary: 'rgba(255,255,255,0.65)',
    cardBorder: 'rgba(255, 255, 255, 0.08)', // Subtle light border on dark cards
    // Legacy (now points to card colors for GlassCard)
    glass: 'rgba(20, 20, 22, 0.92)',
    glassBorder: 'rgba(255, 255, 255, 0.08)',
};

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'obsy-theme-mode';

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────
export function ObsyThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setThemeState] = useState<ThemeMode>('dark');
    const [isLoaded, setIsLoaded] = useState(false);

    // Load theme from storage on mount
    useEffect(() => {
        const loadTheme = async () => {
            try {
                const stored = await AsyncStorage.getItem(STORAGE_KEY);
                if (stored === 'light' || stored === 'dark') {
                    setThemeState(stored);
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
    const setTheme = useCallback(async (newTheme: ThemeMode) => {
        setThemeState(newTheme);
        try {
            await AsyncStorage.setItem(STORAGE_KEY, newTheme);
        } catch (error) {
            console.error('Error saving theme:', error);
        }
    }, []);

    const toggleTheme = useCallback(() => {
        setTheme(theme === 'dark' ? 'light' : 'dark');
    }, [theme, setTheme]);

    const isDark = theme === 'dark';
    const isLight = theme === 'light';
    const colors = isDark ? DARK_COLORS : LIGHT_COLORS;

    const value = useMemo(() => ({
        theme,
        toggleTheme,
        setTheme,
        isDark,
        isLight,
        colors,
    }), [theme, toggleTheme, setTheme, isDark, isLight, colors]);

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

// Export colors for use outside of React components if needed
export { DARK_COLORS, LIGHT_COLORS };


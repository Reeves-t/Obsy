import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PeriodName, type GradientOutput, resolveGradient, resolveGradientForPeriod } from '@/lib/timeThemes';
import { currentPreset } from '@/lib/timeThemes/presets/current';

export type ThemeMode = 'dark' | 'light' | 'pack1';
export type TimeThemeSelection = 'auto' | PeriodName;

interface ThemeContextType {
    theme: ThemeMode;
    toggleTheme: () => void;
    setTheme: (theme: ThemeMode) => void;
    timeThemeSelection: TimeThemeSelection;
    setTimeThemeSelection: (selection: TimeThemeSelection) => void;
    usesTimeTheme: boolean;
    activeTimeThemePeriod: PeriodName | null;
    activeGradient: GradientOutput | null;
    isDark: boolean;
    isLight: boolean;
    colors: {
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
    };
}

const DARK_COLORS = {
    background: '#000000',
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

const PACK1_COLORS = {
    background: '#050608',
    text: '#FFFFFF',
    textSecondary: 'rgba(255,255,255,0.72)',
    textTertiary: 'rgba(255,255,255,0.5)',
    cardBackground: 'rgba(7, 10, 14, 0.22)',
    cardText: '#FFFFFF',
    cardTextSecondary: 'rgba(255,255,255,0.68)',
    cardBorder: 'rgba(255, 255, 255, 0.14)',
    glass: 'rgba(7, 10, 14, 0.22)',
    glassBorder: 'rgba(255, 255, 255, 0.14)',
};

const LIGHT_COLORS = {
    background: '#D2C2A6',
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

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'obsy-theme-mode';
const TIME_THEME_SELECTION_KEY = 'obsy-time-theme-selection';

export function ObsyThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setThemeState] = useState<ThemeMode>('dark');
    const [timeThemeSelection, setTimeThemeSelectionState] = useState<TimeThemeSelection>('auto');
    const [now, setNow] = useState(() => new Date());
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        const loadTheme = async () => {
            try {
                const [storedTheme, storedTimeThemeSelection] = await Promise.all([
                    AsyncStorage.getItem(STORAGE_KEY),
                    AsyncStorage.getItem(TIME_THEME_SELECTION_KEY),
                ]);

                if (storedTheme === 'dark' || storedTheme === 'light' || storedTheme === 'pack1') {
                    setThemeState(storedTheme);
                }

                if (
                    storedTimeThemeSelection === 'auto' ||
                    storedTimeThemeSelection === 'morning' ||
                    storedTimeThemeSelection === 'afternoon' ||
                    storedTimeThemeSelection === 'evening'
                ) {
                    setTimeThemeSelectionState(storedTimeThemeSelection);
                }
            } catch (error) {
                console.error('Error loading theme:', error);
            } finally {
                setIsLoaded(true);
            }
        };

        loadTheme();
    }, []);

    useEffect(() => {
        const msUntilNextMinute = (60 - new Date().getSeconds()) * 1000;
        let interval: ReturnType<typeof setInterval> | null = null;

        const initialTimer = setTimeout(() => {
            setNow(new Date());
            interval = setInterval(() => setNow(new Date()), 60_000);
        }, msUntilNextMinute);

        return () => {
            clearTimeout(initialTimer);
            if (interval) clearInterval(interval);
        };
    }, []);

    const setTheme = useCallback(async (newTheme: ThemeMode) => {
        setThemeState(newTheme);
        try {
            await AsyncStorage.setItem(STORAGE_KEY, newTheme);
        } catch (error) {
            console.error('Error saving theme:', error);
        }
    }, []);

    const setTimeThemeSelection = useCallback(async (selection: TimeThemeSelection) => {
        setTimeThemeSelectionState(selection);
        try {
            await AsyncStorage.setItem(TIME_THEME_SELECTION_KEY, selection);
        } catch (error) {
            console.error('Error saving time theme selection:', error);
        }
    }, []);

    const toggleTheme = useCallback(() => {
        setTheme(theme === 'dark' ? 'pack1' : 'dark');
    }, [theme, setTheme]);

    const usesTimeTheme = theme === 'pack1';
    const activeGradient = useMemo(() => {
        if (!usesTimeTheme) return null;
        if (timeThemeSelection === 'auto') {
            return resolveGradient(now, currentPreset);
        }
        return resolveGradientForPeriod(currentPreset, timeThemeSelection);
    }, [now, timeThemeSelection, usesTimeTheme]);

    const activeTimeThemePeriod = useMemo<PeriodName | null>(() => {
        if (!activeGradient) return null;
        const { periodState } = activeGradient;
        if (periodState.transition) return periodState.to;
        return periodState.period;
    }, [activeGradient]);

    const isLight = theme === 'light';
    const isDark = !isLight;
    const colors = theme === 'light'
        ? LIGHT_COLORS
        : theme === 'pack1'
            ? PACK1_COLORS
            : DARK_COLORS;

    const value = useMemo(() => ({
        theme,
        toggleTheme,
        setTheme,
        timeThemeSelection,
        setTimeThemeSelection,
        usesTimeTheme,
        activeTimeThemePeriod,
        activeGradient,
        isDark,
        isLight,
        colors,
    }), [
        theme,
        toggleTheme,
        setTheme,
        timeThemeSelection,
        setTimeThemeSelection,
        usesTimeTheme,
        activeTimeThemePeriod,
        activeGradient,
        isDark,
        isLight,
        colors,
    ]);

    if (!isLoaded) {
        return null;
    }

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useObsyTheme(): ThemeContextType {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useObsyTheme must be used within an ObsyThemeProvider');
    }
    return context;
}

export { DARK_COLORS, LIGHT_COLORS, PACK1_COLORS };

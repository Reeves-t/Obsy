import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PeriodName, type GradientOutput, resolveGradient, resolveGradientForPeriod } from '@/lib/timeThemes';
import { currentPreset } from '@/lib/timeThemes/presets/current';
import { type AuroraBackgroundKey, isAuroraBackgroundKey } from '@/constants/auroraBackgrounds';
import { type OrbWaveKey, isOrbWaveKey } from '@/constants/auroraOrbs';

export type ThemeMode = 'dark' | 'light' | 'pack1' | 'obsy-default';
export type TimeThemeSelection = 'auto' | PeriodName;
export type CtaButtonStyle = 'reflective' | 'matte';

interface ThemeContextType {
    theme: ThemeMode;
    toggleTheme: () => void;
    setTheme: (theme: ThemeMode) => void;
    timeThemeSelection: TimeThemeSelection;
    setTimeThemeSelection: (selection: TimeThemeSelection) => void;
    auroraBackground: AuroraBackgroundKey;
    setAuroraBackground: (background: AuroraBackgroundKey) => void;
    orbWave: OrbWaveKey;
    setOrbWave: (wave: OrbWaveKey) => void;
    ctaButtonStyle: CtaButtonStyle;
    setCtaButtonStyle: (style: CtaButtonStyle) => void;
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

const OBSY_DEFAULT_COLORS = {
    background: '#04060d',
    text: '#eaeef7',
    textSecondary: 'rgba(234,238,247,0.72)',
    textTertiary: 'rgba(234,238,247,0.5)',
    cardBackground: 'rgba(7, 10, 22, 0.30)',
    cardText: '#FFFFFF',
    cardTextSecondary: 'rgba(255,255,255,0.68)',
    cardBorder: 'rgba(255, 255, 255, 0.14)',
    glass: 'rgba(7, 10, 22, 0.30)',
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
const AURORA_BACKGROUND_KEY = 'obsy-aurora-background';
const ORB_WAVE_KEY = 'obsy-orb-wave';
const CTA_BUTTON_STYLE_KEY = 'obsy-cta-button-style';

export function ObsyThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setThemeState] = useState<ThemeMode>('obsy-default');
    const [timeThemeSelection, setTimeThemeSelectionState] = useState<TimeThemeSelection>('auto');
    const [auroraBackground, setAuroraBackgroundState] = useState<AuroraBackgroundKey>('default');
    const [orbWave, setOrbWaveState] = useState<OrbWaveKey>('aurora');
    const [ctaButtonStyle, setCtaButtonStyleState] = useState<CtaButtonStyle>('reflective');
    const [now, setNow] = useState(() => new Date());
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        const loadTheme = async () => {
            try {
                const [storedTheme, storedTimeThemeSelection, storedAuroraBackground, storedOrbWave, storedCtaButtonStyle] = await Promise.all([
                    AsyncStorage.getItem(STORAGE_KEY),
                    AsyncStorage.getItem(TIME_THEME_SELECTION_KEY),
                    AsyncStorage.getItem(AURORA_BACKGROUND_KEY),
                    AsyncStorage.getItem(ORB_WAVE_KEY),
                    AsyncStorage.getItem(CTA_BUTTON_STYLE_KEY),
                ]);

                // Obsy Default is the only selectable background now. Honor it if
                // stored; otherwise migrate any legacy selection (dark/pack1/light)
                // over to obsy-default and persist the migration.
                if (storedTheme === 'obsy-default') {
                    setThemeState('obsy-default');
                } else if (storedTheme !== null) {
                    setThemeState('obsy-default');
                    AsyncStorage.setItem(STORAGE_KEY, 'obsy-default').catch(() => {});
                }

                if (
                    storedTimeThemeSelection === 'auto' ||
                    storedTimeThemeSelection === 'morning' ||
                    storedTimeThemeSelection === 'afternoon' ||
                    storedTimeThemeSelection === 'evening'
                ) {
                    setTimeThemeSelectionState(storedTimeThemeSelection);
                }

                if (isAuroraBackgroundKey(storedAuroraBackground)) {
                    setAuroraBackgroundState(storedAuroraBackground);
                }

                if (isOrbWaveKey(storedOrbWave)) {
                    setOrbWaveState(storedOrbWave);
                }

                if (storedCtaButtonStyle === 'reflective' || storedCtaButtonStyle === 'matte') {
                    setCtaButtonStyleState(storedCtaButtonStyle);
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

    const setAuroraBackground = useCallback(async (background: AuroraBackgroundKey) => {
        setAuroraBackgroundState(background);
        try {
            await AsyncStorage.setItem(AURORA_BACKGROUND_KEY, background);
        } catch (error) {
            console.error('Error saving aurora background:', error);
        }
    }, []);

    const setOrbWave = useCallback(async (wave: OrbWaveKey) => {
        setOrbWaveState(wave);
        try {
            await AsyncStorage.setItem(ORB_WAVE_KEY, wave);
        } catch (error) {
            console.error('Error saving orb wave:', error);
        }
    }, []);

    const setCtaButtonStyle = useCallback(async (style: CtaButtonStyle) => {
        setCtaButtonStyleState(style);
        try {
            await AsyncStorage.setItem(CTA_BUTTON_STYLE_KEY, style);
        } catch (error) {
            console.error('Error saving CTA button style:', error);
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
            : theme === 'obsy-default'
                ? OBSY_DEFAULT_COLORS
                : DARK_COLORS;

    const value = useMemo(() => ({
        theme,
        toggleTheme,
        setTheme,
        timeThemeSelection,
        setTimeThemeSelection,
        auroraBackground,
        setAuroraBackground,
        orbWave,
        setOrbWave,
        ctaButtonStyle,
        setCtaButtonStyle,
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
        auroraBackground,
        setAuroraBackground,
        orbWave,
        setOrbWave,
        ctaButtonStyle,
        setCtaButtonStyle,
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

export { DARK_COLORS, LIGHT_COLORS, PACK1_COLORS, OBSY_DEFAULT_COLORS };

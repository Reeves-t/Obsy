import React, { useMemo } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useObsyTheme } from '@/contexts/ThemeContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Corner wash size - CONTAINED to corners only (~35% of screen)
// This ensures corners fade out before reaching the center
const CORNER_WASH_SIZE = Math.max(SCREEN_WIDTH, SCREEN_HEIGHT) * 0.38;

// Base corner wash colors (the 4 theme colors - unchanged)
const CORNER_COLORS = {
    orange: '#FB923C',
    blue: '#60A5FA',
    green: '#34D399',
    purple: '#A78BFA',
} as const;

// Helper to add opacity hex suffix
const withOpacity = (hex: string, opacity: number): string => {
    const opacityHex = Math.round(Math.min(1, Math.max(0, opacity)) * 255).toString(16).padStart(2, '0').toUpperCase();
    return `${hex}${opacityHex}`;
};

// Corner wash configurations - each corner has a wash that fades inward
// Position anchors the gradient at the corner with minimal overhang
// The gradient fades out BEFORE reaching screen center
const CORNER_CONFIGS = [
    {
        id: 'top-left',
        baseColor: CORNER_COLORS.orange,
        // Anchor at top-left corner, small overhang for smooth edge
        position: { top: -CORNER_WASH_SIZE * 0.15, left: -CORNER_WASH_SIZE * 0.15 },
        // Gradient flows from top-left (corner) toward bottom-right (inward)
        gradientStart: { x: 0, y: 0 },
        gradientEnd: { x: 1, y: 1 },
    },
    {
        id: 'top-right',
        baseColor: CORNER_COLORS.blue,
        position: { top: -CORNER_WASH_SIZE * 0.15, right: -CORNER_WASH_SIZE * 0.15 },
        // Gradient flows from top-right (corner) toward bottom-left (inward)
        gradientStart: { x: 1, y: 0 },
        gradientEnd: { x: 0, y: 1 },
    },
    {
        id: 'bottom-left',
        baseColor: CORNER_COLORS.green,
        position: { bottom: -CORNER_WASH_SIZE * 0.15, left: -CORNER_WASH_SIZE * 0.15 },
        // Gradient flows from bottom-left (corner) toward top-right (inward)
        gradientStart: { x: 0, y: 1 },
        gradientEnd: { x: 1, y: 0 },
    },
    {
        id: 'bottom-right',
        baseColor: CORNER_COLORS.purple,
        position: { bottom: -CORNER_WASH_SIZE * 0.15, right: -CORNER_WASH_SIZE * 0.15 },
        // Gradient flows from bottom-right (corner) toward top-left (inward)
        gradientStart: { x: 1, y: 1 },
        gradientEnd: { x: 0, y: 0 },
    },
] as const;

interface CornerWashProps {
    colors: readonly [string, string, string, string];
    locations: readonly [number, number, number, number];
    position: {
        top?: number;
        bottom?: number;
        left?: number;
        right?: number;
    };
    gradientStart: { x: number; y: number };
    gradientEnd: { x: number; y: number };
}

// Gradient locations - where each color stop occurs (0-1)
// Aggressive early fade: color at 0%, fading fast, transparent by ~45%
const GRADIENT_LOCATIONS = [0, 0.15, 0.35, 0.55] as const;

// CornerWash: A rectangular gradient that fills the corner region
// NO borderRadius - the gradient fades to transparent, creating soft edges naturally
const CornerWash: React.FC<CornerWashProps> = ({ colors, locations, position, gradientStart, gradientEnd }) => {
    return (
        <View style={[styles.cornerWashContainer, position]}>
            <LinearGradient
                colors={colors}
                locations={locations}
                style={styles.cornerWash}
                start={gradientStart}
                end={gradientEnd}
            />
        </View>
    );
};

// Theme-specific base settings
const THEME_SETTINGS = {
    dark: {
        baseColor: '#000000',
        // Dark theme: subtle atmospheric glow at corners only
        cornerOpacity: 0.5,
    },
    light: {
        baseColor: '#D2C2A6', // Warm tan - approaching capture ring tone
        // Light theme: visible corner presence but still contained
        cornerOpacity: 0.65,
    },
} as const;

// Screen-specific settings for gradient behavior
// Focus screens (home, albums): ghosted gradient with dark overlay
// Atmospheric screens (gallery, insights, profile): full strength (enhanced in light mode)
type ScreenName = 'home' | 'gallery' | 'insights' | 'profile' | 'archive' | 'onboarding' | 'albums';

interface ScreenSettings {
    // Opacity of black overlay above gradients (0 = no overlay, 0.8 = ghosted)
    overlayOpacity: number;
    // Boost to gradient visibility in light mode (0 = normal, 0.2 = 20% stronger)
    lightModeBoost: number;
}

const SCREEN_SETTINGS: Record<ScreenName | 'default', ScreenSettings> = {
    // Focus screens: ghosted gradient (calm, content-first)
    home: { overlayOpacity: 0.80, lightModeBoost: 0 },
    albums: { overlayOpacity: 0.80, lightModeBoost: 0 },

    // Atmospheric screens: full gradient (enhanced visibility in light mode)
    gallery: { overlayOpacity: 0, lightModeBoost: 0.20 },
    insights: { overlayOpacity: 0, lightModeBoost: 0.20 },
    profile: { overlayOpacity: 0, lightModeBoost: 0.20 },

    // Other screens: default behavior
    archive: { overlayOpacity: 0, lightModeBoost: 0 },
    onboarding: { overlayOpacity: 0, lightModeBoost: 0 },
    default: { overlayOpacity: 0, lightModeBoost: 0 },
};

interface AmbientBackgroundProps {
    screenName?: ScreenName;
}

export const AmbientBackground: React.FC<AmbientBackgroundProps> = ({ screenName }) => {
    const { theme } = useObsyTheme();
    const themeSettings = THEME_SETTINGS[theme];
    const screenSettings = SCREEN_SETTINGS[screenName || 'default'];

    // Calculate effective corner opacity with light mode boost
    const effectiveCornerOpacity = useMemo(() => {
        let opacity = themeSettings.cornerOpacity;
        // Apply light mode boost for atmospheric screens
        if (theme === 'light' && screenSettings.lightModeBoost > 0) {
            opacity = Math.min(1, opacity * (1 + screenSettings.lightModeBoost));
        }
        return opacity;
    }, [themeSettings.cornerOpacity, theme, screenSettings.lightModeBoost]);

    // Memoize corner wash colors based on theme and screen
    const themedCorners = useMemo(() => {
        return CORNER_CONFIGS.map((corner) => ({
            ...corner,
            // Aggressive fade gradient - strong at corner, transparent quickly
            // This keeps corners localized and prevents blending into center
            // Stops: 0% (full) -> ~20% (reduced) -> ~45% (faint) -> 100% (transparent)
            colors: [
                withOpacity(corner.baseColor, effectiveCornerOpacity),        // Full at corner
                withOpacity(corner.baseColor, effectiveCornerOpacity * 0.35), // Quick fade
                withOpacity(corner.baseColor, effectiveCornerOpacity * 0.08), // Nearly gone
                'transparent',                                                  // Fully transparent
            ] as const,
        }));
    }, [effectiveCornerOpacity]);

    // Determine overlay opacity (for ghosted gradient effect on focus screens)
    const overlayOpacity = screenSettings.overlayOpacity;

    return (
        <View style={styles.container} pointerEvents="none">
            {/* Base layer - black for dark mode, cream for light mode */}
            <View style={[styles.baseLayer, { backgroundColor: themeSettings.baseColor }]} />

            {/* Corner washes - localized atmospheric fades from each corner */}
            {themedCorners.map((corner) => (
                <CornerWash
                    key={corner.id}
                    colors={corner.colors}
                    locations={GRADIENT_LOCATIONS}
                    position={corner.position}
                    gradientStart={corner.gradientStart}
                    gradientEnd={corner.gradientEnd}
                />
            ))}

            {/* Dimming overlay for focus screens (Home, Albums) in DARK MODE ONLY - creates "ghosted gradient" effect */}
            {theme === 'dark' && overlayOpacity > 0 && (
                <View
                    style={[
                        styles.dimmingOverlay,
                        { backgroundColor: `rgba(0,0,0,${overlayOpacity})` }
                    ]}
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        overflow: 'hidden', // Clip corner washes that extend beyond screen
    },
    baseLayer: {
        ...StyleSheet.absoluteFillObject,
    },
    cornerWashContainer: {
        position: 'absolute',
        width: CORNER_WASH_SIZE,
        height: CORNER_WASH_SIZE,
    },
    cornerWash: {
        width: CORNER_WASH_SIZE,
        height: CORNER_WASH_SIZE,
        // NO borderRadius - let gradient fade naturally for soft atmospheric effect
    },
    dimmingOverlay: {
        ...StyleSheet.absoluteFillObject,
    },
});


import React, { useMemo } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { ThemeCornerColors } from '@/constants/themes';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Corner wash size - CONTAINED to corners only (~35% of screen)
// This ensures corners fade out before reaching the center
const CORNER_WASH_SIZE = Math.max(SCREEN_WIDTH, SCREEN_HEIGHT) * 0.38;

// Helper to add opacity hex suffix
const withOpacity = (hex: string, opacity: number): string => {
    const opacityHex = Math.round(Math.min(1, Math.max(0, opacity)) * 255).toString(16).padStart(2, '0').toUpperCase();
    return `${hex}${opacityHex}`;
};

// Corner layout configurations — position and gradient direction for each corner
// Colors come from the active theme, not hardcoded here
const CORNER_LAYOUTS = [
    {
        id: 'top-left' as const,
        colorKey: 'topLeft' as const,
        position: { top: -CORNER_WASH_SIZE * 0.15, left: -CORNER_WASH_SIZE * 0.15 },
        gradientStart: { x: 0, y: 0 },
        gradientEnd: { x: 1, y: 1 },
    },
    {
        id: 'top-right' as const,
        colorKey: 'topRight' as const,
        position: { top: -CORNER_WASH_SIZE * 0.15, right: -CORNER_WASH_SIZE * 0.15 },
        gradientStart: { x: 1, y: 0 },
        gradientEnd: { x: 0, y: 1 },
    },
    {
        id: 'bottom-left' as const,
        colorKey: 'bottomLeft' as const,
        position: { bottom: -CORNER_WASH_SIZE * 0.15, left: -CORNER_WASH_SIZE * 0.15 },
        gradientStart: { x: 0, y: 1 },
        gradientEnd: { x: 1, y: 0 },
    },
    {
        id: 'bottom-right' as const,
        colorKey: 'bottomRight' as const,
        position: { bottom: -CORNER_WASH_SIZE * 0.15, right: -CORNER_WASH_SIZE * 0.15 },
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
    const { isDark, colors, cornerColors, cornerOpacity } = useObsyTheme();
    const screenSettings = SCREEN_SETTINGS[screenName || 'default'];

    // Calculate effective corner opacity with light mode boost
    const effectiveCornerOpacity = useMemo(() => {
        let opacity = cornerOpacity;
        // Apply light mode boost for atmospheric screens
        if (!isDark && screenSettings.lightModeBoost > 0) {
            opacity = Math.min(1, opacity * (1 + screenSettings.lightModeBoost));
        }
        return opacity;
    }, [cornerOpacity, isDark, screenSettings.lightModeBoost]);

    // Memoize corner wash colors based on theme and screen
    const themedCorners = useMemo(() => {
        return CORNER_LAYOUTS.map((corner) => ({
            ...corner,
            colors: [
                withOpacity(cornerColors[corner.colorKey], effectiveCornerOpacity),
                withOpacity(cornerColors[corner.colorKey], effectiveCornerOpacity * 0.35),
                withOpacity(cornerColors[corner.colorKey], effectiveCornerOpacity * 0.08),
                'transparent',
            ] as const,
        }));
    }, [cornerColors, effectiveCornerOpacity]);

    // Determine overlay opacity (for ghosted gradient effect on focus screens)
    const overlayOpacity = screenSettings.overlayOpacity;

    return (
        <View style={styles.container} pointerEvents="none">
            {/* Base layer - background color from the active theme */}
            <View style={[styles.baseLayer, { backgroundColor: colors.background }]} />

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
            {isDark && overlayOpacity > 0 && (
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

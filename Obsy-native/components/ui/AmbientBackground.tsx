import React, { useMemo } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useObsyTheme } from '@/contexts/ThemeContext';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';
import { getGradientEndpoints } from '@/lib/timeThemes';

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
const REFERENCE_BACKGROUND = require('../../assets/images/ambient-reference-bg.jpg');

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
type ScreenName = 'home' | 'gallery' | 'insights' | 'topics' | 'profile' | 'archive' | 'onboarding' | 'albums';

interface ScreenSettings {
    // Opacity of black overlay above gradients (0 = no overlay, 0.8 = ghosted)
    overlayOpacity: number;
    // Boost to gradient visibility in light mode (0 = normal, 0.2 = 20% stronger)
    lightModeBoost: number;
    // Small readability scrim for the time-based theme on denser content screens
    timeThemeOverlayOpacity: number;
}

const SCREEN_SETTINGS: Record<ScreenName | 'default', ScreenSettings> = {
    // Focus screens: ghosted gradient (calm, content-first)
    home: { overlayOpacity: 0.80, lightModeBoost: 0, timeThemeOverlayOpacity: 0 },
    albums: { overlayOpacity: 0.80, lightModeBoost: 0, timeThemeOverlayOpacity: 0.06 },

    // Atmospheric screens: full gradient (enhanced visibility in light mode)
    gallery: { overlayOpacity: 0, lightModeBoost: 0.20, timeThemeOverlayOpacity: 0.08 },
    insights: { overlayOpacity: 0, lightModeBoost: 0.20, timeThemeOverlayOpacity: 0.08 },
    topics: { overlayOpacity: 0, lightModeBoost: 0.20, timeThemeOverlayOpacity: 0.08 },
    profile: { overlayOpacity: 0, lightModeBoost: 0.20, timeThemeOverlayOpacity: 0.08 },

    // Other screens: default behavior
    archive: { overlayOpacity: 0, lightModeBoost: 0, timeThemeOverlayOpacity: 0.06 },
    onboarding: { overlayOpacity: 0, lightModeBoost: 0, timeThemeOverlayOpacity: 0.04 },
    default: { overlayOpacity: 0, lightModeBoost: 0, timeThemeOverlayOpacity: 0.06 },
};

interface AmbientBackgroundProps {
    screenName?: ScreenName;
}

export const AmbientBackground: React.FC<AmbientBackgroundProps> = ({ screenName }) => {
    const { theme, isLight, usesTimeTheme, activeGradient } = useObsyTheme();
    const isOnboarding = screenName === 'onboarding';
    const screenSettings = SCREEN_SETTINGS[screenName || 'default'];
    const themeSettings = isLight ? THEME_SETTINGS.light : THEME_SETTINGS.dark;
    const gradientEndpoints = useMemo(() => {
        if (!activeGradient) return null;
        return getGradientEndpoints(activeGradient.deg);
    }, [activeGradient]);

    // Calculate effective corner opacity with light mode boost
    const effectiveCornerOpacity = useMemo(() => {
        let opacity: number = themeSettings.cornerOpacity;
        // Apply light mode boost for atmospheric screens
        if (isLight && screenSettings.lightModeBoost > 0) {
            opacity = Math.min(1, opacity * (1 + screenSettings.lightModeBoost));
        }
        return opacity;
    }, [themeSettings.cornerOpacity, isLight, screenSettings.lightModeBoost]);

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

    if (usesTimeTheme && activeGradient && gradientEndpoints) {
        return (
            <View style={styles.container} pointerEvents="none">
                <Svg width={SCREEN_WIDTH} height={SCREEN_HEIGHT} style={styles.baseLayer}>
                    <Defs>
                        <SvgLinearGradient
                            id="ambientTimeTheme"
                            x1={`${gradientEndpoints.x1 * 100}%`}
                            y1={`${gradientEndpoints.y1 * 100}%`}
                            x2={`${gradientEndpoints.x2 * 100}%`}
                            y2={`${gradientEndpoints.y2 * 100}%`}
                        >
                            {activeGradient.locations.map((loc, index) => (
                                <Stop
                                    key={`${loc}-${index}`}
                                    offset={`${loc * 100}%`}
                                    stopColor={activeGradient.colors[index]}
                                    stopOpacity="1"
                                />
                            ))}
                        </SvgLinearGradient>
                    </Defs>
                    <Rect x="0" y="0" width={SCREEN_WIDTH} height={SCREEN_HEIGHT} fill="url(#ambientTimeTheme)" />
                </Svg>

                <LinearGradient
                    colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.015)', 'transparent']}
                    locations={[0, 0.3, 1]}
                    start={{ x: 0.12, y: 0 }}
                    end={{ x: 0.88, y: 0.82 }}
                    style={styles.timeThemeBloom}
                />

                <LinearGradient
                    colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.08)', 'rgba(0,0,0,0.2)']}
                    locations={[0, 0.48, 1]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={styles.timeThemeDepth}
                />

                {screenSettings.timeThemeOverlayOpacity > 0 && (
                    <View
                        style={[
                            styles.dimmingOverlay,
                            { backgroundColor: `rgba(0,0,0,${screenSettings.timeThemeOverlayOpacity})` },
                        ]}
                    />
                )}
            </View>
        );
    }

    if (!isOnboarding && theme === 'dark') {
        return (
            <View style={styles.container} pointerEvents="none">
                {/* Base steel fallback under the image treatment */}
                <LinearGradient
                    colors={['#0B0F16', '#18202B', '#0A0E15']}
                    locations={[0, 0.52, 1]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={styles.baseLayer}
                />

                {/* Image layer recreates the soft abstract depth from the reference vibe */}
                <Image
                    source={REFERENCE_BACKGROUND}
                    contentFit="cover"
                    transition={0}
                    style={styles.referenceImage}
                />

                {/* Cool grey wash keeps the image grounded in the current Obsy palette */}
                <LinearGradient
                    colors={['rgba(0,0,0,0.9)', 'rgba(4,4,5,0.8)', 'rgba(18,18,20,0.52)']}
                    locations={[0, 0.5, 1]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={styles.imageTone}
                />

                {/* White-to-cream atmospheric tint similar to the Aura sample, but neutralized */}
                <LinearGradient
                    colors={['rgba(255,255,255,0.015)', 'rgba(210,194,166,0.04)', 'rgba(210,194,166,0.015)', 'transparent']}
                    locations={[0, 0.2, 0.52, 1]}
                    start={{ x: 0.08, y: 0 }}
                    end={{ x: 0.88, y: 1 }}
                    style={styles.creamWash}
                />

                {/* Soft white highlight gives the image a lifted, misty top edge */}
                <LinearGradient
                    colors={['rgba(255,255,255,0.025)', 'rgba(255,255,255,0.008)', 'transparent']}
                    locations={[0, 0.36, 1]}
                    start={{ x: 0.08, y: 0 }}
                    end={{ x: 0.92, y: 0.72 }}
                    style={styles.whiteBloom}
                />

                {/* Bottom tan-white lift warms the lower third without flattening the whole image */}
                <LinearGradient
                    colors={['transparent', 'rgba(58,58,62,0.22)', 'rgba(96,96,104,0.52)']}
                    locations={[0, 0.66, 1]}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={styles.bottomShade}
                />

                {/* Edge vignette prevents the photo layer from feeling flat or washed out */}
                <LinearGradient
                    colors={['rgba(0,0,0,0.72)', 'transparent', 'rgba(0,0,0,0.5)']}
                    locations={[0, 0.5, 1]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={styles.edgeVignette}
                />
            </View>
        );
    }

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
            {!isLight && overlayOpacity > 0 && (
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
    referenceImage: {
        ...StyleSheet.absoluteFillObject,
        opacity: 0.34,
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
    imageTone: {
        ...StyleSheet.absoluteFillObject,
    },
    creamWash: {
        ...StyleSheet.absoluteFillObject,
    },
    whiteBloom: {
        ...StyleSheet.absoluteFillObject,
        opacity: 0.28,
    },
    bottomShade: {
        ...StyleSheet.absoluteFillObject,
    },
    edgeVignette: {
        ...StyleSheet.absoluteFillObject,
    },
    timeThemeBloom: {
        ...StyleSheet.absoluteFillObject,
        opacity: 0.4,
    },
    timeThemeDepth: {
        ...StyleSheet.absoluteFillObject,
    },
});

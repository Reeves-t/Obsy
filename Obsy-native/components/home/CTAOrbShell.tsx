import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { AURORA_BACKGROUNDS } from '@/constants/auroraBackgrounds';
import { ORB_WAVES } from '@/constants/auroraOrbs';
import { useAuroraPulseStore } from '@/lib/auroraPulseStore';

interface CTAOrbShellProps {
  size: number;
  dim?: boolean;
  // Optional accent gradient painted over the default tint (e.g. a green
  // "completed" state). Omit to keep the standard orb.
  overlayColors?: readonly [string, string, ...string[]];
  children: React.ReactNode;
}

const RING_PADDING = 8;

// bezelGrad from assets/images/obsy.cobalt.logo.svg (vertical, top→bottom)
const BEZEL_COLORS = [
  '#9a9a9e',
  '#cfcfd3',
  '#5e5e63',
  '#1f1f22',
  '#3a3a3e',
  '#b8b8bc',
  '#5c5c60',
] as const;
const BEZEL_LOCATIONS = [0, 0.08, 0.22, 0.55, 0.8, 0.92, 1] as const;

// bezelHi top-highlight overlay from the same SVG
const BEZEL_HI_COLORS = [
  'rgba(255,255,255,0.55)',
  'rgba(255,255,255,0.05)',
  'rgba(255,255,255,0)',
] as const;
const BEZEL_HI_LOCATIONS = [0, 0.4, 1] as const;

// ── Color helpers ───────────────────────────────────────────────────────────
const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const parseTriplet = (rgb: string): [number, number, number] => {
  const p = rgb.split(',').map((s) => parseInt(s.trim(), 10) || 0);
  return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0];
};
const blendChannels = (a: [number, number, number], b: [number, number, number]): string =>
  `${Math.round((a[0] + b[0]) / 2)},${Math.round((a[1] + b[1]) / 2)},${Math.round((a[2] + b[2]) / 2)}`;

export function CTAOrbShell({ size, dim = false, overlayColors, children }: CTAOrbShellProps) {
  const { auroraBackground, orbWave, ctaButtonStyle } = useObsyTheme();
  const reflective = ctaButtonStyle === 'reflective';

  const ringSize = size + RING_PADDING;

  // Theme-derived colors (orb wave + background hue, blended for the rim/halo).
  const { orbCss, bgCss, blendCss } = useMemo(() => {
    const orb = parseTriplet(ORB_WAVES[orbWave]?.a ?? ORB_WAVES.aurora.a);
    const bg = hexToRgb(AURORA_BACKGROUNDS[auroraBackground]?.swatch ?? AURORA_BACKGROUNDS.default.swatch);
    return {
      orbCss: `${orb[0]},${orb[1]},${orb[2]}`,
      bgCss: `${bg[0]},${bg[1]},${bg[2]}`,
      blendCss: blendChannels(orb, bg),
    };
  }, [orbWave, auroraBackground]);

  // ── Animation (reflective only) ──────────────────────────────────────────
  const surge = useSharedValue(0);
  const pulseId = useAuroraPulseStore((s) => s.pulseId);

  // Subtle rim flare on each carousel move (when the orbs actually get kicked).
  useEffect(() => {
    if (!reflective || pulseId === 0) return;
    surge.value = withSequence(
      withTiming(1, { duration: 140, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 680, easing: Easing.out(Easing.cubic) }),
    );
  }, [pulseId, reflective, surge]);

  const rimStyle = useAnimatedStyle(() => ({
    borderColor: `rgba(${blendCss},${0.42 + surge.value * 0.4})`,
  }));

  // ── Matte (original look) ────────────────────────────────────────────────
  if (!reflective) {
    const innerInset = Math.max(2, size * 0.025);
    const innerSize = ringSize - innerInset * 2;
    const innerRadius = innerSize / 2;

    return (
      <View
        style={[
          styles.shell,
          dim ? styles.dimShell : styles.fullShell,
          { width: ringSize, height: ringSize, borderRadius: ringSize / 2 },
        ]}
      >
        {/* Bezel base gradient — matches obsy.cobalt.logo bezelGrad */}
        <LinearGradient
          colors={BEZEL_COLORS as unknown as readonly [string, string, ...string[]]}
          locations={BEZEL_LOCATIONS as unknown as readonly [number, number, ...number[]]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[StyleSheet.absoluteFillObject, { borderRadius: ringSize / 2 }]}
        />

        {/* Bezel top highlight — matches obsy.cobalt.logo bezelHi */}
        <LinearGradient
          colors={BEZEL_HI_COLORS as unknown as readonly [string, string, ...string[]]}
          locations={BEZEL_HI_LOCATIONS as unknown as readonly [number, number, ...number[]]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, { borderRadius: ringSize / 2 }]}
        />

        <View
          style={[
            styles.innerOrb,
            {
              top: innerInset,
              right: innerInset,
              bottom: innerInset,
              left: innerInset,
              width: innerSize,
              height: innerSize,
              borderRadius: innerRadius,
            },
          ]}
        >
          {/* Frosted-glass blur of whatever sits behind (e.g. the Aurora background) */}
          <BlurView
            intensity={42}
            tint="dark"
            style={[StyleSheet.absoluteFillObject, { borderRadius: innerRadius }]}
          />

          {/* Neutral dark-matte tint — theme-agnostic so it sits well on any base color */}
          <LinearGradient
            colors={['rgba(18,18,20,0.74)', 'rgba(12,12,14,0.82)', 'rgba(8,8,10,0.88)']}
            locations={[0, 0.5, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={[StyleSheet.absoluteFillObject, { borderRadius: innerRadius }]}
            pointerEvents="none"
          />

          {overlayColors && (
            <LinearGradient
              colors={overlayColors}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={[StyleSheet.absoluteFillObject, { borderRadius: innerRadius }]}
              pointerEvents="none"
            />
          )}

          <View style={styles.content}>{children}</View>
        </View>
      </View>
    );
  }

  // ── Reflective (glass lens, theme-tied) ──────────────────────────────────
  const innerRadius = ringSize / 2;

  return (
    <View
      style={[
        styles.shell,
        dim ? styles.dimShell : styles.fullShell,
        {
          width: ringSize,
          height: ringSize,
          borderRadius: ringSize / 2,
        },
      ]}
    >
      {/* Glass body */}
      <View style={[styles.innerOrb, StyleSheet.absoluteFillObject, { borderRadius: innerRadius }]}>
        <BlurView
          intensity={36}
          tint="dark"
          style={[StyleSheet.absoluteFillObject, { borderRadius: innerRadius }]}
        />

        {/* Dark readability tint */}
        <LinearGradient
          colors={['rgba(8,8,12,0.52)', 'rgba(6,6,10,0.64)', 'rgba(4,4,8,0.74)']}
          locations={[0, 0.5, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[StyleSheet.absoluteFillObject, { borderRadius: innerRadius }]}
          pointerEvents="none"
        />

        {/* Blend reflection — orb color (top-left) → background hue (bottom-right) */}
        <LinearGradient
          colors={[`rgba(${orbCss},0.20)`, 'transparent', `rgba(${bgCss},0.16)`]}
          locations={[0, 0.55, 1]}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={[StyleSheet.absoluteFillObject, { borderRadius: innerRadius }]}
          pointerEvents="none"
        />

        {overlayColors && (
          <LinearGradient
            colors={overlayColors}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={[StyleSheet.absoluteFillObject, { borderRadius: innerRadius }]}
            pointerEvents="none"
          />
        )}

        <View style={styles.content}>{children}</View>
      </View>

      {/* Colored glass rim */}
      <Animated.View
        pointerEvents="none"
        style={[styles.rim, { borderRadius: ringSize / 2 }, rimStyle]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullShell: {
    shadowColor: '#000000',
    shadowOpacity: 0.55,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 10 },
    elevation: 18,
  },
  dimShell: {
    opacity: 0.88,
    shadowColor: '#000000',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 8,
  },
  innerOrb: {
    position: 'absolute',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rim: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1.5,
  },
});

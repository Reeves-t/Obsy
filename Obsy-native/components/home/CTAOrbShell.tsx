import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

interface CTAOrbShellProps {
  size: number;
  dim?: boolean;
  // Optional accent gradient painted over the default dark tint (e.g. a green
  // "completed" state). Omit to keep the standard dark orb.
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

export function CTAOrbShell({ size, dim = false, overlayColors, children }: CTAOrbShellProps) {
  const ringSize = size + RING_PADDING;
  const innerInset = Math.max(2, size * 0.025);
  const innerSize = ringSize - innerInset * 2;
  const innerRadius = innerSize / 2;

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
      {/* Bezel base gradient — matches obsy.cobalt.logo bezelGrad */}
      <LinearGradient
        colors={BEZEL_COLORS as unknown as readonly [string, string, ...string[]]}
        locations={BEZEL_LOCATIONS as unknown as readonly [number, number, ...number[]]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[
          StyleSheet.absoluteFillObject,
          { borderRadius: ringSize / 2 },
        ]}
      />

      {/* Bezel top highlight — matches obsy.cobalt.logo bezelHi */}
      <LinearGradient
        colors={BEZEL_HI_COLORS as unknown as readonly [string, string, ...string[]]}
        locations={BEZEL_HI_LOCATIONS as unknown as readonly [number, number, ...number[]]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          { borderRadius: ringSize / 2 },
        ]}
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

        {/* Dark transparent tint to give the orb depth + readability */}
        <LinearGradient
          colors={[
            'rgba(14,21,48,0.55)',
            'rgba(7,10,22,0.65)',
            'rgba(4,6,13,0.72)',
          ]}
          locations={[0, 0.5, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[StyleSheet.absoluteFillObject, { borderRadius: innerRadius }]}
          pointerEvents="none"
        />

        {/* Optional accent gradient (e.g. completed = dark green) */}
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
});

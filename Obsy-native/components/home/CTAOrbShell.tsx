import React from 'react';
import { StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';

// The circular shell behind every home CTA glyph.
//
// One material, no painted chrome: on iOS 26+ this is a native liquid-glass
// disc (UIGlassEffect via expo-glass-effect); everywhere else it falls back to
// a frosted BlurView. Both get the same hairline border and a light dark scrim
// for glyph contrast. The old bezel-gradient stack, the matte/reflective theme
// split, and the accent rim flare are gone on purpose — the material samples
// the live Aurora shader behind it, which does the work the gradients faked.
interface CTAOrbShellProps {
  size: number;
  dim?: boolean;
  // Optional accent gradient painted over the material (e.g. a green
  // "completed" state). Omit to keep the standard shell.
  overlayColors?: readonly [string, string, ...string[]];
  children: React.ReactNode;
}

const RING_PADDING = 8;
const HAS_LIQUID_GLASS = isLiquidGlassAvailable();

export function CTAOrbShell({ size, dim = false, overlayColors, children }: CTAOrbShellProps) {
  const ringSize = size + RING_PADDING;
  const radius = ringSize / 2;

  const inner = (
    <>
      {/* Light scrim so near-white glyphs stay readable over bright aurora spots */}
      <View style={[StyleSheet.absoluteFillObject, styles.scrim]} />

      {overlayColors && (
        <LinearGradient
          colors={overlayColors}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
      )}

      <View style={styles.content}>{children}</View>
    </>
  );

  return (
    <View
      style={[
        styles.shell,
        dim && styles.dimShell,
        { width: ringSize, height: ringSize, borderRadius: radius },
      ]}
    >
      {HAS_LIQUID_GLASS ? (
        <GlassView
          glassEffectStyle="regular"
          style={[styles.body, { borderRadius: radius }]}
        >
          {inner}
        </GlassView>
      ) : (
        <View style={[styles.body, { borderRadius: radius }]}>
          <BlurView
            intensity={26}
            tint="dark"
            style={StyleSheet.absoluteFillObject}
          />
          {inner}
        </View>
      )}

      {/* Hairline border on top of the material */}
      <View
        pointerEvents="none"
        style={[styles.hairline, { borderRadius: radius }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  dimShell: {
    opacity: 0.9,
  },
  body: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrim: {
    backgroundColor: 'rgba(8,10,14,0.30)',
  },
  content: {
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hairline: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
});

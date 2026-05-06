// MoodRefreshLight.tsx
// Mood-colored edge glow that blooms around a card when `loading` is true.
// Uses LinearGradient layers behind the card, chaining each mood's full
// 3-stop gradient (primary → mid → secondary) for smooth color blending —
// same technique as MoodFlow's gradient bar.
//
// Two animation groups: CORE (closer to card, fades in first) and RIM
// (outer edge, follows ~700ms later). Each group uses a different diagonal
// angle so different mood colors appear on different edges.

import React, { useEffect, useRef } from "react";
import { Animated, Easing, View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { ColorValue } from "react-native";

export type MoodLight = {
  /** Dominant/center color of the mood gradient. */
  primary: string;
  /** Transition tone bridging primary → secondary. */
  mid: string;
  /** Shadow/depth color at the outer edge. */
  secondary: string;
};

type Props = {
  loading: boolean;
  moods: MoodLight[];
  /** Fires after the retract animation finishes (only after a bloom→retract cycle). */
  onRetractComplete?: () => void;
};

const CARD_RADIUS = 22;
const EXTEND = 28;

const TIMING = {
  coreInDur: 900,
  coreInDelay: 0,
  rimInDur: 1100,
  rimInDelay: 700,
  rimOutDur: 1200,
  rimOutDelay: 0,
  coreOutDur: 1600,
  coreOutDelay: 200,
  scaleStart: 0.88,
  scaleEnd: 1.0,
};

// Each layer is a filled LinearGradient rounded rect behind the card.
// The card covers the center — only the edge peeking out is visible.
// Different diagonal angles per layer spread mood colors around the perimeter.
const CORE_LAYERS = [
  { dist: 6, opacity: 0.32, start: { x: 0, y: 0 }, end: { x: 1, y: 1 }, reversed: false },
  { dist: 11, opacity: 0.18, start: { x: 1, y: 0 }, end: { x: 0, y: 1 }, reversed: true },
];
const RIM_LAYERS = [
  { dist: 17, opacity: 0.13, start: { x: 0.2, y: 0 }, end: { x: 0.8, y: 1 }, reversed: false },
  { dist: 24, opacity: 0.06, start: { x: 0.8, y: 0 }, end: { x: 0.2, y: 1 }, reversed: true },
];

/**
 * Chain mood gradients like MoodFlow: primary → mid → secondary per mood,
 * concatenated for smooth transitions between moods.
 */
type GradientColors = readonly [ColorValue, ColorValue, ...ColorValue[]];

function buildGlowColors(moods: MoodLight[]): GradientColors {
  const colors: string[] = [];
  for (const m of moods) {
    colors.push(m.primary, m.mid, m.secondary);
  }
  return colors as unknown as GradientColors;
}

export function MoodRefreshLight({ loading, moods, onRetractComplete }: Props) {
  const coreOpacity = useRef(new Animated.Value(0)).current;
  const rimOpacity = useRef(new Animated.Value(0)).current;
  const coreScale = useRef(new Animated.Value(TIMING.scaleStart)).current;
  const rimScale = useRef(new Animated.Value(TIMING.scaleStart + 0.02)).current;

  const hasBloomedRef = useRef(false);
  const retractCallbackRef = useRef(onRetractComplete);
  retractCallbackRef.current = onRetractComplete;

  useEffect(() => {
    if (loading) {
      hasBloomedRef.current = true;
      Animated.parallel([
        Animated.timing(coreOpacity, {
          toValue: 1,
          duration: TIMING.coreInDur,
          delay: TIMING.coreInDelay,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(coreScale, {
          toValue: TIMING.scaleEnd,
          duration: TIMING.coreInDur + 300,
          delay: TIMING.coreInDelay,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(rimOpacity, {
          toValue: 1,
          duration: TIMING.rimInDur,
          delay: TIMING.rimInDelay,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(rimScale, {
          toValue: TIMING.scaleEnd,
          duration: TIMING.rimInDur + 200,
          delay: TIMING.rimInDelay,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(rimOpacity, {
          toValue: 0,
          duration: TIMING.rimOutDur,
          delay: TIMING.rimOutDelay,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(rimScale, {
          toValue: TIMING.scaleStart + 0.02,
          duration: TIMING.rimOutDur + 300,
          delay: TIMING.rimOutDelay,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(coreOpacity, {
          toValue: 0,
          duration: TIMING.coreOutDur,
          delay: TIMING.coreOutDelay,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(coreScale, {
          toValue: TIMING.scaleStart,
          duration: TIMING.coreOutDur + 200,
          delay: TIMING.coreOutDelay,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished && hasBloomedRef.current) {
          hasBloomedRef.current = false;
          retractCallbackRef.current?.();
        }
      });
    }
  }, [loading]);

  if (moods.length === 0) return null;

  const colors = buildGlowColors(moods);
  const colorsReversed = [...colors].reverse() as unknown as GradientColors;

  return (
    <View pointerEvents="none" style={styles.layer}>
      {/* CORE — tight to card edge, fades in first */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { opacity: coreOpacity, transform: [{ scale: coreScale }] },
        ]}
      >
        {CORE_LAYERS.map((l, i) => (
          <LinearGradient
            key={`core-${i}`}
            colors={l.reversed ? colorsReversed : colors}
            start={l.start}
            end={l.end}
            style={[
              styles.ring,
              {
                top: EXTEND - l.dist,
                left: EXTEND - l.dist,
                right: EXTEND - l.dist,
                bottom: EXTEND - l.dist,
                borderRadius: CARD_RADIUS + l.dist,
                opacity: l.opacity,
              },
            ]}
          />
        ))}
      </Animated.View>

      {/* RIM — outer edge, follows ~700ms later */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { opacity: rimOpacity, transform: [{ scale: rimScale }] },
        ]}
      >
        {RIM_LAYERS.map((l, i) => (
          <LinearGradient
            key={`rim-${i}`}
            colors={l.reversed ? colorsReversed : colors}
            start={l.start}
            end={l.end}
            style={[
              styles.ring,
              {
                top: EXTEND - l.dist,
                left: EXTEND - l.dist,
                right: EXTEND - l.dist,
                bottom: EXTEND - l.dist,
                borderRadius: CARD_RADIUS + l.dist,
                opacity: l.opacity,
              },
            ]}
          />
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: "absolute",
    top: -EXTEND,
    left: -EXTEND,
    right: -EXTEND,
    bottom: -EXTEND,
    zIndex: 0,
  },
  ring: {
    position: "absolute",
  },
});

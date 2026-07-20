import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  Paint,
  RadialGradient,
  vec,
} from '@shopify/react-native-skia';

// Contextual looping animation shown in the empty middle of the orbit ring —
// it mirrors whichever button is currently front. Each loop restarts when it
// becomes visible (mount on active change); that restart-on-reveal is part of
// the intended feel per the design handoff.

export type CenterStageKey = 'voice' | 'capture' | 'journal' | 'quick-mood';

interface CenterStageProps {
  activeKey: CenterStageKey;
  accentRgb: string; // "r,g,b"
  size: number;
  style?: StyleProp<ViewStyle>;
}

function parseRgb(accentRgb: string): [number, number, number] {
  const [r, g, b] = accentRgb.split(',').map((v) => Number(v.trim()) || 0);
  return [r, g, b];
}

function lighten([r, g, b]: [number, number, number], amount: number): string {
  const lift = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${lift(r)},${lift(g)},${lift(b)})`;
}

function darken([r, g, b]: [number, number, number], amount: number): string {
  const drop = (c: number) => Math.round(c * (1 - amount));
  return `rgb(${drop(r)},${drop(g)},${drop(b)})`;
}

// ── Journal: staggered scribble lines being written and erased ───────

function ScribbleLine({
  width,
  delayMs,
  accentRgb,
}: {
  width: number;
  delayMs: number;
  accentRgb: string;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delayMs,
      withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.ease) }), -1)
    );
  }, [delayMs, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.2, 0.8, 1], [0, 1, 1, 0]),
    transform: [
      // Scale about the left edge (handwriting grows from the start of the line).
      { translateX: -width / 2 },
      { scaleX: interpolate(progress.value, [0, 0.5, 1], [0.001, 1, 0.001]) },
      { translateX: width / 2 },
    ],
  }));

  return (
    <Animated.View style={[{ width, height: 6, borderRadius: 3, overflow: 'hidden' }, style]}>
      <LinearGradient
        colors={[`rgba(${accentRgb},0.75)`, `rgba(${accentRgb},0.12)`]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

function JournalStage({ size, accentRgb }: { size: number; accentRgb: string }) {
  const k = size / 130;
  const widths = [78, 56, 84, 44].map((w) => w * k);
  return (
    <View style={[styles.fill, styles.journalStage, { paddingLeft: 14 * k, gap: 11 * k }]}>
      {widths.map((w, i) => (
        <ScribbleLine key={i} width={w} delayMs={i * 400} accentRgb={accentRgb} />
      ))}
    </View>
  );
}

// ── Snapshot: camera iris opening and closing over a glowing lens ────

function CameraIrisStage({ size, accentRgb }: { size: number; accentRgb: string }) {
  const k = size / 130;
  const c = size / 2;
  const rgb = useMemo(() => parseRgb(accentRgb), [accentRgb]);
  const aperture = useSharedValue(48 * k);

  useEffect(() => {
    aperture.value = withRepeat(
      withSequence(
        withTiming(8 * k, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(48 * k, { duration: 1200, easing: Easing.inOut(Easing.ease) })
      ),
      -1
    );
  }, [aperture, k]);

  return (
    <Canvas style={{ width: size, height: size }}>
      {/* Lens glow halo */}
      <Circle cx={c} cy={c} r={40 * k} color={`rgba(${accentRgb},0.55)`}>
        <BlurMask blur={16 * k} style="normal" />
      </Circle>
      {/* The lens itself */}
      <Circle cx={c} cy={c} r={35 * k}>
        <RadialGradient
          c={vec(c - 8 * k, c - 10 * k)}
          r={44 * k}
          colors={[lighten(rgb, 0.8), `rgb(${accentRgb})`, darken(rgb, 0.65)]}
        />
      </Circle>
      {/* Shutter disc with an animated clear aperture punched out of it */}
      <Group layer={<Paint />}>
        <Circle cx={c} cy={c} r={52 * k} color="#0a1119" />
        <Circle cx={c} cy={c} r={aperture} color="black" blendMode="clear" />
      </Group>
    </Canvas>
  );
}

// ── Voice: ambient equalizer bars ────────────────────────────────────

function EqualizerBar({
  height,
  durationMs,
  accentRgb,
}: {
  height: number;
  durationMs: number;
  accentRgb: string;
}) {
  const scale = useSharedValue(0.25);

  useEffect(() => {
    scale.value = withRepeat(
      withTiming(1, { duration: durationMs, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [durationMs, scale]);

  const style = useAnimatedStyle(() => ({
    transform: [
      // Scale about the bottom edge.
      { translateY: height / 2 },
      { scaleY: scale.value },
      { translateY: -height / 2 },
    ],
  }));

  return (
    <Animated.View style={[{ width: 8, height, borderRadius: 4, overflow: 'hidden' }, style]}>
      <LinearGradient
        colors={[`rgba(${accentRgb},0.9)`, `rgba(${accentRgb},0.35)`]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

function VoiceStage({ size, accentRgb }: { size: number; accentRgb: string }) {
  const k = size / 130;
  const durations = [520, 670, 440, 710, 580];
  return (
    <View style={[styles.fill, styles.voiceStage, { gap: 7 * k, paddingBottom: 30 * k }]}>
      {durations.map((d, i) => (
        <EqualizerBar key={i} height={52 * k} durationMs={d} accentRgb={accentRgb} />
      ))}
    </View>
  );
}

// ── Mood: floating check-in question bubbles ─────────────────────────

const MOOD_PHRASES: { text: string; position: ViewStyle; delayMs: number }[] = [
  { text: 'doing okay?', position: { left: 6, bottom: 18 }, delayMs: 0 },
  { text: 'rough day?', position: { right: 0, bottom: 36 }, delayMs: 1500 },
  { text: 'on top of the world?', position: { left: 20, bottom: 6 }, delayMs: 3000 },
];

function MoodBubble({
  text,
  position,
  delayMs,
  accentRgb,
}: {
  text: string;
  position: ViewStyle;
  delayMs: number;
  accentRgb: string;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delayMs,
      withRepeat(withTiming(1, { duration: 4600, easing: Easing.inOut(Easing.ease) }), -1)
    );
  }, [delayMs, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.15, 0.5, 0.85, 1], [0, 1, 1, 0, 0]),
    transform: [
      { translateY: interpolate(progress.value, [0, 0.5, 1], [14, -10, -30]) },
      { scale: interpolate(progress.value, [0, 0.5, 1], [0.85, 1, 0.9]) },
    ],
  }));

  return (
    <Animated.View
      style={[styles.bubble, { borderColor: `rgba(${accentRgb},0.28)` }, position, style]}
    >
      <Text style={styles.bubbleText}>{text}</Text>
    </Animated.View>
  );
}

function MoodStage({ accentRgb }: { accentRgb: string }) {
  return (
    <View style={styles.fill}>
      {MOOD_PHRASES.map((p) => (
        <MoodBubble
          key={p.text}
          text={p.text}
          position={p.position}
          delayMs={p.delayMs}
          accentRgb={accentRgb}
        />
      ))}
    </View>
  );
}

// ── Stage switcher ───────────────────────────────────────────────────

export function CenterStage({ activeKey, accentRgb, size, style }: CenterStageProps) {
  return (
    <View pointerEvents="none" style={[{ width: size, height: size }, style]}>
      {activeKey === 'journal' && <JournalStage size={size} accentRgb={accentRgb} />}
      {activeKey === 'capture' && <CameraIrisStage size={size} accentRgb={accentRgb} />}
      {activeKey === 'voice' && <VoiceStage size={size} accentRgb={accentRgb} />}
      {activeKey === 'quick-mood' && <MoodStage accentRgb={accentRgb} />}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
  journalStage: {
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  voiceStage: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  bubble: {
    position: 'absolute',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  bubbleText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(232,236,245,0.85)',
  },
});

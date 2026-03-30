import React, { useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withRepeat,
  withTiming,
  Easing,
  useDerivedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

const AnimatedPath = Animated.createAnimatedComponent(Path);

const BUTTON_SIZE = 36;
const HALF = BUTTON_SIZE / 2;
const AURA_SIZE = BUTTON_SIZE + 20; // 10px extend on each side

// Teal blue palette
const TEAL_PRIMARY = '#00B4D8';
const TEAL_SECONDARY = '#0077B6';
const TEAL_AURA = 'rgba(0, 180, 216, 0.12)';

/**
 * Attempt an interpolation without importing from reanimated's internals.
 * We use useDerivedValue to compute the SVG path string on the JS thread.
 * The waveform animates by shifting phase over time.
 */
export function AnimatedMicButton() {
  const router = useRouter();

  // Phase drives the waveform undulation (0 -> 2*PI looping)
  const phase = useSharedValue(0);

  useEffect(() => {
    phase.value = withRepeat(
      withTiming(Math.PI * 2, { duration: 3000, easing: Easing.linear }),
      -1,
      false
    );
  }, []);

  // Build three waveform paths that update every frame
  const path1 = useDerivedValue(() => {
    const p = phase.value;
    const points: string[] = [];
    const w = BUTTON_SIZE - 8; // wave width with padding
    const cx = HALF;
    const cy = HALF;
    const startX = cx - w / 2;

    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const x = startX + t * w;
      const y = cy + Math.sin(t * Math.PI * 2 + p) * 4;
      points.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`);
    }
    return points.join(' ');
  });

  const path2 = useDerivedValue(() => {
    const p = phase.value;
    const points: string[] = [];
    const w = BUTTON_SIZE - 8;
    const cx = HALF;
    const cy = HALF;
    const startX = cx - w / 2;

    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const x = startX + t * w;
      const y = cy + Math.sin(t * Math.PI * 2.5 + p + 1.2) * 3;
      points.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`);
    }
    return points.join(' ');
  });

  const path3 = useDerivedValue(() => {
    const p = phase.value;
    const points: string[] = [];
    const w = BUTTON_SIZE - 8;
    const cx = HALF;
    const cy = HALF;
    const startX = cx - w / 2;

    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const x = startX + t * w;
      const y = cy + Math.sin(t * Math.PI * 1.8 + p + 2.5) * 2.5;
      points.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`);
    }
    return points.join(' ');
  });

  const animatedProps1 = useAnimatedProps(() => ({
    d: path1.value,
  }));

  const animatedProps2 = useAnimatedProps(() => ({
    d: path2.value,
  }));

  const animatedProps3 = useAnimatedProps(() => ({
    d: path3.value,
  }));

  return (
    <View style={styles.outerContainer}>
      {/* Soft aura glow */}
      <View style={styles.aura} />

      <TouchableOpacity
        activeOpacity={0.75}
        onPress={() => router.push('/voice')}
        style={styles.button}
      >
        {/* Metallic ring */}
        <View style={styles.metallicRing} />

        {/* Glass gradient fill */}
        <LinearGradient
          colors={['rgba(255,255,255,0.05)', 'rgba(0,0,0,0.2)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        {/* Inner glint */}
        <View style={styles.innerGlint} />

        {/* Animated waveform */}
        <Svg width={BUTTON_SIZE} height={BUTTON_SIZE} style={styles.svgContainer}>
          <AnimatedPath
            animatedProps={animatedProps1}
            stroke={TEAL_PRIMARY}
            strokeWidth={1.5}
            fill="none"
            strokeLinecap="round"
            opacity={0.9}
          />
          <AnimatedPath
            animatedProps={animatedProps2}
            stroke={TEAL_SECONDARY}
            strokeWidth={1.2}
            fill="none"
            strokeLinecap="round"
            opacity={0.6}
          />
          <AnimatedPath
            animatedProps={animatedProps3}
            stroke={TEAL_PRIMARY}
            strokeWidth={1}
            fill="none"
            strokeLinecap="round"
            opacity={0.4}
          />
        </Svg>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    width: AURA_SIZE,
    height: AURA_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  aura: {
    position: 'absolute',
    width: AURA_SIZE,
    height: AURA_SIZE,
    borderRadius: AURA_SIZE / 2,
    backgroundColor: TEAL_AURA,
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    backgroundColor: '#0D0D0D',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  metallicRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BUTTON_SIZE / 2,
    borderWidth: 1,
    borderColor: 'rgba(200,200,200,0.2)',
  },
  innerGlint: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BUTTON_SIZE / 2,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  svgContainer: {
    position: 'absolute',
  },
});

import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { TouchableOpacity } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  useDerivedValue,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import Svg, { Path, Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const BUTTON_SIZE = 44;
const HALF = BUTTON_SIZE / 2;
const AURA_SIZE = BUTTON_SIZE + 20;

// Deep purple palette
const PURPLE_PRIMARY = '#7B2FBE';
const PURPLE_SECONDARY = '#5B21B6';
const PURPLE_AURA = 'rgba(123, 47, 190, 0.12)';
const SPARKLE_COLOR = '#A78BFA';

export function AnimatedJournalButton() {
  const router = useRouter();

  // Pen bob animation (gentle tilt/hover)
  const penBob = useSharedValue(0);
  // Sparkle animations (two sparkles at pen tip)
  const sparkle1Opacity = useSharedValue(0);
  const sparkle2Opacity = useSharedValue(0);
  const sparkle1Y = useSharedValue(0);
  const sparkle2Y = useSharedValue(0);

  useEffect(() => {
    // Pen bobs gently up and down
    penBob.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );

    // Sparkle 1: fade in, drift up, fade out — every ~2.5s
    const runSparkle1 = () => {
      sparkle1Opacity.value = withRepeat(
        withSequence(
          withTiming(0, { duration: 100 }),
          withDelay(2500, withTiming(0.8, { duration: 400 })),
          withTiming(0, { duration: 600 })
        ),
        -1,
        false
      );
      sparkle1Y.value = withRepeat(
        withSequence(
          withTiming(0, { duration: 100 }),
          withDelay(2500, withTiming(-6, { duration: 1000, easing: Easing.out(Easing.quad) }))
        ),
        -1,
        false
      );
    };

    // Sparkle 2: offset timing from sparkle 1
    const runSparkle2 = () => {
      sparkle2Opacity.value = withRepeat(
        withSequence(
          withTiming(0, { duration: 100 }),
          withDelay(3200, withTiming(0.6, { duration: 300 })),
          withTiming(0, { duration: 500 })
        ),
        -1,
        false
      );
      sparkle2Y.value = withRepeat(
        withSequence(
          withTiming(0, { duration: 100 }),
          withDelay(3200, withTiming(-5, { duration: 800, easing: Easing.out(Easing.quad) }))
        ),
        -1,
        false
      );
    };

    runSparkle1();
    runSparkle2();
  }, []);

  // Pen group transform (slight bob)
  const penStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: penBob.value * -1.5 }],
  }));

  // Sparkle animated props
  const sparkle1Props = useAnimatedProps(() => ({
    opacity: sparkle1Opacity.value,
    cy: 12 + sparkle1Y.value,
  }));

  const sparkle2Props = useAnimatedProps(() => ({
    opacity: sparkle2Opacity.value,
    cy: 14 + sparkle2Y.value,
  }));

  return (
    <View style={styles.outerContainer}>
      {/* Soft aura glow */}
      <View style={styles.aura} />

      <TouchableOpacity
        activeOpacity={0.75}
        onPress={() => router.push('/journal')}
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

        {/* Animated pen + sparkles */}
        <Animated.View style={[styles.iconContainer, penStyle]}>
          <Svg width={24} height={24} viewBox="0 0 24 24">
            {/* Pen body — angled writing pen */}
            <Path
              d="M16.5 3.5l4 4L7 21H3v-4L16.5 3.5z"
              stroke={PURPLE_PRIMARY}
              strokeWidth={1.5}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.9}
            />
            {/* Pen tip detail */}
            <Path
              d="M14 6l4 4"
              stroke={PURPLE_SECONDARY}
              strokeWidth={1.2}
              fill="none"
              strokeLinecap="round"
              opacity={0.6}
            />
            {/* Sparkle particles near pen tip */}
            <AnimatedCircle
              animatedProps={sparkle1Props}
              cx={5}
              r={1.2}
              fill={SPARKLE_COLOR}
            />
            <AnimatedCircle
              animatedProps={sparkle2Props}
              cx={8}
              r={0.8}
              fill={SPARKLE_COLOR}
            />
          </Svg>
        </Animated.View>
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
    backgroundColor: PURPLE_AURA,
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
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
});

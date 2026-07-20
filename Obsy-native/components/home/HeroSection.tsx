import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { GradientSweepText } from '@/components/ui/GradientSweepText';
import { TypewriterText } from '@/components/home/TypewriterText';
import { useObsyTheme } from '@/contexts/ThemeContext';

const COBALT = '#41caec';

const TYPEWRITER_MESSAGES = [
  'Capture the moment before it slips away — a thought, a scene, a feeling.',
  'One honest line about today is enough. Future you will thank you.',
  'Snap a photo, hum it into the mic, or drop the link you can’t stop thinking about.',
  'Had a strange dream? A tiny win? It belongs here.',
  'Tag the mood, keep the memory — watch your patterns surface.',
];

export function HeroSection() {
  const { colors } = useObsyTheme();
  const isFocused = useIsFocused();
  const eyebrowOpacity = useSharedValue(1);

  useEffect(() => {
    if (!isFocused) {
      cancelAnimation(eyebrowOpacity);
      return;
    }
    eyebrowOpacity.value = withRepeat(
      withTiming(0.55, { duration: 7000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    return () => cancelAnimation(eyebrowOpacity);
  }, [isFocused, eyebrowOpacity]);

  const eyebrowStyle = useAnimatedStyle(() => ({
    opacity: eyebrowOpacity.value,
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={eyebrowStyle}>
        <Text style={styles.eyebrow}>DROP IT IN</Text>
      </Animated.View>

      <View style={styles.headlineWrap}>
        <GradientSweepText
          text={'What’s on\nyour mind?'}
          style={styles.headline}
          baseColor={colors.text}
          accentColor={COBALT}
          durationMs={7000}
        />
      </View>

      <View style={styles.typewriterWrap}>
        <TypewriterText
          messages={TYPEWRITER_MESSAGES}
          style={[styles.typewriter, { color: colors.textSecondary }]}
          caretColor={COBALT}
          minHeight={44}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 40,
  },
  eyebrow: {
    fontFamily: 'SpaceMono',
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: COBALT,
  },
  headlineWrap: {
    marginTop: 14,
  },
  headline: {
    fontSize: 33,
    lineHeight: 37,
    fontWeight: '600',
    letterSpacing: -0.8,
  },
  typewriterWrap: {
    marginTop: 14,
    maxWidth: 330,
  },
  typewriter: {
    fontSize: 14,
    lineHeight: 21,
  },
});

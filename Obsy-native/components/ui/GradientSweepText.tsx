import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextStyle, View, LayoutChangeEvent } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from '@react-navigation/native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';

interface GradientSweepTextProps {
  text: string;
  style?: TextStyle;
  baseColor?: string;
  accentColor?: string;
  durationMs?: number;
}

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

// Gradient is ~2.8x the text width so the accent band sweeps across the
// headline the way Control's colorBleed keyframe does.
const GRADIENT_WIDTH_MULTIPLIER = 2.8;

/**
 * Headline text with a slow accent "color bleed" sweeping back and forth,
 * adapted from Control's colorBleed animation. Same measure-then-mask
 * structure as WaveHighlightText.
 */
export function GradientSweepText({
  text,
  style,
  baseColor = '#eaeef7',
  accentColor = '#41caec',
  durationMs = 7000,
}: GradientSweepTextProps) {
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const progress = useSharedValue(0);
  const isFocused = useIsFocused();
  const hasLayout = layout.width > 0 && layout.height > 0;

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setLayout({ width, height });
    }
  };

  const gradientWidth = layout.width * GRADIENT_WIDTH_MULTIPLIER;
  const translateDistance = gradientWidth - layout.width;

  useEffect(() => {
    if (!hasLayout) return;
    if (!isFocused) {
      cancelAnimation(progress);
      return;
    }
    progress.value = withRepeat(
      withTiming(1, { duration: durationMs, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    return () => cancelAnimation(progress);
  }, [hasLayout, isFocused, durationMs, progress]);

  const animatedGradientStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -progress.value * translateDistance }],
  }));

  const gradientColors = [baseColor, baseColor, accentColor, baseColor, baseColor] as const;

  return (
    <View style={styles.container}>
      <Text style={[style, styles.measureText]} onLayout={handleLayout}>
        {text}
      </Text>

      {hasLayout && (
        <MaskedView
          style={{ width: '100%', height: layout.height }}
          maskElement={
            <View style={styles.maskContainer}>
              <Text style={style}>{text}</Text>
            </View>
          }
        >
          <AnimatedLinearGradient
            colors={gradientColors}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            locations={[0, 0.32, 0.5, 0.68, 1]}
            style={[{ width: gradientWidth, height: layout.height }, animatedGradientStyle]}
          />
        </MaskedView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  measureText: {
    position: 'absolute',
    opacity: 0,
  },
  maskContainer: {
    backgroundColor: 'transparent',
  },
});

import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import { ThemedText } from '@/components/ui/ThemedText';
import { ObsyLogoMark } from '@/components/ui/ObsyLogoMark';
import { useObsyTheme } from '@/contexts/ThemeContext';

const COBALT = '#41caec';

export function HomeHeader() {
  const { colors } = useObsyTheme();
  const isFocused = useIsFocused();
  const glow = useSharedValue(1);

  useEffect(() => {
    if (!isFocused) {
      cancelAnimation(glow);
      return;
    }
    glow.value = withRepeat(
      withTiming(0, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    return () => cancelAnimation(glow);
  }, [isFocused, glow]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value,
  }));

  return (
    <View style={styles.row}>
      <View style={styles.brand}>
        <View style={[styles.logoBox, { borderColor: colors.glassBorder }]}>
          {/* Cross-platform glow: cobalt halo behind the box, opacity pulsing */}
          <Animated.View pointerEvents="none" style={[styles.logoGlow, glowStyle]} />
          <ObsyLogoMark size={24} />
        </View>
        <ThemedText style={[styles.wordmark, { color: colors.text }]}>Obsy</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  logoBox: {
    width: 34,
    height: 34,
    borderRadius: 11,
    borderWidth: 1,
    backgroundColor: 'rgba(7, 10, 22, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoGlow: {
    position: 'absolute',
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
    borderRadius: 17,
    backgroundColor: `${COBALT}2E`,
  },
  wordmark: {
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
});

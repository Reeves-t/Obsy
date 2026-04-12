import React, { useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useObsyTheme } from '@/contexts/ThemeContext';

interface PulsingCameraTriggerProps {
  onPress?: () => void;
  size?: number;
  disabled?: boolean;
}

const DEFAULT_SIZE = 160;
const RING_PADDING = 8;

export function PulsingCameraTrigger({ onPress, size = DEFAULT_SIZE, disabled = false }: PulsingCameraTriggerProps) {
  const router = useRouter();
  const { isLight } = useObsyTheme();
  const orbSize = size;
  const ringSize = orbSize + RING_PADDING;
  const iconSize = orbSize * 0.225;

  const shimmerPosition = useSharedValue(-1);

  useEffect(() => {
    shimmerPosition.value = withRepeat(
      withSequence(
        withTiming(-1, { duration: 0 }),
        withDelay(
          3500,
          withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) })
        )
      ),
      -1,
      false
    );
  }, []);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: shimmerPosition.value * (ringSize / 2) },
      { translateY: shimmerPosition.value * (ringSize / 2) },
    ],
    opacity: shimmerPosition.value > -0.8 && shimmerPosition.value < 0.8 ? 0.35 : 0,
  }));

  const handlePress = () => {
    if (disabled) return;
    if (onPress) {
      onPress();
      return;
    }
    router.push('/capture');
  };

  return (
    <View style={[styles.container, { width: ringSize, height: ringSize }]}>
      <View style={[styles.metallicRing, { width: ringSize, height: ringSize, borderRadius: ringSize / 2 }]}>
        <LinearGradient
          colors={['rgba(200,200,200,0.25)', 'rgba(120,120,120,0.15)', 'rgba(200,200,200,0.25)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.ringGradient, { borderRadius: ringSize / 2 }]}
        />

        <Animated.View style={[styles.shimmerOverlay, shimmerStyle, { width: ringSize, height: ringSize, borderRadius: ringSize / 2 }]}>
          <LinearGradient
            colors={['transparent', 'rgba(255,255,255,0.5)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>

      <TouchableOpacity
        activeOpacity={disabled ? 1 : 0.8}
        disabled={disabled}
        onPress={handlePress}
        style={[styles.wrapper, { width: orbSize, height: orbSize }]}
      >
        <View style={[styles.orb, { width: orbSize, height: orbSize, borderRadius: orbSize / 2, backgroundColor: isLight ? '#C2AE8A' : '#0D0D0D' }]}>
          <View style={[styles.borderRing, { borderRadius: orbSize / 2 }]} />

          <LinearGradient
            colors={isLight
              ? ['rgba(255,255,255,0.15)', 'rgba(0,0,0,0.08)']
              : ['rgba(255,255,255,0.05)', 'rgba(0,0,0,0.2)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          <LinearGradient
            colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.05)', 'transparent']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={[styles.glassShine, { borderTopLeftRadius: orbSize / 2, borderTopRightRadius: orbSize / 2 }]}
          />

          <View style={[styles.innerGlint, { borderRadius: orbSize / 2 }]} />

          <View style={styles.iconContainer}>
            <Ionicons name="camera" size={iconSize} color={isLight ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)'} />
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  metallicRing: {
    position: 'absolute',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringGradient: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderColor: 'rgba(180,180,180,0.3)',
  },
  shimmerOverlay: {
    position: 'absolute',
  },
  wrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  orb: {
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  borderRing: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  glassShine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '33%',
  },
  innerGlint: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
});

import React, { useEffect } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { CTAOrbShell } from '@/components/home/CTAOrbShell';

interface PulsingCameraTriggerProps {
  onPress?: () => void;
  size?: number;
  disabled?: boolean;
  dim?: boolean;
}

const DEFAULT_SIZE = 160;
const RING_PADDING = 8;

export function PulsingCameraTrigger({
  onPress,
  size = DEFAULT_SIZE,
  disabled = false,
  dim = false,
}: PulsingCameraTriggerProps) {
  const router = useRouter();
  const ringSize = size + RING_PADDING;
  const iconSize = size * 0.225;

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
  }, [shimmerPosition]);

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
      <View style={[styles.shimmerMask, { width: ringSize, height: ringSize, borderRadius: ringSize / 2 }]}>
        <Animated.View
          style={[
            styles.shimmerOverlay,
            shimmerStyle,
            { width: ringSize, height: ringSize, borderRadius: ringSize / 2 },
          ]}
        >
          <LinearGradient
            colors={['transparent', 'rgba(255,255,255,0.5)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>

      <TouchableOpacity
        activeOpacity={disabled ? 1 : 0.84}
        disabled={disabled}
        onPress={handlePress}
        style={styles.wrapper}
      >
        <CTAOrbShell size={size} dim={dim}>
          <Ionicons name="camera" size={iconSize} color="rgba(255,255,255,0.92)" />
        </CTAOrbShell>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  shimmerMask: {
    position: 'absolute',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shimmerOverlay: {
    position: 'absolute',
  },
  wrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});

import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

interface AnimatedMicButtonProps {
  size?: number;
  disabled?: boolean;
  onPress?: () => void;
}

const DEFAULT_SIZE = 36;
const RING_PADDING = 8;

export function AnimatedMicButton({
  size = DEFAULT_SIZE,
  disabled = false,
  onPress,
}: AnimatedMicButtonProps) {
  const router = useRouter();
  const ringSize = size + RING_PADDING;
  const iconSize = size * 0.42;

  const handlePress = () => {
    if (disabled) return;
    if (onPress) {
      onPress();
      return;
    }
    router.push('/voice');
  };

  return (
    <View style={[styles.outerContainer, { width: ringSize, height: ringSize }]}>
      <View
        style={[
          styles.metallicRingShell,
          { width: ringSize, height: ringSize, borderRadius: ringSize / 2 },
        ]}
      >
        <LinearGradient
          colors={['rgba(200,200,200,0.25)', 'rgba(120,120,120,0.15)', 'rgba(200,200,200,0.25)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.ringGradient,
            { borderRadius: ringSize / 2 },
          ]}
        />
      </View>

      <TouchableOpacity
        activeOpacity={disabled ? 1 : 0.8}
        disabled={disabled}
        onPress={handlePress}
        style={[
          styles.button,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
      >
        <View style={[styles.borderRing, { borderRadius: size / 2 }]} />
        <LinearGradient
          colors={['rgba(255,255,255,0.05)', 'rgba(0,0,0,0.2)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.05)', 'transparent']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[
            styles.glassShine,
            { borderTopLeftRadius: size / 2, borderTopRightRadius: size / 2 },
          ]}
        />
        <View style={[styles.innerGlint, { borderRadius: size / 2 }]} />
        <View style={styles.iconContainer}>
          <Ionicons name="mic" size={iconSize} color="#FFFFFF" />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  metallicRingShell: {
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
  button: {
    backgroundColor: '#0D0D0D',
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

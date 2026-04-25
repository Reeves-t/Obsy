import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

interface AnimatedJournalButtonProps {
  size?: number;
  disabled?: boolean;
  onPress?: () => void;
}

const DEFAULT_SIZE = 44;
const RING_PADDING = 8;

export function AnimatedJournalButton({
  size = DEFAULT_SIZE,
  disabled = false,
  onPress,
}: AnimatedJournalButtonProps) {
  const router = useRouter();
  const ringSize = size + RING_PADDING;
  const iconSize = size * 0.46;

  const handlePress = () => {
    if (disabled) return;
    if (onPress) {
      onPress();
      return;
    }
    router.push('/journal');
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
          colors={['rgba(255,255,255,0.07)', 'rgba(0,0,0,0.14)']}
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
          <Svg width={iconSize} height={iconSize} viewBox="0 0 24 24">
            <Path
              d="M7 3.5h6.8l3.7 3.8V19a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5Z"
              stroke="#FFFFFF"
              strokeWidth={1.5}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Path
              d="M13.8 3.8V7.2H17.2"
              stroke="#FFFFFF"
              strokeWidth={1.3}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Path
              d="M8.5 10.5h5.5"
              stroke="#FFFFFF"
              strokeWidth={1.2}
              strokeLinecap="round"
            />
            <Path
              d="M8.5 13.3h4.4"
              stroke="#FFFFFF"
              strokeWidth={1.2}
              strokeLinecap="round"
            />
            <Path
              d="M11.8 16.8l4.9-4.9 1.4 1.4-4.9 4.9-2.3.9z"
              stroke="#FFFFFF"
              strokeWidth={1.4}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
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
    backgroundColor: '#171717',
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

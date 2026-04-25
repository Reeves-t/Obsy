import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Svg, { Ellipse } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

interface QuickMoodButtonProps {
  size?: number;
  disabled?: boolean;
  onPress?: () => void;
}

const DEFAULT_SIZE = 44;
const RING_PADDING = 8;

function QuickMoodGlyph({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Ellipse cx="30" cy="18" rx="8.5" ry="8" fill="rgba(255,255,255,0.96)" />
      <Ellipse cx="18" cy="31" rx="6.2" ry="5.4" fill="rgba(255,255,255,0.9)" />
      <Ellipse cx="12.5" cy="15.5" rx="4.8" ry="4.8" fill="rgba(255,255,255,0.82)" />
    </Svg>
  );
}

export function QuickMoodButton({
  size = DEFAULT_SIZE,
  disabled = false,
  onPress,
}: QuickMoodButtonProps) {
  const router = useRouter();
  const ringSize = size + RING_PADDING;
  const iconSize = size * 0.52;

  const handlePress = () => {
    if (disabled) return;
    if (onPress) {
      onPress();
      return;
    }
    router.push('/quick-mood' as never);
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
          style={[styles.ringGradient, { borderRadius: ringSize / 2 }]}
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
          <QuickMoodGlyph size={iconSize} />
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

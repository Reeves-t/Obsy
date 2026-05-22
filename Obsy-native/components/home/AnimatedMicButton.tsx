import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Path, Rect, Ellipse, Circle } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { CTAOrbShell } from '@/components/home/CTAOrbShell';

interface AnimatedMicButtonProps {
  size?: number;
  disabled?: boolean;
  onPress?: () => void;
  dim?: boolean;
}

const DEFAULT_SIZE = 36;

function SilverMicGlyph({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        {/* Body chrome — bright top, dark mid, light bottom rim */}
        <LinearGradient id="micChrome" x1="50%" y1="0%" x2="50%" y2="100%">
          <Stop offset="0%" stopColor="#f4f4f6" />
          <Stop offset="14%" stopColor="#dcdcdf" />
          <Stop offset="46%" stopColor="#6c6c70" />
          <Stop offset="62%" stopColor="#3b3b3f" />
          <Stop offset="86%" stopColor="#b3b3b6" />
          <Stop offset="100%" stopColor="#7a7a7d" />
        </LinearGradient>

        {/* Stem chrome */}
        <LinearGradient id="micStem" x1="0%" y1="50%" x2="100%" y2="50%">
          <Stop offset="0%" stopColor="#6f6f73" />
          <Stop offset="50%" stopColor="#dcdcdf" />
          <Stop offset="100%" stopColor="#6f6f73" />
        </LinearGradient>

        {/* Stand chrome (left→right shading) */}
        <LinearGradient id="micStand" x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor="#7d7d80" />
          <Stop offset="50%" stopColor="#e3e3e5" />
          <Stop offset="100%" stopColor="#7d7d80" />
        </LinearGradient>

        <LinearGradient id="micStandBlack" x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor="#1a1a1c" />
          <Stop offset="50%" stopColor="#3a3a3e" />
          <Stop offset="100%" stopColor="#1a1a1c" />
        </LinearGradient>

        <LinearGradient id="micStemBlack" x1="0%" y1="50%" x2="100%" y2="50%">
          <Stop offset="0%" stopColor="#2a2a2c" />
          <Stop offset="50%" stopColor="#4a4a4e" />
          <Stop offset="100%" stopColor="#1a1a1c" />
        </LinearGradient>
      </Defs>

      {/* Capsule body */}
      <Rect x={8} y={2} width={8} height={12} rx={4} ry={4} fill="url(#micChrome)" />
      {/* Top sheen highlight */}
      <Rect x={9} y={2.6} width={6} height={1.6} rx={0.8} fill="#ffffff" opacity={0.55} />
      {/* Bottom dark band at capsule base */}
      <Rect x={8.4} y={12.4} width={7.2} height={1.2} rx={0.6} fill="#0a0a0b" opacity={0.55} />
      {/* Subtle vertical seam */}
      <Rect x={11.85} y={3} width={0.3} height={10} fill="#ffffff" opacity={0.12} />

      {/* Stand arc */}
      <Path
        d="M5 12 Q5 18.5 12 18.5 Q19 18.5 19 12"
        stroke="url(#micStandBlack)"
        strokeWidth={1.4}
        fill="none"
        strokeLinecap="round"
      />

      {/* Stem */}
      <Rect x={11.1} y={18} width={1.8} height={2.6} rx={0.4} fill="url(#micStemBlack)" />

      {/* Base plate */}
      <Rect x={7.2} y={20.3} width={9.6} height={1.5} rx={0.75} fill="url(#micStandBlack)" />
      <Ellipse cx={12} cy={20.3} rx={4.6} ry={0.45} fill="#ffffff" opacity={0.18} />
      <Circle cx={12} cy={20.45} r={0.55} fill="#ff3b3b" />
      <Circle cx={12} cy={20.45} r={0.55} fill="#ffffff" opacity={0.35} />
    </Svg>
  );
}

export function AnimatedMicButton({
  size = DEFAULT_SIZE,
  disabled = false,
  onPress,
  dim = false,
}: AnimatedMicButtonProps) {
  const router = useRouter();
  const iconSize = size * 0.44;

  const handlePress = () => {
    if (disabled) return;
    if (onPress) {
      onPress();
      return;
    }
    router.push('/voice');
  };

  return (
    <TouchableOpacity
      activeOpacity={disabled ? 1 : 0.84}
      disabled={disabled}
      onPress={handlePress}
      style={styles.touchable}
    >
      <CTAOrbShell size={size} dim={dim}>
        <View style={styles.iconContainer}>
          <SilverMicGlyph size={iconSize} />
        </View>
      </CTAOrbShell>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  touchable: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});

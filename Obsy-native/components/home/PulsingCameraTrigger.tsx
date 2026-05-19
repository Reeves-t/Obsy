import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Stop, Circle, Rect, Ellipse, Path } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { CTAOrbShell } from '@/components/home/CTAOrbShell';

interface PulsingCameraTriggerProps {
  onPress?: () => void;
  size?: number;
  disabled?: boolean;
  dim?: boolean;
}

const DEFAULT_SIZE = 160;

function SilverCameraGlyph({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        {/* Camera body chrome */}
        <LinearGradient id="camChrome" x1="50%" y1="0%" x2="50%" y2="100%">
          <Stop offset="0%" stopColor="#eeeef0" />
          <Stop offset="14%" stopColor="#cdcdd0" />
          <Stop offset="46%" stopColor="#6a6a6e" />
          <Stop offset="62%" stopColor="#3a3a3e" />
          <Stop offset="86%" stopColor="#aaaaae" />
          <Stop offset="100%" stopColor="#777779" />
        </LinearGradient>

        {/* Slightly darker chrome (for hump / lens ring) */}
        <LinearGradient id="camChromeDark" x1="50%" y1="0%" x2="50%" y2="100%">
          <Stop offset="0%" stopColor="#bdbdbf" />
          <Stop offset="50%" stopColor="#4f4f53" />
          <Stop offset="100%" stopColor="#7a7a7d" />
        </LinearGradient>

        {/* Lens glass — dark inner with cobalt hint */}
        <RadialGradient id="lensGlass" cx="38%" cy="32%" r="70%">
          <Stop offset="0%" stopColor="#3a4762" stopOpacity="1" />
          <Stop offset="40%" stopColor="#101422" stopOpacity="1" />
          <Stop offset="100%" stopColor="#000000" stopOpacity="1" />
        </RadialGradient>

        {/* Lens iris ring (thin metallic accent) */}
        <RadialGradient id="lensIris" cx="50%" cy="50%" r="50%">
          <Stop offset="80%" stopColor="#000" stopOpacity="0" />
          <Stop offset="100%" stopColor="#fff" stopOpacity="0.32" />
        </RadialGradient>
      </Defs>

      {/* Top hump (viewfinder/flash housing) */}
      <Path
        d="M8.2 7 L8.2 4.8 Q8.2 4 9 4 L15 4 Q15.8 4 15.8 4.8 L15.8 7 Z"
        fill="url(#camChromeDark)"
      />

      {/* Body */}
      <Rect x={2} y={7} width={20} height={14} rx={2.4} ry={2.4} fill="url(#camChrome)" />
      {/* Top sheen */}
      <Rect x={3} y={7.4} width={18} height={1.6} rx={0.8} fill="#ffffff" opacity={0.32} />
      {/* Bottom shadow band */}
      <Rect x={2.6} y={19.4} width={18.8} height={1.4} rx={0.7} fill="#0a0a0b" opacity={0.5} />

      {/* Shutter button on top right */}
      <Rect x={18} y={5.6} width={2.4} height={1.2} rx={0.4} fill="url(#camChromeDark)" />
      <Rect x={18.2} y={5.8} width={2} height={0.4} rx={0.2} fill="#ffffff" opacity={0.55} />

      {/* Flash window left of hump */}
      <Rect x={4} y={8.6} width={2.4} height={1.4} rx={0.4} fill="url(#camChromeDark)" />
      <Rect x={4.2} y={8.8} width={2} height={0.5} rx={0.25} fill="#ffffff" opacity={0.7} />

      {/* Lens outer ring */}
      <Circle cx={12} cy={14.4} r={4.6} fill="url(#camChromeDark)" />
      {/* Lens inner ring */}
      <Circle cx={12} cy={14.4} r={3.7} fill="url(#camChrome)" />
      {/* Lens glass */}
      <Circle cx={12} cy={14.4} r={3.1} fill="url(#lensGlass)" />
      {/* Lens iris glow */}
      <Circle cx={12} cy={14.4} r={3.1} fill="url(#lensIris)" />
      {/* Glass highlight */}
      <Ellipse cx={10.6} cy={13.1} rx={1.3} ry={0.75} fill="#ffffff" opacity={0.5} />
      <Ellipse cx={13.3} cy={15.6} rx={0.55} ry={0.35} fill="#ffffff" opacity={0.25} />
    </Svg>
  );
}

export function PulsingCameraTrigger({
  onPress,
  size = DEFAULT_SIZE,
  disabled = false,
  dim = false,
}: PulsingCameraTriggerProps) {
  const router = useRouter();
  const iconSize = size * 0.27;

  const handlePress = () => {
    if (disabled) return;
    if (onPress) {
      onPress();
      return;
    }
    router.push('/capture');
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
          <SilverCameraGlyph size={iconSize} />
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

import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Path, Rect, Line } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { CTAOrbShell } from '@/components/home/CTAOrbShell';

interface AnimatedJournalButtonProps {
  size?: number;
  disabled?: boolean;
  onPress?: () => void;
  dim?: boolean;
}

const DEFAULT_SIZE = 44;

function SilverJournalGlyph({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        {/* Cover chrome */}
        <LinearGradient id="bookChrome" x1="50%" y1="0%" x2="50%" y2="100%">
          <Stop offset="0%" stopColor="#f0f0f2" />
          <Stop offset="14%" stopColor="#d4d4d7" />
          <Stop offset="46%" stopColor="#6a6a6e" />
          <Stop offset="62%" stopColor="#3b3b3f" />
          <Stop offset="86%" stopColor="#aaaaad" />
          <Stop offset="100%" stopColor="#7d7d80" />
        </LinearGradient>

        {/* Spine — darker chrome */}
        <LinearGradient id="bookSpine" x1="0%" y1="50%" x2="100%" y2="50%">
          <Stop offset="0%" stopColor="#3a3a3e" />
          <Stop offset="50%" stopColor="#7a7a7d" />
          <Stop offset="100%" stopColor="#1f1f22" />
        </LinearGradient>

        {/* Page edge — warm off-white */}
        <LinearGradient id="bookPages" x1="0%" y1="50%" x2="100%" y2="50%">
          <Stop offset="0%" stopColor="#ece9df" />
          <Stop offset="50%" stopColor="#cfccc1" />
          <Stop offset="100%" stopColor="#a8a59a" />
        </LinearGradient>

        {/* Pen / pencil chrome */}
        <LinearGradient id="penChrome" x1="0%" y1="50%" x2="100%" y2="50%">
          <Stop offset="0%" stopColor="#a5a5a8" />
          <Stop offset="50%" stopColor="#ececef" />
          <Stop offset="100%" stopColor="#5b5b5f" />
        </LinearGradient>

        <LinearGradient id="bookBrownPages" x1="0%" y1="50%" x2="100%" y2="50%">
          <Stop offset="0%" stopColor="#6a4626" />
          <Stop offset="50%" stopColor="#8a5e34" />
          <Stop offset="100%" stopColor="#3e2814" />
        </LinearGradient>

        <LinearGradient id="bookBrownSpine" x1="0%" y1="50%" x2="100%" y2="50%">
          <Stop offset="0%" stopColor="#2c1c0e" />
          <Stop offset="50%" stopColor="#5a3a1f" />
          <Stop offset="100%" stopColor="#1a0f06" />
        </LinearGradient>

        <LinearGradient id="bookPurpleEmboss" x1="0%" y1="50%" x2="100%" y2="50%">
          <Stop offset="0%" stopColor="#6e3aa8" />
          <Stop offset="50%" stopColor="#a868d8" />
          <Stop offset="100%" stopColor="#4a2376" />
        </LinearGradient>
      </Defs>

      {/* Page stack edge (visible right side, behind cover) */}
      <Rect x={5.4} y={3.4} width={14.6} height={17.2} rx={1.2} fill="url(#bookBrownPages)" />
      <Line x1={19.6} y1={5} x2={19.6} y2={19} stroke="#2a1808" strokeWidth={0.25} opacity={0.5} />
      <Line x1={19.1} y1={5.4} x2={19.1} y2={18.6} stroke="#2a1808" strokeWidth={0.25} opacity={0.4} />

      {/* Cover */}
      <Rect x={4} y={2.6} width={15} height={18.2} rx={1.4} fill="url(#bookChrome)" />

      {/* Cover top highlight */}
      <Rect x={4.6} y={3.1} width={13.8} height={1.5} rx={0.7} fill="#ffffff" opacity={0.45} />
      {/* Cover bottom shadow */}
      <Rect x={4.6} y={19} width={13.8} height={1.3} rx={0.65} fill="#0a0a0b" opacity={0.5} />

      {/* Spine — left band */}
      <Rect x={4} y={2.6} width={2.4} height={18.2} fill="url(#bookBrownSpine)" />
      <Rect x={5.7} y={2.6} width={0.4} height={18.2} fill="#c69b6a" opacity={0.35} />

      {/* Center emboss — a thin metallic monogram bar */}
      <Rect x={9.4} y={11.2} width={4.2} height={1.4} rx={0.55} fill="url(#bookPurpleEmboss)" />
      <Rect x={9.6} y={11.4} width={3.8} height={0.35} rx={0.18} fill="#ffffff" opacity={0.55} />

      {/* Bookmark ribbon (subtle) */}
      <Path d="M14.6 2.6 L14.6 8.5 L15.6 7.5 L16.6 8.5 L16.6 2.6 Z" fill="#7c2a2a" opacity={0.85} />
      <Rect x={14.6} y={2.6} width={2} height={0.5} fill="#ffffff" opacity={0.25} />
    </Svg>
  );
}

export function AnimatedJournalButton({
  size = DEFAULT_SIZE,
  disabled = false,
  onPress,
  dim = false,
}: AnimatedJournalButtonProps) {
  const router = useRouter();
  const iconSize = size * 0.52;

  const handlePress = () => {
    if (disabled) return;
    if (onPress) {
      onPress();
      return;
    }
    router.push('/journal');
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
          <SilverJournalGlyph size={iconSize} />
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

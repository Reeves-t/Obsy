import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Svg, { Ellipse } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { CTAOrbShell } from '@/components/home/CTAOrbShell';

interface QuickMoodButtonProps {
  size?: number;
  disabled?: boolean;
  onPress?: () => void;
  dim?: boolean;
}

const DEFAULT_SIZE = 44;

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
  dim = false,
}: QuickMoodButtonProps) {
  const router = useRouter();
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
    <TouchableOpacity
      activeOpacity={disabled ? 1 : 0.84}
      disabled={disabled}
      onPress={handlePress}
      style={styles.touchable}
    >
      <CTAOrbShell size={size} dim={dim}>
        <View style={styles.iconContainer}>
          <QuickMoodGlyph size={iconSize} />
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

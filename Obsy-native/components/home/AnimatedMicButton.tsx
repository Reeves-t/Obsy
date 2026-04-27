import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { CTAOrbShell } from '@/components/home/CTAOrbShell';

interface AnimatedMicButtonProps {
  size?: number;
  disabled?: boolean;
  onPress?: () => void;
  dim?: boolean;
}

const DEFAULT_SIZE = 36;

export function AnimatedMicButton({
  size = DEFAULT_SIZE,
  disabled = false,
  onPress,
  dim = false,
}: AnimatedMicButtonProps) {
  const router = useRouter();
  const iconSize = size * 0.38;

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
        <Ionicons name="mic" size={iconSize} color="#FFFFFF" />
      </CTAOrbShell>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  touchable: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});

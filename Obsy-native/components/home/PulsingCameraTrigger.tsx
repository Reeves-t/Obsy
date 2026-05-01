import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { CTAOrbShell } from '@/components/home/CTAOrbShell';

interface PulsingCameraTriggerProps {
  onPress?: () => void;
  size?: number;
  disabled?: boolean;
  dim?: boolean;
}

const DEFAULT_SIZE = 160;

export function PulsingCameraTrigger({
  onPress,
  size = DEFAULT_SIZE,
  disabled = false,
  dim = false,
}: PulsingCameraTriggerProps) {
  const router = useRouter();
  const iconSize = size * 0.225;

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
        <Ionicons name="camera" size={iconSize} color="rgba(255,255,255,0.92)" />
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

import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { CTAOrbShell } from '@/components/home/CTAOrbShell';

interface AnimatedJournalButtonProps {
  size?: number;
  disabled?: boolean;
  onPress?: () => void;
  dim?: boolean;
}

const DEFAULT_SIZE = 44;

export function AnimatedJournalButton({
  size = DEFAULT_SIZE,
  disabled = false,
  onPress,
  dim = false,
}: AnimatedJournalButtonProps) {
  const router = useRouter();
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
    <TouchableOpacity
      activeOpacity={disabled ? 1 : 0.84}
      disabled={disabled}
      onPress={handlePress}
      style={styles.touchable}
    >
      <CTAOrbShell size={size} dim={dim}>
        <View style={styles.iconContainer}>
          <Svg width={iconSize} height={iconSize} viewBox="0 0 24 24">
            <Path
              d="M3.5 5.8c2.6-.9 5.4-.9 8 0v13c-2.6-.9-5.4-.9-8 0v-13Z"
              stroke="#FFFFFF"
              strokeWidth={1.5}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Path
              d="M20.5 5.8c-2.6-.9-5.4-.9-8 0v13c2.6-.9 5.4-.9 8 0v-13Z"
              stroke="#FFFFFF"
              strokeWidth={1.5}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Path
              d="M11.5 5.8v13"
              stroke="#FFFFFF"
              strokeWidth={1.1}
              strokeLinecap="round"
              opacity={0.55}
            />
            <Path
              d="M5.6 9.1c1.3-.35 2.6-.4 3.9-.15"
              stroke="#FFFFFF"
              strokeWidth={1.2}
              strokeLinecap="round"
              opacity={0.6}
            />
            <Path
              d="M5.6 11.4c1.3-.35 2.6-.4 3.9-.15"
              stroke="#FFFFFF"
              strokeWidth={1.2}
              strokeLinecap="round"
              opacity={0.6}
            />
            <Path
              d="M19.4 7.6 14 13l-1.05 2.85 2.85-1.05 5.4-5.4-1.8-1.8Z"
              fill="#FFFFFF"
              stroke="none"
            />
            <Path
              d="M18.1 8.9l1.8 1.8"
              stroke="#0D0D0C"
              strokeWidth={1}
              strokeLinecap="round"
              opacity={0.5}
            />
            <Path
              d="m12.95 15.85 1.05-2.85"
              stroke="#FFFFFF"
              strokeWidth={1.2}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
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

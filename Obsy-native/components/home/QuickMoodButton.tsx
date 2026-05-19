import React, { useEffect } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { CTAOrbShell } from '@/components/home/CTAOrbShell';

interface QuickMoodButtonProps {
  size?: number;
  disabled?: boolean;
  onPress?: () => void;
  dim?: boolean;
  isFront?: boolean;
}

const DEFAULT_SIZE = 44;

// Orb data lifted directly from obsy.cobalt.logo.svg (and ObsyAnimatedSplash).
// Positions/sizes are in original 500-viewBox coordinates, scaled at render time.
type OrbDef = {
  cx: number;
  cy: number;
  r: number;
  grad: { cx: string; cy: string; r: string };
  stops: { offset: string; color: string; opacity: string }[];
  startOffsetY: number;
  stagger: number;
};

const ORBS: OrbDef[] = [
  {
    cx: 290,
    cy: 290,
    r: 76.7,
    grad: { cx: '30%', cy: '30%', r: '70%' },
    stops: [
      { offset: '0%', color: '#41caec', opacity: '1' },
      { offset: '31.76%', color: '#118dac', opacity: '0.95' },
      { offset: '73.76%', color: '#1d4d72', opacity: '0.7' },
      { offset: '100%', color: '#1a2643', opacity: '0' },
    ],
    startOffsetY: -50,
    stagger: 0,
  },
  {
    cx: 180,
    cy: 220,
    r: 31.86,
    grad: { cx: '68%', cy: '32%', r: '68%' },
    stops: [
      { offset: '0%', color: '#899fd2', opacity: '1' },
      { offset: '31.76%', color: '#4160aa', opacity: '0.95' },
      { offset: '73.76%', color: '#1a5071', opacity: '0.7' },
      { offset: '100%', color: '#04222a', opacity: '0' },
    ],
    startOffsetY: -35,
    stagger: 120,
  },
  {
    cx: 200,
    cy: 340,
    r: 25.96,
    grad: { cx: '38%', cy: '60%', r: '65%' },
    stops: [
      { offset: '0%', color: '#61a9d9', opacity: '1' },
      { offset: '31.76%', color: '#2b7db3', opacity: '0.95' },
      { offset: '73.76%', color: '#174361', opacity: '0.7' },
      { offset: '100%', color: '#091b27', opacity: '0' },
    ],
    startOffsetY: 50,
    stagger: 240,
  },
];

function ObsyOrbsGlyph({ size, isFront = false }: { size: number; isFront?: boolean }) {
  const S = size / 500;

  const orb0Y = useSharedValue(0);
  const orb0Opacity = useSharedValue(1);
  const orb1Y = useSharedValue(0);
  const orb1Opacity = useSharedValue(1);
  const orb2Y = useSharedValue(0);
  const orb2Opacity = useSharedValue(1);

  useEffect(() => {
    if (!isFront) return;
    const easeOut = Easing.out(Easing.cubic);
    const dur = 620;

    orb0Y.value = ORBS[0].startOffsetY * S;
    orb0Opacity.value = 0;
    orb1Y.value = ORBS[1].startOffsetY * S;
    orb1Opacity.value = 0;
    orb2Y.value = ORBS[2].startOffsetY * S;
    orb2Opacity.value = 0;

    orb0Y.value = withDelay(ORBS[0].stagger, withTiming(0, { duration: dur, easing: easeOut }));
    orb0Opacity.value = withDelay(ORBS[0].stagger, withTiming(1, { duration: dur, easing: easeOut }));
    orb1Y.value = withDelay(ORBS[1].stagger, withTiming(0, { duration: dur, easing: easeOut }));
    orb1Opacity.value = withDelay(ORBS[1].stagger, withTiming(1, { duration: dur, easing: easeOut }));
    orb2Y.value = withDelay(ORBS[2].stagger, withTiming(0, { duration: dur, easing: easeOut }));
    orb2Opacity.value = withDelay(ORBS[2].stagger, withTiming(1, { duration: dur, easing: easeOut }));
  }, [isFront, S, orb0Y, orb0Opacity, orb1Y, orb1Opacity, orb2Y, orb2Opacity]);

  const orb0Style = useAnimatedStyle(() => ({
    opacity: orb0Opacity.value,
    transform: [{ translateY: orb0Y.value }],
  }));
  const orb1Style = useAnimatedStyle(() => ({
    opacity: orb1Opacity.value,
    transform: [{ translateY: orb1Y.value }],
  }));
  const orb2Style = useAnimatedStyle(() => ({
    opacity: orb2Opacity.value,
    transform: [{ translateY: orb2Y.value }],
  }));

  const orbStyles = [orb0Style, orb1Style, orb2Style];

  return (
    <View style={{ width: size, height: size }}>
      {ORBS.map((orb, i) => {
        const orbW = orb.r * 2 * S + 4;
        const orbH = orb.r * 2 * S + 4;
        const orbLeft = orb.cx * S - orbW / 2;
        const orbTop = orb.cy * S - orbH / 2;

        return (
          <Animated.View
            key={i}
            style={[
              styles.orbContainer,
              {
                left: orbLeft,
                top: orbTop,
                width: orbW,
                height: orbH,
              },
              orbStyles[i],
            ]}
          >
            <Svg width={orbW} height={orbH} viewBox={`0 0 ${orbW} ${orbH}`}>
              <Defs>
                <RadialGradient
                  id={`qmOrb${i}`}
                  cx={orb.grad.cx}
                  cy={orb.grad.cy}
                  r={orb.grad.r}
                >
                  {orb.stops.map((s, j) => (
                    <Stop key={j} offset={s.offset} stopColor={s.color} stopOpacity={s.opacity} />
                  ))}
                </RadialGradient>
              </Defs>
              <Circle cx={orbW / 2} cy={orbH / 2} r={orb.r * S} fill={`url(#qmOrb${i})`} />
            </Svg>
          </Animated.View>
        );
      })}
    </View>
  );
}

export function QuickMoodButton({
  size = DEFAULT_SIZE,
  disabled = false,
  onPress,
  dim = false,
  isFront = false,
}: QuickMoodButtonProps) {
  const router = useRouter();
  const iconSize = size * 0.7;

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
          <ObsyOrbsGlyph size={iconSize} isFront={isFront} />
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
  orbContainer: {
    position: 'absolute',
  },
});

import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Accelerometer } from 'expo-sensors';
import { getMoodTheme } from '@/lib/moods';

interface InsightMoodOrbFieldProps {
  moodIds: string[];
  variant: 'subtle' | 'focus' | 'tiny';
  maxOrbs?: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function buildOrbMoodList(moodIds: string[], maxOrbs: number): string[] {
  if (!moodIds.length) return [];

  const counts = new Map<string, number>();
  moodIds.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxOrbs)
    .map(([id]) => id);
}

function AnimatedOrb({
  moodId,
  index,
  variant,
  tiltX,
}: {
  moodId: string;
  index: number;
  variant: 'subtle' | 'focus' | 'tiny';
  tiltX: SharedValue<number>;
}) {
  const floatY = useSharedValue(0);
  const theme = getMoodTheme(moodId);

  const size = variant === 'focus' ? 30 : variant === 'tiny' ? 14 : 18;
  const amplitude = variant === 'focus' ? 10 : variant === 'tiny' ? 4 : 6;

  useEffect(() => {
    const delay = index * 90;
    const upDuration = 1300 + (index % 3) * 220;
    const downDuration = 1200 + (index % 4) * 160;

    const timer = setTimeout(() => {
      floatY.value = withRepeat(
        withSequence(
          withTiming(-amplitude, { duration: upDuration, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: downDuration, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      );
    }, delay);

    return () => clearTimeout(timer);
  }, [floatY, index, amplitude]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: floatY.value },
      { translateX: tiltX.value * (0.5 + index * 0.08) },
    ],
  }));

  return (
    <Animated.View style={[styles.orbWrapper, style]}>
      <LinearGradient
        colors={[theme.gradient.primary, theme.gradient.mid, theme.gradient.secondary] as [string, string, string]}
        start={{ x: 0.2, y: 0.2 }}
        end={{ x: 0.9, y: 1 }}
        style={[styles.orb, { width: size, height: size, borderRadius: size / 2 }]}
      />
    </Animated.View>
  );
}

export function InsightMoodOrbField({ moodIds, variant, maxOrbs = 8 }: InsightMoodOrbFieldProps) {
  const tiltX = useSharedValue(0);

  const orbMoodList = useMemo(() => buildOrbMoodList(moodIds, maxOrbs), [moodIds, maxOrbs]);

  useEffect(() => {
    Accelerometer.setUpdateInterval(140);
    const subscription = Accelerometer.addListener(({ x }) => {
      tiltX.value = withTiming(clamp(x * 16, -8, 8), { duration: 130 });
    });

    return () => {
      subscription.remove();
    };
  }, [tiltX]);

  if (!orbMoodList.length) return null;

  if (variant === 'focus') {
    return (
      <View style={styles.focusContainer}>
        {orbMoodList.map((moodId, index) => {
          const col = index % 4;
          const row = Math.floor(index / 4);
          return (
            <View
              key={`${moodId}-${index}`}
              style={[
                styles.focusSpot,
                {
                  left: `${10 + col * 22}%`,
                  top: `${18 + row * 35}%`,
                },
              ]}
            >
              <AnimatedOrb moodId={moodId} index={index} variant={variant} tiltX={tiltX} />
            </View>
          );
        })}
      </View>
    );
  }

  if (variant === 'tiny') {
    return (
      <View style={styles.tinyRow}>
        {orbMoodList.slice(0, 10).map((moodId, index) => (
          <AnimatedOrb key={`${moodId}-${index}`} moodId={moodId} index={index} variant={variant} tiltX={tiltX} />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.subtleRow}>
      {orbMoodList.map((moodId, index) => (
        <AnimatedOrb key={`${moodId}-${index}`} moodId={moodId} index={index} variant={variant} tiltX={tiltX} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  subtleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    gap: 8,
  },
  tinyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 2,
  },
  focusContainer: {
    width: '100%',
    minHeight: 90,
    marginTop: 6,
    position: 'relative',
  },
  focusSpot: {
    position: 'absolute',
  },
  orbWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  orb: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
});

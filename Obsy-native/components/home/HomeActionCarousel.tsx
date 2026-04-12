import React, { useEffect, useMemo, useState } from 'react';
import {
  LayoutAnimation,
  PanResponder,
  Pressable,
  Platform,
  StyleSheet,
  UIManager,
  View,
} from 'react-native';
import { AnimatedMicButton } from '@/components/home/AnimatedMicButton';
import { AnimatedJournalButton } from '@/components/home/AnimatedJournalButton';
import { PulsingCameraTrigger } from '@/components/home/PulsingCameraTrigger';
import { QuickMoodButton } from '@/components/home/QuickMoodButton';

type ActionKey = 'voice' | 'capture' | 'journal' | 'quick-mood';

interface ActionConfig {
  key: ActionKey;
  render: (options: {
    size: number;
    disabled: boolean;
    onPress?: () => void;
  }) => React.ReactNode;
}

const MAIN_BUTTON_SIZE = 168;
const SIDE_BUTTON_SIZE = 72;
const SWIPE_THRESHOLD = 36;

const ACTIONS: ActionConfig[] = [
  {
    key: 'voice',
    render: ({ size, disabled, onPress }) => (
      <AnimatedMicButton size={size} disabled={disabled} onPress={onPress} />
    ),
  },
  {
    key: 'capture',
    render: ({ size, disabled, onPress }) => (
      <PulsingCameraTrigger size={size} disabled={disabled} onPress={onPress} />
    ),
  },
  {
    key: 'journal',
    render: ({ size, disabled, onPress }) => (
      <AnimatedJournalButton size={size} disabled={disabled} onPress={onPress} />
    ),
  },
  {
    key: 'quick-mood',
    render: ({ size, disabled, onPress }) => (
      <QuickMoodButton size={size} disabled={disabled} onPress={onPress} />
    ),
  },
];

function wrapIndex(index: number): number {
  const length = ACTIONS.length;
  return ((index % length) + length) % length;
}

interface CarouselSlotProps {
  action: ActionConfig;
  size: number;
  disabled: boolean;
  onPress?: () => void;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
}

function CarouselSlot({
  action,
  size,
  disabled,
  onPress,
  pointerEvents = 'auto',
}: CarouselSlotProps) {
  return (
    <View
      pointerEvents={pointerEvents}
      style={[
        styles.slot,
        {
          width: size,
          height: size,
        },
      ]}
    >
      {action.render({ size, disabled, onPress })}
    </View>
  );
}

export function HomeActionCarousel() {
  const [activeIndex, setActiveIndex] = useState(1);

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const rotate = (direction: 'left' | 'right') => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveIndex((current) => wrapIndex(current + (direction === 'left' ? 1 : -1)));
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onMoveShouldSetPanResponderCapture: (_, gestureState) =>
          Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx <= -SWIPE_THRESHOLD) {
            rotate('left');
          } else if (gestureState.dx >= SWIPE_THRESHOLD) {
            rotate('right');
          }
        },
      }),
    []
  );

  const leftAction = ACTIONS[wrapIndex(activeIndex - 1)];
  const centerAction = ACTIONS[activeIndex];
  const rightAction = ACTIONS[wrapIndex(activeIndex + 1)];

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <Pressable style={styles.sideSlot} onPress={() => rotate('right')}>
        <View pointerEvents="none">
          <CarouselSlot
            action={leftAction}
            size={SIDE_BUTTON_SIZE}
            disabled
            pointerEvents="none"
          />
        </View>
      </Pressable>

      <View style={styles.centerSlot}>
        <CarouselSlot action={centerAction} size={MAIN_BUTTON_SIZE} disabled={false} />
      </View>

      <Pressable style={styles.sideSlot} onPress={() => rotate('left')}>
        <View pointerEvents="none">
          <CarouselSlot
            action={rightAction}
            size={SIDE_BUTTON_SIZE}
            disabled
            pointerEvents="none"
          />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 360,
    minHeight: 212,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sideSlot: {
    width: 82,
    height: 82,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerSlot: {
    width: 176,
    height: 176,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

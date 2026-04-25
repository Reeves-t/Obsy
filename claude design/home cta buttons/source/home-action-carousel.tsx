import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, Ellipse, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { AnimatedMicButton } from '@/components/home/AnimatedMicButton';
import { AnimatedJournalButton } from '@/components/home/AnimatedJournalButton';
import { PulsingCameraTrigger } from '@/components/home/PulsingCameraTrigger';
import { QuickMoodButton } from '@/components/home/QuickMoodButton';

type ActionKey = 'voice' | 'capture' | 'journal' | 'quick-mood';
type OrbitSlotName = 'front' | 'left' | 'right' | 'top';

interface ActionConfig {
  key: ActionKey;
  render: (options: {
    size: number;
    disabled: boolean;
    onPress?: () => void;
  }) => React.ReactNode;
}

interface OrbitLayout {
  hitSize: number;
  opacity: number;
  scale: number;
  translateX: number;
  translateY: number;
  zIndex: number;
}

interface CarouselSlotProps {
  action: ActionConfig;
  size: number;
  disabled: boolean;
  onPress?: () => void;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
}

interface OrbitItemProps {
  action: ActionConfig;
  slot: OrbitSlotName;
  onRotateLeft: () => void;
  onRotateRight: () => void;
}

const MAIN_BUTTON_SIZE = 168;
const BUTTON_RING_PADDING = 8;
const STAGE_SIZE = MAIN_BUTTON_SIZE + BUTTON_RING_PADDING;
const CONTAINER_WIDTH = 360;
const CONTAINER_HEIGHT = 308;
const CAPTION_SWAP_OUT_DURATION = 130;
const CAPTION_SWAP_IN_DURATION = 220;
const CAPTION_SWAP_DELAY = 140;
const ORBIT_ANIMATION_DURATION = 460;
const SWIPE_THRESHOLD = 36;

const SLOT_LAYOUTS: Record<OrbitSlotName, OrbitLayout> = {
  front: {
    hitSize: 176,
    opacity: 1,
    scale: 1,
    translateX: 0,
    translateY: 34,
    zIndex: 4,
  },
  left: {
    hitSize: 112,
    opacity: 0.94,
    scale: 0.45,
    translateX: -126,
    translateY: -24,
    zIndex: 3,
  },
  right: {
    hitSize: 112,
    opacity: 0.94,
    scale: 0.45,
    translateX: 126,
    translateY: -24,
    zIndex: 3,
  },
  top: {
    hitSize: 84,
    opacity: 0.72,
    scale: 0.35,
    translateX: 0,
    translateY: -96,
    zIndex: 1,
  },
};

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

const CTA_DESCRIPTIONS: Record<ActionKey, string> = {
  capture: 'capture a moment that reflects your mood',
  journal: "write whatever is on your mind",
  voice: "say what's on your mind out loud",
  'quick-mood': 'no words needed, just log the mood',
};

function wrapIndex(index: number): number {
  const length = ACTIONS.length;
  return ((index % length) + length) % length;
}

function getSlotForAction(actionIndex: number, activeIndex: number): OrbitSlotName {
  const relativeIndex = wrapIndex(actionIndex - activeIndex);

  if (relativeIndex === 0) return 'front';
  if (relativeIndex === 1) return 'right';
  if (relativeIndex === 2) return 'top';
  return 'left';
}

function CarouselSlot({
  action,
  size,
  disabled,
  onPress,
  pointerEvents = 'auto',
}: CarouselSlotProps) {
  const visualSize = size + BUTTON_RING_PADDING;

  return (
    <View
      pointerEvents={pointerEvents}
      style={[
        styles.slot,
        {
          width: visualSize,
          height: visualSize,
        },
      ]}
    >
      {action.render({ size, disabled, onPress })}
    </View>
  );
}

function FrontObsyRing({ diameter }: { diameter: number }) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.frontRingWrap,
        {
          width: diameter,
          height: diameter,
        },
      ]}
    >
      <Svg width={diameter} height={diameter} viewBox="0 0 176 176">
        <Defs>
          <SvgLinearGradient id="frontRingGrad" x1="88" y1="18" x2="88" y2="158" gradientUnits="userSpaceOnUse">
            <Stop offset="0.038" stopColor="#868080" />
            <Stop offset="0.221" stopColor="#434040" />
            <Stop offset="0.346" stopColor="#2E2C2C" />
            <Stop offset="0.538" stopColor="#121111" />
            <Stop offset="0.889" stopColor="#A9A2A2" />
          </SvgLinearGradient>
        </Defs>
        <Ellipse cx="88" cy="88" rx="86" ry="82" fill="url(#frontRingGrad)" />
      </Svg>
    </View>
  );
}

function OrbitItem({
  action,
  slot,
  onRotateLeft,
  onRotateRight,
}: OrbitItemProps) {
  const layout = SLOT_LAYOUTS[slot];
  const translateX = useSharedValue(layout.translateX);
  const translateY = useSharedValue(layout.translateY);
  const scale = useSharedValue(layout.scale);
  const opacity = useSharedValue(layout.opacity);

  useEffect(() => {
    translateX.value = withTiming(layout.translateX, {
      duration: ORBIT_ANIMATION_DURATION,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    });
    translateY.value = withTiming(layout.translateY, {
      duration: ORBIT_ANIMATION_DURATION,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    });
    scale.value = withTiming(layout.scale, {
      duration: ORBIT_ANIMATION_DURATION,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    });
    opacity.value = withTiming(layout.opacity, {
      duration: ORBIT_ANIMATION_DURATION - 40,
      easing: Easing.out(Easing.cubic),
    });
  }, [layout.opacity, layout.scale, layout.translateX, layout.translateY, opacity, scale, translateX, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const slotContent = (
    <CarouselSlot
      action={action}
      size={MAIN_BUTTON_SIZE}
      disabled={slot !== 'front'}
      pointerEvents={slot === 'front' ? 'auto' : 'none'}
    />
  );

  return (
    <Animated.View
      style={[
        styles.orbitItem,
        {
          zIndex: layout.zIndex,
          elevation: layout.zIndex,
        },
        animatedStyle,
      ]}
      pointerEvents="box-none"
    >
      {slot === 'front' ? (
        <View style={styles.frontSlotWrap}>
          <FrontObsyRing diameter={SLOT_LAYOUTS.front.hitSize} />
          {slotContent}
        </View>
      ) : slot === 'left' ? (
        <Pressable
          style={[styles.touchZone, { width: layout.hitSize, height: layout.hitSize }]}
          onPress={onRotateRight}
        >
          <View pointerEvents="none">{slotContent}</View>
        </Pressable>
      ) : slot === 'right' ? (
        <Pressable
          style={[styles.touchZone, { width: layout.hitSize, height: layout.hitSize }]}
          onPress={onRotateLeft}
        >
          <View pointerEvents="none">{slotContent}</View>
        </Pressable>
      ) : (
        <Pressable
          style={[styles.touchZone, { width: layout.hitSize, height: layout.hitSize }]}
          onPress={onRotateLeft}
        >
          <View pointerEvents="none">{slotContent}</View>
        </Pressable>
      )}
    </Animated.View>
  );
}

export function HomeActionCarousel() {
  const [activeIndex, setActiveIndex] = useState(1);
  const [displayedActionKey, setDisplayedActionKey] = useState<ActionKey>(ACTIONS[1].key);
  const [isAnimating, setIsAnimating] = useState(false);
  const animationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captionOpacity = useSharedValue(1);

  useEffect(() => {
    return () => {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
      if (captionTimeoutRef.current) {
        clearTimeout(captionTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const nextActionKey = ACTIONS[activeIndex].key;

    if (nextActionKey === displayedActionKey) return;

    if (captionTimeoutRef.current) {
      clearTimeout(captionTimeoutRef.current);
    }

    captionOpacity.value = withTiming(0, {
      duration: CAPTION_SWAP_OUT_DURATION,
      easing: Easing.out(Easing.quad),
    });

    captionTimeoutRef.current = setTimeout(() => {
      setDisplayedActionKey(nextActionKey);
      captionOpacity.value = withTiming(1, {
        duration: CAPTION_SWAP_IN_DURATION,
        easing: Easing.out(Easing.cubic),
      });
      captionTimeoutRef.current = null;
    }, CAPTION_SWAP_DELAY);
  }, [activeIndex, captionOpacity, displayedActionKey]);

  const captionStyle = useAnimatedStyle(() => ({
    opacity: captionOpacity.value,
  }));

  const rotate = useCallback((direction: 'left' | 'right') => {
    if (isAnimating) return;

    setIsAnimating(true);
    setActiveIndex((current) => wrapIndex(current + (direction === 'left' ? 1 : -1)));

    if (animationTimeoutRef.current) {
      clearTimeout(animationTimeoutRef.current);
    }

    animationTimeoutRef.current = setTimeout(() => {
      setIsAnimating(false);
      animationTimeoutRef.current = null;
    }, ORBIT_ANIMATION_DURATION);
  }, [isAnimating]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          !isAnimating &&
          Math.abs(gestureState.dx) > 10 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onMoveShouldSetPanResponderCapture: (_, gestureState) =>
          !isAnimating &&
          Math.abs(gestureState.dx) > 10 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx <= -SWIPE_THRESHOLD) {
            rotate('left');
          } else if (gestureState.dx >= SWIPE_THRESHOLD) {
            rotate('right');
          }
        },
      }),
    [isAnimating, rotate]
  );

  return (
    <View style={styles.carouselShell}>
      <View style={styles.container} {...panResponder.panHandlers}>
        {ACTIONS.map((action, index) => (
          <OrbitItem
            key={action.key}
            action={action}
            slot={getSlotForAction(index, activeIndex)}
            onRotateLeft={() => rotate('left')}
            onRotateRight={() => rotate('right')}
          />
        ))}
      </View>

      <View style={styles.captionWrap}>
        <Animated.View style={[styles.captionInner, captionStyle]}>
          <Text style={styles.captionText}>
            {CTA_DESCRIPTIONS[displayedActionKey]}
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  carouselShell: {
    width: CONTAINER_WIDTH,
    alignItems: 'center',
  },
  container: {
    width: CONTAINER_WIDTH,
    height: CONTAINER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbitItem: {
    position: 'absolute',
    top: CONTAINER_HEIGHT / 2 - STAGE_SIZE / 2,
    left: CONTAINER_WIDTH / 2 - STAGE_SIZE / 2,
    width: STAGE_SIZE,
    height: STAGE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  frontSlotWrap: {
    width: SLOT_LAYOUTS.front.hitSize,
    height: SLOT_LAYOUTS.front.hitSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frontRingWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  touchZone: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  captionWrap: {
    width: CONTAINER_WIDTH,
    minHeight: 48,
    marginTop: 6,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 28,
  },
  captionInner: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captionText: {
    maxWidth: 280,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.58)',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
    letterSpacing: 0.15,
  },
});

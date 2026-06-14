import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { AnimatedMicButton } from '@/components/home/AnimatedMicButton';
import { AnimatedJournalButton } from '@/components/home/AnimatedJournalButton';
import { PulsingCameraTrigger } from '@/components/home/PulsingCameraTrigger';
import { QuickMoodButton } from '@/components/home/QuickMoodButton';
import { useAuroraPulseStore } from '@/lib/auroraPulseStore';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { getThemeAccentRgb } from '@/lib/themeAccent';
import { ReflectedCaption } from '@/components/ui/ReflectedCaption';

type ActionKey = 'voice' | 'capture' | 'journal' | 'quick-mood';
type OrbitSlotName = 'front' | 'left' | 'right' | 'top';

interface ActionConfig {
  key: ActionKey;
  render: (options: {
    size: number;
    disabled: boolean;
    onPress?: () => void;
    dim?: boolean;
    isFront?: boolean;
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
  dim?: boolean;
  isFront?: boolean;
  onPress?: () => void;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
}

interface OrbitItemProps {
  action: ActionConfig;
  slot: OrbitSlotName;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  motionKey: number;
}

const MAIN_BUTTON_SIZE = 172;
const BUTTON_RING_PADDING = 8;
const STAGE_SIZE = MAIN_BUTTON_SIZE + BUTTON_RING_PADDING;
const CONTAINER_WIDTH = 360;
const CONTAINER_HEIGHT = 300;
const CAPTION_SWAP_OUT_DURATION = 170;
const CAPTION_SWAP_DELAY = 180;
const CAPTION_SWAP_IN_DURATION = 230;
const ORBIT_ANIMATION_DURATION = 680;
const TRANSLATE_DURATION = 500;
const SCALE_DURATION = 500;
const OPACITY_DURATION = 440;
const STAGGER_DELAY = 180;
const SWIPE_THRESHOLD = 36;

const SLOT_LAYOUTS: Record<OrbitSlotName, OrbitLayout> = {
  front: {
    hitSize: STAGE_SIZE,
    opacity: 1,
    scale: 1,
    translateX: 0,
    translateY: 44,
    zIndex: 4,
  },
  left: {
    hitSize: 96,
    opacity: 0.95,
    scale: 0.30,
    translateX: -118,
    translateY: -6,
    zIndex: 3,
  },
  right: {
    hitSize: 96,
    opacity: 0.95,
    scale: 0.30,
    translateX: 118,
    translateY: -6,
    zIndex: 3,
  },
  top: {
    hitSize: 72,
    opacity: 0.55,
    scale: 0.20,
    translateX: 0,
    translateY: -94,
    zIndex: 2,
  },
};

const SLOT_DEPTHS: Record<OrbitSlotName, number> = {
  front: 0,
  left: 1,
  right: 1,
  top: 2,
};

const ACTIONS: ActionConfig[] = [
  {
    key: 'voice',
    render: ({ size, disabled, onPress, dim }) => (
      <AnimatedMicButton size={size} disabled={disabled} onPress={onPress} dim={dim} />
    ),
  },
  {
    key: 'capture',
    render: ({ size, disabled, onPress, dim }) => (
      <PulsingCameraTrigger size={size} disabled={disabled} onPress={onPress} dim={dim} />
    ),
  },
  {
    key: 'journal',
    render: ({ size, disabled, onPress, dim }) => (
      <AnimatedJournalButton size={size} disabled={disabled} onPress={onPress} dim={dim} />
    ),
  },
  {
    key: 'quick-mood',
    render: ({ size, disabled, onPress, dim, isFront }) => (
      <QuickMoodButton size={size} disabled={disabled} onPress={onPress} dim={dim} isFront={isFront} />
    ),
  },
];

const CTA_DESCRIPTIONS: Record<ActionKey, string> = {
  capture: 'capture a moment that reflects your mood',
  journal: "write whatever is on your mind",
  voice: "say what's on your mind out loud",
  'quick-mood': 'no words needed, just log the mood',
};

// ─── Carousel helpers ────────────────────────────────────────────────

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
  dim = false,
  isFront = false,
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
      {action.render({ size, disabled, onPress, dim, isFront })}
    </View>
  );
}

function OrbitItem({
  action,
  slot,
  onRotateLeft,
  onRotateRight,
  motionKey,
}: OrbitItemProps) {
  const layout = SLOT_LAYOUTS[slot];
  const translateX = useSharedValue(layout.translateX);
  const translateY = useSharedValue(layout.translateY);
  const scale = useSharedValue(layout.scale);
  const opacity = useSharedValue(layout.opacity);
  const swayRotation = useSharedValue(0);
  const swayLift = useSharedValue(0);

  const prevSlotRef = useRef<OrbitSlotName>(slot);

  useEffect(() => {
    const prevSlot = prevSlotRef.current;
    const prevDepth = SLOT_DEPTHS[prevSlot];
    const newDepth = SLOT_DEPTHS[slot];
    prevSlotRef.current = slot;

    const movingForward = newDepth < prevDepth;
    const movingBackward = newDepth > prevDepth;
    const isBecomingFront = slot === 'front';

    // Forward: translate first, scale resolves after. Backward: scale shrinks first, translate drifts after.
    const translateDelay = movingBackward ? STAGGER_DELAY : 0;
    const scaleDelay = movingForward ? STAGGER_DELAY : 0;

    const translateEasing = Easing.bezier(0.22, 1, 0.36, 1);
    const scaleEasing = movingForward
      ? Easing.bezier(0.34, 1.2, 0.64, 1)
      : Easing.bezier(0.22, 1, 0.36, 1);

    translateX.value = withDelay(
      translateDelay,
      withTiming(layout.translateX, { duration: TRANSLATE_DURATION, easing: translateEasing })
    );
    translateY.value = withDelay(
      translateDelay,
      withTiming(layout.translateY, { duration: TRANSLATE_DURATION, easing: translateEasing })
    );

    if (isBecomingFront) {
      // Snap arrival: hold near origin scale during travel, then punchy overshoot landing
      scale.value = withDelay(
        280,
        withTiming(layout.scale, { duration: 320, easing: Easing.bezier(0.34, 1.55, 0.64, 1) })
      );
    } else {
      scale.value = withDelay(
        scaleDelay,
        withTiming(layout.scale, { duration: SCALE_DURATION, easing: scaleEasing })
      );
    }

    opacity.value = withTiming(layout.opacity, {
      duration: OPACITY_DURATION,
      easing: Easing.out(Easing.cubic),
    });
  }, [slot, layout.opacity, layout.scale, layout.translateX, layout.translateY, opacity, scale, translateX, translateY]);

  useEffect(() => {
    if (slot !== 'front') return;

    // Hold a small tilt + lift during translation, then kick back to upright synced with the snap
    swayRotation.value = -3;
    swayLift.value = -1;
    swayRotation.value = withDelay(
      280,
      withTiming(0, { duration: 280, easing: Easing.out(Easing.cubic) })
    );
    swayLift.value = withDelay(
      280,
      withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) })
    );
  }, [motionKey, slot, swayLift, swayRotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const swayStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: swayLift.value },
      { rotateZ: `${swayRotation.value}deg` },
    ],
  }));

  const slotContent = (
    <CarouselSlot
      action={action}
      size={MAIN_BUTTON_SIZE}
      disabled={slot !== 'front'}
      dim={slot === 'top'}
      isFront={slot === 'front'}
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
        <Animated.View style={[styles.frontMotionWrap, swayStyle]}>
          {slotContent}
        </Animated.View>
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
  const [motionKey, setMotionKey] = useState(0);
  const animationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const capOpacity = useSharedValue(1);
  const capLift = useSharedValue(0);
  const capScale = useSharedValue(1);

  const { auroraBackground, orbWave } = useObsyTheme();
  const accentRgb = getThemeAccentRgb(auroraBackground, orbWave);

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

    // Fade out + lift away.
    capOpacity.value = withTiming(0, { duration: CAPTION_SWAP_OUT_DURATION, easing: Easing.out(Easing.quad) });
    capLift.value = withTiming(-6, { duration: CAPTION_SWAP_OUT_DURATION, easing: Easing.out(Easing.quad) });

    captionTimeoutRef.current = setTimeout(() => {
      // Swap text at the opacity trough, then fade in with a gentle scale settle.
      setDisplayedActionKey(nextActionKey);
      capLift.value = 6;
      capScale.value = 0.96;
      capOpacity.value = withTiming(1, { duration: CAPTION_SWAP_IN_DURATION, easing: Easing.out(Easing.cubic) });
      capLift.value = withTiming(0, { duration: CAPTION_SWAP_IN_DURATION, easing: Easing.out(Easing.cubic) });
      capScale.value = withTiming(1, { duration: CAPTION_SWAP_IN_DURATION, easing: Easing.out(Easing.cubic) });
      captionTimeoutRef.current = null;
    }, CAPTION_SWAP_DELAY);
  }, [activeIndex, capOpacity, capLift, capScale, displayedActionKey]);

  const captionStyle = useAnimatedStyle(() => ({
    opacity: capOpacity.value,
    transform: [{ translateY: capLift.value }, { scale: capScale.value }],
  }));

  const rotate = useCallback((direction: 'left' | 'right') => {
    if (isAnimating) return;

    // Nudge the Aurora background orbs to wander with the carousel move.
    // getState() avoids adding a re-render dependency to this callback.
    useAuroraPulseStore.getState().pulse(direction);

    setIsAnimating(true);
    setMotionKey((current) => current + 1);
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
            motionKey={motionKey}
          />
        ))}
      </View>

      <View style={styles.captionWrap}>
        <Animated.View style={[styles.captionInner, captionStyle]}>
          <ReflectedCaption
            text={CTA_DESCRIPTIONS[displayedActionKey]}
            textStyle={styles.captionText}
            reflectionColor={`rgb(${accentRgb})`}
          />
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
  frontMotionWrap: {
    width: STAGE_SIZE,
    height: STAGE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  touchZone: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  captionWrap: {
    width: CONTAINER_WIDTH,
    minHeight: 32,
    marginTop: 80,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 28,
  },
  captionInner: {
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  captionText: {
    maxWidth: 320,
    textAlign: 'center',
    color: 'rgba(232,236,245,0.82)',
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '500',
    letterSpacing: 0.4,
  },
});

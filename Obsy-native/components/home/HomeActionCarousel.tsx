import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
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
    dim?: boolean;
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

const MAIN_BUTTON_SIZE = 156;
const BUTTON_RING_PADDING = 8;
const STAGE_SIZE = MAIN_BUTTON_SIZE + BUTTON_RING_PADDING;
const CONTAINER_WIDTH = 360;
const CONTAINER_HEIGHT = 300;
const CAPTION_SWAP_OUT_DURATION = 130;
const CAPTION_SWAP_DELAY = 140;
const ORBIT_ANIMATION_DURATION = 820;
const CTA_SHIMMER_DURATION = 3200;
const CAPTION_REVEAL_DELAY = CTA_SHIMMER_DURATION * 0.35;
const CAPTION_REVEAL_MID_DURATION = CTA_SHIMMER_DURATION * 0.2;
const CAPTION_REVEAL_END_DURATION = CTA_SHIMMER_DURATION * 0.2;
const SWIPE_THRESHOLD = 36;

const SLOT_LAYOUTS: Record<OrbitSlotName, OrbitLayout> = {
  front: {
    hitSize: STAGE_SIZE,
    opacity: 1,
    scale: 1,
    translateX: 0,
    translateY: 28,
    zIndex: 4,
  },
  left: {
    hitSize: 112,
    opacity: 0.95,
    scale: 0.46,
    translateX: -134,
    translateY: -6,
    zIndex: 3,
  },
  right: {
    hitSize: 112,
    opacity: 0.95,
    scale: 0.46,
    translateX: 134,
    translateY: -6,
    zIndex: 3,
  },
  top: {
    hitSize: 84,
    opacity: 0.75,
    scale: 0.34,
    translateX: 0,
    translateY: -88,
    zIndex: 2,
  },
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
    render: ({ size, disabled, onPress, dim }) => (
      <QuickMoodButton size={size} disabled={disabled} onPress={onPress} dim={dim} />
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
  dim = false,
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
      {action.render({ size, disabled, onPress, dim })}
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
      duration: ORBIT_ANIMATION_DURATION - 60,
      easing: Easing.out(Easing.cubic),
    });
  }, [layout.opacity, layout.scale, layout.translateX, layout.translateY, opacity, scale, translateX, translateY]);

  useEffect(() => {
    if (slot !== 'front') return;

    swayRotation.value = -5;
    swayLift.value = -2;
    swayRotation.value = withSequence(
      withTiming(3, { duration: 490, easing: Easing.bezier(0.22, 1, 0.36, 1) }),
      withTiming(-1.5, { duration: 350, easing: Easing.out(Easing.cubic) }),
      withTiming(0.6, { duration: 280, easing: Easing.out(Easing.cubic) }),
      withTiming(0, { duration: 280, easing: Easing.out(Easing.cubic) })
    );
    swayLift.value = withTiming(0, {
      duration: 520,
      easing: Easing.out(Easing.cubic),
    });
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
  const [captionLayout, setCaptionLayout] = useState({ width: 0, height: 0 });
  const animationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captionOpacity = useSharedValue(1);
  const captionBaseOpacity = useSharedValue(0);
  const captionShimmerProgress = useSharedValue(0);

  const restartCaptionAnimation = useCallback(() => {
    captionBaseOpacity.value = 0;
    captionBaseOpacity.value = withSequence(
      withDelay(
        CAPTION_REVEAL_DELAY,
        withTiming(0.55, {
          duration: CAPTION_REVEAL_MID_DURATION,
          easing: Easing.bezier(0.4, 0, 0.2, 1),
        })
      ),
      withTiming(1, {
        duration: CAPTION_REVEAL_END_DURATION,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
      })
    );

    captionShimmerProgress.value = 0;
    captionShimmerProgress.value = withTiming(1, {
      duration: CTA_SHIMMER_DURATION,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    });
  }, [captionBaseOpacity, captionShimmerProgress]);

  useEffect(() => {
    restartCaptionAnimation();
  }, [restartCaptionAnimation]);

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
      captionOpacity.value = withTiming(1, { duration: 0 });
      restartCaptionAnimation();
      captionTimeoutRef.current = null;
    }, CAPTION_SWAP_DELAY);
  }, [activeIndex, captionOpacity, displayedActionKey, restartCaptionAnimation]);

  const captionStyle = useAnimatedStyle(() => ({
    opacity: captionOpacity.value,
  }));

  const captionBaseStyle = useAnimatedStyle(() => ({
    opacity: captionBaseOpacity.value,
  }));

  const captionSweepStyle = useAnimatedStyle(() => {
    const width = Math.max(captionLayout.width, 1);
    const height = Math.max(captionLayout.height, 1);

    return {
      opacity: captionOpacity.value,
      transform: [
        {
          translateX:
            width * 1.3 + (-width * 1.6) * captionShimmerProgress.value,
        },
        {
          translateY:
            height * 1.3 + (-height * 1.6) * captionShimmerProgress.value,
        },
      ],
    };
  });

  const handleCaptionLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setCaptionLayout((current) => {
        if (current.width === width && current.height === height) {
          return current;
        }
        return { width, height };
      });
    }
  }, []);

  const rotate = useCallback((direction: 'left' | 'right') => {
    if (isAnimating) return;

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
          <Animated.Text onLayout={handleCaptionLayout} style={[styles.captionText, captionBaseStyle]}>
            {CTA_DESCRIPTIONS[displayedActionKey]}
          </Animated.Text>
          {captionLayout.width > 0 && captionLayout.height > 0 ? (
            <MaskedView
              pointerEvents="none"
              style={[
                styles.captionMaskView,
                {
                  width: captionLayout.width,
                  height: captionLayout.height,
                },
              ]}
              maskElement={
                <View style={styles.captionMask}>
                  <Text style={styles.captionText}>{CTA_DESCRIPTIONS[displayedActionKey]}</Text>
                </View>
              }
            >
              <Animated.View
                style={[
                  styles.captionSweep,
                  {
                    width: Math.max(captionLayout.width * 2.6, 140),
                    height: Math.max(captionLayout.height * 2.6, 80),
                  },
                  captionSweepStyle,
                ]}
              >
                <LinearGradient
                  colors={[
                    'transparent',
                    'rgba(255,255,255,0.95)',
                    '#FFFFFF',
                    'rgba(255,255,255,0.95)',
                    'transparent',
                  ]}
                  locations={[0.44, 0.49, 0.5, 0.51, 0.56]}
                  start={{ x: 0.12, y: 1 }}
                  end={{ x: 0.88, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>
            </MaskedView>
          ) : null}
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
    marginTop: 20,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 28,
  },
  captionInner: {
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  captionText: {
    maxWidth: 320,
    textAlign: 'center',
    color: 'rgba(210,212,218,0.72)',
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '500',
    letterSpacing: 0.3,
    textShadowColor: 'rgba(180,190,210,0.18)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  captionMaskView: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captionMask: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  captionSweep: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});

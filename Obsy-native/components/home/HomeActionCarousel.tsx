import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnUI,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { AnimatedMicButton } from '@/components/home/AnimatedMicButton';
import { AnimatedJournalButton } from '@/components/home/AnimatedJournalButton';
import { PulsingCameraTrigger } from '@/components/home/PulsingCameraTrigger';
import { QuickMoodButton } from '@/components/home/QuickMoodButton';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { getThemeAccentRgb } from '@/lib/themeAccent';
import {
  HALF,
  useOrbitPhysics,
  type SpinDirection,
} from '@/components/home/orbital/useOrbitPhysics';
import { FluidSliderTrack } from '@/components/home/orbital/FluidSliderTrack';
import { CenterStage } from '@/components/home/orbital/CenterStage';
import { OrbitParticles } from '@/components/home/orbital/OrbitParticles';

type ActionKey = 'voice' | 'capture' | 'journal' | 'quick-mood';

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

// ─── Geometry ────────────────────────────────────────────────────────
// Buttons orbit an ellipse around an empty center that hosts the contextual
// CenterStage animation. Radii are sized so no button ever touches the
// center stage — front button inner edge clears it by ~12px, sides by ~16px.

const BUTTON_BASE_SIZE = 120;
const BUTTON_RING_PADDING = 8;
const SLOT_SIZE = BUTTON_BASE_SIZE + BUTTON_RING_PADDING;
const MIN_SCALE = 0.26; // scale at the very back (depth 0); front is 1
const STAGE_WIDTH = 360;
const STAGE_HEIGHT = 368;
const CX = STAGE_WIDTH / 2;
const CY = 163;
const RX = 124;
const RY = 138;
const CENTER_STAGE_SIZE = 120;
const RING_GUIDE_SIZE = 160;

const CAPTION_SWAP_OUT_DURATION = 170;
const CAPTION_SWAP_DELAY = 180;
const CAPTION_SWAP_IN_DURATION = 230;

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

// Turbo easter-egg caption one-liners (cycled while the orbit self-spins).
const WITTY_PHRASES = [
  'having fun are we?',
  'okay speed demon.',
  'someone is bored.',
  'round and round we go.',
  'dizzy yet?',
  'the dial appreciates the workout.',
  'not letting go, huh?',
  'we see you.',
];

const INITIAL_INDEX = 1;

// ─── Orbit button ────────────────────────────────────────────────────

interface OrbitButtonProps {
  index: number;
  action: ActionConfig;
  isActive: boolean;
  isBack: boolean;
  thetaDisplay: SharedValue<number>;
  pop: SharedValue<number>;
  onSelect: () => void;
}

function OrbitButton({
  index,
  action,
  isActive,
  isBack,
  thetaDisplay,
  pop,
  onSelect,
}: OrbitButtonProps) {
  const orbitStyle = useAnimatedStyle(() => {
    const a = thetaDisplay.value + index * HALF;
    const depth = (Math.sin(a) + 1) / 2;
    const scale = (MIN_SCALE + (1 - MIN_SCALE) * depth) * pop.value;
    const z = 1 + Math.round(depth * 40);
    return {
      opacity: 0.38 + 0.62 * depth,
      zIndex: z,
      elevation: z,
      transform: [
        { translateX: RX * Math.cos(a) },
        { translateY: RY * Math.sin(a) },
        { scale },
      ],
    };
  });

  const content = action.render({
    size: BUTTON_BASE_SIZE,
    disabled: !isActive,
    dim: isBack,
    isFront: isActive,
  });

  return (
    <Animated.View style={[styles.orbitItem, orbitStyle]} pointerEvents="box-none">
      {isActive ? (
        <View style={styles.slot}>{content}</View>
      ) : (
        <Pressable style={styles.slot} onPress={onSelect} hitSlop={12}>
          <View pointerEvents="none">{content}</View>
        </Pressable>
      )}
    </Animated.View>
  );
}

// ─── Carousel ────────────────────────────────────────────────────────

export function HomeActionCarousel() {
  const [activeIndex, setActiveIndex] = useState(INITIAL_INDEX);
  const [captionText, setCaptionText] = useState(CTA_DESCRIPTIONS[ACTIONS[INITIAL_INDEX].key]);
  const activeIndexRef = useRef(INITIAL_INDEX);
  const turboRef = useRef(false);
  const pendingCaptionRef = useRef(CTA_DESCRIPTIONS[ACTIONS[INITIAL_INDEX].key]);
  const captionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const capOpacity = useSharedValue(1);
  const capLift = useSharedValue(0);
  const capScale = useSharedValue(1);

  const { auroraBackground, orbWave } = useObsyTheme();
  const accentRgb = getThemeAccentRgb(auroraBackground, orbWave);

  // Per-button settle "pop" scales (fixed 4-button orbit).
  const pop0 = useSharedValue(1);
  const pop1 = useSharedValue(1);
  const pop2 = useSharedValue(1);
  const pop3 = useSharedValue(1);
  const popScales = [pop0, pop1, pop2, pop3];

  useEffect(() => {
    return () => {
      if (captionTimeoutRef.current) {
        clearTimeout(captionTimeoutRef.current);
      }
    };
  }, []);

  const swapCaption = useCallback(
    (text: string) => {
      if (text === pendingCaptionRef.current) return;
      pendingCaptionRef.current = text;

      if (captionTimeoutRef.current) {
        clearTimeout(captionTimeoutRef.current);
      }

      // Fade out + lift away, swap at the trough, settle back in.
      capOpacity.value = withTiming(0, {
        duration: CAPTION_SWAP_OUT_DURATION,
        easing: Easing.out(Easing.quad),
      });
      capLift.value = withTiming(-6, {
        duration: CAPTION_SWAP_OUT_DURATION,
        easing: Easing.out(Easing.quad),
      });

      captionTimeoutRef.current = setTimeout(() => {
        setCaptionText(text);
        capLift.value = 6;
        capScale.value = 0.96;
        capOpacity.value = withTiming(1, {
          duration: CAPTION_SWAP_IN_DURATION,
          easing: Easing.out(Easing.cubic),
        });
        capLift.value = withTiming(0, {
          duration: CAPTION_SWAP_IN_DURATION,
          easing: Easing.out(Easing.cubic),
        });
        capScale.value = withTiming(1, {
          duration: CAPTION_SWAP_IN_DURATION,
          easing: Easing.out(Easing.cubic),
        });
        captionTimeoutRef.current = null;
      }, CAPTION_SWAP_DELAY);
    },
    [capLift, capOpacity, capScale]
  );

  const handleIndexChange = useCallback(
    (index: number, _direction: SpinDirection) => {
      // Aurora coupling is continuous now: the physics loop streams theta and
      // velocity straight into the background shader via `auroraFlow`.
      activeIndexRef.current = index;
      setActiveIndex(index);
      if (!turboRef.current) {
        swapCaption(CTA_DESCRIPTIONS[ACTIONS[index].key]);
      }
    },
    [swapCaption]
  );

  const handleSettle = useCallback(
    (index: number) => {
      // Micro-bounce "pop" on the newly-front button.
      popScales[index].value = withSequence(
        withTiming(1.16, { duration: 120, easing: Easing.bezier(0.34, 1.8, 0.64, 1) }),
        withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) })
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pop0, pop1, pop2, pop3]
  );

  const handleTurboStart = useCallback(() => {
    turboRef.current = true;
  }, []);

  const handleTurboPhrase = useCallback(
    (phraseIndex: number) => {
      swapCaption(WITTY_PHRASES[phraseIndex % WITTY_PHRASES.length]);
    },
    [swapCaption]
  );

  const handleTurboEnd = useCallback(() => {
    turboRef.current = false;
    // Force a refresh — the front button may be the same one turbo started on.
    swapCaption(CTA_DESCRIPTIONS[ACTIONS[activeIndexRef.current].key]);
  }, [swapCaption]);

  const physics = useOrbitPhysics(INITIAL_INDEX, {
    onIndexChange: handleIndexChange,
    onSettle: handleSettle,
    onTurboStart: handleTurboStart,
    onTurboPhrase: handleTurboPhrase,
    onTurboEnd: handleTurboEnd,
  });

  const { beginDrag, dragBy, endDrag, spinTo } = physics;

  // Slider drives the orbit 1:1; grabbing it (even without moving) interrupts
  // any fling/turbo, like catching a spinning dial.
  const sliderPan = Gesture.Pan()
    .minDistance(1)
    .maxPointers(1)
    .onBegin(() => {
      beginDrag();
    })
    .onChange((e) => {
      dragBy(e.changeX);
    })
    .onFinalize((e) => {
      endDrag(e.velocityX);
    });

  // Swiping across the orbit itself also spins it (pre-slider behavior kept),
  // feeding the exact same physics. Activation offsets leave taps for buttons.
  const stagePan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-16, 16])
    .onStart(() => {
      beginDrag();
    })
    .onChange((e) => {
      dragBy(e.changeX);
    })
    .onEnd((e) => {
      endDrag(e.velocityX);
    });

  const selectIndex = useCallback(
    (index: number) => {
      runOnUI(spinTo)(index);
    },
    [spinTo]
  );

  const captionStyle = useAnimatedStyle(() => ({
    opacity: capOpacity.value,
    transform: [{ translateY: capLift.value }, { scale: capScale.value }],
  }));

  const backIndex = (activeIndex + 2) % ACTIONS.length;

  return (
    <GestureHandlerRootView style={styles.carouselShell}>
      <GestureDetector gesture={stagePan}>
        <View style={styles.stage} collapsable={false}>
          <View style={styles.ringGuide} pointerEvents="none" />
          <OrbitParticles
            theta={physics.theta}
            phase={physics.phase}
            settlePulse={physics.settlePulse}
            accentRgb={accentRgb}
            width={STAGE_WIDTH}
            height={STAGE_HEIGHT}
            cx={CX}
            cy={CY}
            rx={RX}
            ry={RY}
          />
          <CenterStage
            activeKey={ACTIONS[activeIndex].key}
            accentRgb={accentRgb}
            size={CENTER_STAGE_SIZE}
            style={styles.centerStage}
          />
          {ACTIONS.map((action, index) => (
            <OrbitButton
              key={action.key}
              index={index}
              action={action}
              isActive={index === activeIndex}
              isBack={index === backIndex}
              thetaDisplay={physics.thetaDisplay}
              pop={popScales[index]}
              onSelect={() => selectIndex(index)}
            />
          ))}
        </View>
      </GestureDetector>

      <View style={styles.captionWrap}>
        <Animated.View style={[styles.captionInner, captionStyle]}>
          <Text style={styles.captionText}>{captionText}</Text>
        </Animated.View>
      </View>

      <View style={styles.sliderWrap}>
        <FluidSliderTrack gesture={sliderPan} theta={physics.theta} vel={physics.vel} />
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  carouselShell: {
    width: STAGE_WIDTH,
    alignItems: 'center',
  },
  stage: {
    width: STAGE_WIDTH,
    height: STAGE_HEIGHT,
  },
  ringGuide: {
    position: 'absolute',
    left: CX - RING_GUIDE_SIZE / 2,
    top: CY - RING_GUIDE_SIZE / 2,
    width: RING_GUIDE_SIZE,
    height: RING_GUIDE_SIZE,
    borderRadius: RING_GUIDE_SIZE / 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  centerStage: {
    position: 'absolute',
    left: CX - CENTER_STAGE_SIZE / 2,
    top: CY - CENTER_STAGE_SIZE / 2,
  },
  orbitItem: {
    position: 'absolute',
    left: CX - SLOT_SIZE / 2,
    top: CY - SLOT_SIZE / 2,
    width: SLOT_SIZE,
    height: SLOT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slot: {
    width: SLOT_SIZE,
    height: SLOT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captionWrap: {
    width: STAGE_WIDTH,
    minHeight: 32,
    marginTop: 10,
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
  sliderWrap: {
    marginTop: 18,
    alignItems: 'center',
  },
});

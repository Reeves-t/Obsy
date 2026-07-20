import React from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector, type PanGesture } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { nearestDetent, normAngle } from './useOrbitPhysics';

// The fluid slider that drives the orbit. The thumb's position represents how
// far into the current 90° segment the orbit has rotated (it re-centers every
// detent), and it squashes/stretches like a liquid blob with rotation speed.
// Deliberately quiet visually — hairline track, small solid thumb — so the
// squash-stretch physics is the delight, not glow.

export const TRACK_WIDTH = 262;
export const TRACK_HEIGHT = 36;
const THUMB_SIZE = 24;
const THUMB_PADDING = 6;

interface FluidSliderTrackProps {
  gesture: PanGesture;
  theta: SharedValue<number>;
  vel: SharedValue<number>;
}

export function FluidSliderTrack({ gesture, theta, vel }: FluidSliderTrackProps) {
  const thumbStyle = useAnimatedStyle(() => {
    const off = normAngle(theta.value - nearestDetent(theta.value));
    const p = Math.max(0, Math.min(1, 0.5 - (off * 2) / Math.PI));
    const scaleX = 1 + Math.min(1.1, Math.abs(vel.value) * 0.16);
    const scaleY = 1 / Math.sqrt(scaleX);
    return {
      transform: [
        { translateX: THUMB_PADDING + p * (TRACK_WIDTH - THUMB_SIZE - THUMB_PADDING * 2) },
        { scaleX },
        { scaleY },
      ],
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.track} collapsable={false}>
        <Animated.View pointerEvents="none" style={[styles.thumb, thumbStyle]} />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center',
  },
  thumb: {
    position: 'absolute',
    left: 0,
    top: (TRACK_HEIGHT - THUMB_SIZE) / 2,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: 'rgba(242,245,250,0.92)',
  },
});

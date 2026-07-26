import React from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSequence,
    withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { HabitGoalOrb } from './HabitGoalOrb';
import type { HabitOrbPhysics } from './useHabitOrbPhysicsV2';
import type { HabitGoal } from '@/lib/habitGoalStore';

// One draggable orb inside the floating box.
//
// Gesture model (the scroll fix): a quick tap opens the confirm sheet; a
// ~160ms hold "picks the orb up" (haptic + inflate) and only then does the
// pan own the touch — so fast vertical swipes over the box still scroll the
// page. All drag positions flow straight into the physics worklets; nothing
// crosses to JS mid-drag except haptics.

const HOLD_TO_GRAB_MS = 160;
const FLICK_HAPTIC_MIN = 150; // px/s

interface FloatingOrbProps {
    item: HabitGoal;
    slot: number;
    size: number;
    physics: HabitOrbPhysics;
    onTap: (id: string) => void;
}

function hapticLight() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export const FloatingOrb = React.memo(function FloatingOrb({ item, slot, size, physics, onTap }: FloatingOrbProps) {
    const s = physics.slots[slot];
    const startX = useSharedValue(0);
    const startY = useSharedValue(0);

    const tap = Gesture.Tap()
        .maxDuration(HOLD_TO_GRAB_MS + 20)
        .maxDistance(8)
        .onEnd((_e, success) => {
            if (success) runOnJS(onTap)(item.id);
        });

    const pan = Gesture.Pan()
        .activateAfterLongPress(HOLD_TO_GRAB_MS)
        .maxPointers(1)
        .shouldCancelWhenOutside(false)
        .onStart(() => {
            startX.value = s.x.value;
            startY.value = s.y.value;
            physics.beginGrab(slot);
            s.grabScale.value = withSpring(1.08, { damping: 14, stiffness: 260 });
            runOnJS(hapticLight)();
        })
        .onUpdate((e) => {
            physics.dragTo(slot, startX.value + e.translationX, startY.value + e.translationY);
        })
        .onEnd((e) => {
            physics.endGrab(slot, e.velocityX, e.velocityY);
            // Release jelly: quick dip, springy overshoot back to rest.
            s.grabScale.value = withSequence(
                withSpring(0.94, { damping: 20, stiffness: 400 }),
                withSpring(1, { damping: 7, stiffness: 220 })
            );
            if (Math.hypot(e.velocityX, e.velocityY) > FLICK_HAPTIC_MIN) runOnJS(hapticLight)();
        })
        .onFinalize((_e, success) => {
            if (!success) {
                // Cancelled (scroll or system stole the touch) — drop the orb in place.
                physics.cancelGrab(slot);
                s.grabScale.value = withSpring(1, { damping: 14, stiffness: 260 });
            }
        });

    const gesture = Gesture.Exclusive(pan, tap);

    const animatedStyle = useAnimatedStyle(() => {
        const grab = s.grabScale.value;
        const k = s.stretch.value;
        const theta = s.stretchAngle.value;
        return {
            zIndex: physics.dragSlot.value === slot ? 10 : 2,
            transform: [
                { translateX: s.x.value - size / 2 },
                { translateY: s.y.value - size / 2 },
                // Stretch along the direction of travel (rotate → scale →
                // unrotate); wall squash rides on the same axes.
                { rotate: `${theta}rad` },
                { scaleX: grab * (1 + k) * s.squashX.value },
                { scaleY: grab * (1 - k) * s.squashY.value },
                { rotate: `${-theta}rad` },
            ],
        };
    });

    return (
        <GestureDetector gesture={gesture}>
            <Animated.View
                collapsable={false}
                style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size }, animatedStyle]}
            >
                <HabitGoalOrb
                    size={size}
                    title={item.title}
                    type={item.type}
                    completed={item.isCompletedForCurrentPeriod}
                />
            </Animated.View>
        </GestureDetector>
    );
});

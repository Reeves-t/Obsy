import React, { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';

interface CameraOrbitDialProps {
    /** Camera orbit angles (radians) */
    orbitAnglesRef: React.MutableRefObject<{ theta: number; phi: number }>;
    /** Optional callback when orbit changes */
    onOrbitChange?: () => void;
    /** Bottom inset for safe area */
    bottomInset?: number;
}

const DIAL_SIZE = 80;
const INDICATOR_SIZE = 12;
const DRAG_SENSITIVITY = 0.006; // radians per pixel
const PHI_MIN = -Math.PI / 3; // -60 degrees (looking up from below)
const PHI_MAX = Math.PI / 2.2; // ~80 degrees (nearly top-down)
const SPRING_CONFIG = { damping: 18, stiffness: 120 };

/**
 * Camera orbit dial — bottom-left joystick for rotating camera around galaxy origin.
 *
 * - Drag left/right: rotate camera on Y axis (theta)
 * - Drag up/down: tilt camera on X axis (phi)
 * - Tap center: reset to default top-down view
 */
export function CameraOrbitDial({ orbitAnglesRef, onOrbitChange, bottomInset = 0 }: CameraOrbitDialProps) {
    const indicatorX = useSharedValue(0);
    const indicatorY = useSharedValue(0);
    const startAngles = useRef({ theta: 0, phi: 0 });

    const panGesture = Gesture.Pan()
        .onBegin(() => {
            startAngles.current = { ...orbitAnglesRef.current };
        })
        .onUpdate((e) => {
            // Horizontal drag → theta (Y-axis rotation)
            const deltaTheta = e.translationX * DRAG_SENSITIVITY;
            orbitAnglesRef.current.theta = startAngles.current.theta + deltaTheta;

            // Vertical drag → phi (X-axis tilt) — invert Y for intuitive control
            const deltaPhi = -e.translationY * DRAG_SENSITIVITY;
            const newPhi = startAngles.current.phi + deltaPhi;
            orbitAnglesRef.current.phi = Math.max(PHI_MIN, Math.min(PHI_MAX, newPhi));

            // Update indicator position (normalized to dial radius)
            const maxRadius = (DIAL_SIZE - INDICATOR_SIZE) / 2;
            indicatorX.value = Math.max(-maxRadius, Math.min(maxRadius, e.translationX * 0.3));
            indicatorY.value = Math.max(-maxRadius, Math.min(maxRadius, e.translationY * 0.3));

            onOrbitChange?.();
        })
        .onEnd(() => {
            // Reset indicator to center with spring animation
            indicatorX.value = withSpring(0, SPRING_CONFIG);
            indicatorY.value = withSpring(0, SPRING_CONFIG);
        })
        .runOnJS(true);

    const tapGesture = Gesture.Tap()
        .onEnd(() => {
            // Reset to default top-down view
            orbitAnglesRef.current.theta = 0;
            orbitAnglesRef.current.phi = Math.PI / 2; // Top-down (90 degrees)
            indicatorX.value = withSpring(0, SPRING_CONFIG);
            indicatorY.value = withSpring(0, SPRING_CONFIG);
            onOrbitChange?.();
        })
        .runOnJS(true);

    const composedGesture = Gesture.Race(panGesture, tapGesture);

    const indicatorStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: indicatorX.value },
            { translateY: indicatorY.value },
        ],
    }));

    return (
        <View style={[styles.container, { bottom: 24 + bottomInset }]} pointerEvents="box-none">
            <GestureDetector gesture={composedGesture}>
                <View style={styles.dial}>
                    {/* Dial background */}
                    <View style={styles.dialBg} />

                    {/* Center reset dot */}
                    <View style={styles.centerDot} />

                    {/* Directional indicator */}
                    <Animated.View style={[styles.indicator, indicatorStyle]} />
                </View>
            </GestureDetector>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        left: 16,
        zIndex: 15,
    },
    dial: {
        width: DIAL_SIZE,
        height: DIAL_SIZE,
        justifyContent: 'center',
        alignItems: 'center',
    },
    dialBg: {
        position: 'absolute',
        width: DIAL_SIZE,
        height: DIAL_SIZE,
        borderRadius: DIAL_SIZE / 2,
        backgroundColor: 'rgba(12, 12, 20, 0.6)',
        borderWidth: 1,
        borderColor: 'rgba(124, 58, 237, 0.25)',
    },
    centerDot: {
        position: 'absolute',
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: 'rgba(228, 228, 237, 0.15)',
    },
    indicator: {
        width: INDICATOR_SIZE,
        height: INDICATOR_SIZE,
        borderRadius: INDICATOR_SIZE / 2,
        backgroundColor: 'rgba(168, 85, 247, 0.8)',
        shadowColor: '#a855f7',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 4,
    },
});

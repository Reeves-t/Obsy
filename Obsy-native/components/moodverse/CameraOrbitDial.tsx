import React, { useRef, useEffect } from 'react';
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
const MAX_VELOCITY = 0.04; // Maximum radians per frame at dial edge
const SPRING_CONFIG = { damping: 18, stiffness: 120 };

/**
 * Camera orbit dial — velocity-based joystick for rotating camera around galaxy origin.
 *
 * - Hold finger offset from center: continuous rotation at velocity proportional to distance
 * - Further from center = faster rotation speed
 * - Full 360° rotation with no limits — can flip over top/bottom to view from any angle
 * - Tap center: reset to default top-down view
 */
export function CameraOrbitDial({ orbitAnglesRef, onOrbitChange, bottomInset = 0 }: CameraOrbitDialProps) {
    const indicatorX = useSharedValue(0);
    const indicatorY = useSharedValue(0);
    const velocityRef = useRef({ x: 0, y: 0 });
    const isActiveRef = useRef(false);
    const rafIdRef = useRef<number>(0);

    // Continuous rotation loop — runs while finger is held
    useEffect(() => {
        const animate = () => {
            if (!isActiveRef.current) return;

            // Apply velocity to camera angles
            orbitAnglesRef.current.theta += velocityRef.current.x;
            orbitAnglesRef.current.phi += velocityRef.current.y;
            // No clamping — allow full 360° rotation in all directions

            onOrbitChange?.();
            rafIdRef.current = requestAnimationFrame(animate);
        };

        return () => {
            if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
        };
    }, [orbitAnglesRef, onOrbitChange]);

    const panGesture = Gesture.Pan()
        .onBegin(() => {
            isActiveRef.current = true;
            // Start continuous rotation loop
            rafIdRef.current = requestAnimationFrame(function animate() {
                if (!isActiveRef.current) return;
                orbitAnglesRef.current.theta += velocityRef.current.x;
                orbitAnglesRef.current.phi += velocityRef.current.y;
                onOrbitChange?.();
                rafIdRef.current = requestAnimationFrame(animate);
            });
        })
        .onUpdate((e) => {
            // Calculate velocity from finger offset (distance from dial center)
            const maxRadius = DIAL_SIZE / 2;
            const offsetX = e.translationX;
            const offsetY = -e.translationY; // Invert Y for intuitive control

            // Normalize to 0-1 range and apply to max velocity
            const normalizedX = Math.max(-1, Math.min(1, offsetX / maxRadius));
            const normalizedY = Math.max(-1, Math.min(1, offsetY / maxRadius));

            velocityRef.current.x = normalizedX * MAX_VELOCITY;
            velocityRef.current.y = normalizedY * MAX_VELOCITY;

            // Update indicator position (clamped to dial boundary)
            const indicatorRadius = (DIAL_SIZE - INDICATOR_SIZE) / 2;
            indicatorX.value = Math.max(-indicatorRadius, Math.min(indicatorRadius, offsetX));
            indicatorY.value = Math.max(-indicatorRadius, Math.min(indicatorRadius, -offsetY));
        })
        .onEnd(() => {
            // Stop rotation immediately
            isActiveRef.current = false;
            velocityRef.current = { x: 0, y: 0 };
            if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);

            // Reset indicator to center with spring animation
            indicatorX.value = withSpring(0, SPRING_CONFIG);
            indicatorY.value = withSpring(0, SPRING_CONFIG);
        })
        .runOnJS(true);

    const tapGesture = Gesture.Tap()
        .onEnd(() => {
            // Stop any active rotation
            isActiveRef.current = false;
            velocityRef.current = { x: 0, y: 0 };
            if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);

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

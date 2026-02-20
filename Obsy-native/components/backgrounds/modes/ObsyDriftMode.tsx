import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Dimensions } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    Easing,
    withSequence,
    withDelay,
    cancelAnimation
} from 'react-native-reanimated';
import { Image } from 'expo-image';

const { width, height } = Dimensions.get('window');

// ── Constants ────────────────────────────────────────────────────────
const BUBBLE_SIZE = 80;
const SMALL_SCALE = 0.45;           // Background bubbles
const FEATURED_SCALE = 1.0;         // Featured bubble
const SMALL_OPACITY = 0.25;         // Background bubbles
const FEATURED_OPACITY = 0.85;      // Featured bubble
const FEATURE_DURATION = 7000;      // How long each bubble stays featured (ms)
const TRANSITION_DURATION = 800;    // Scale/opacity transition speed (ms)

interface ObsyDriftModeProps {
    captures: any[];
}

// ── Single Bubble ────────────────────────────────────────────────────
const FloatingBubble = ({
    uri,
    index,
    isFeatured,
}: {
    uri: string;
    index: number;
    isFeatured: boolean;
}) => {
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const rotate = useSharedValue(0);
    const featureScale = useSharedValue(SMALL_SCALE);
    const featureOpacity = useSharedValue(0);

    const randomPath = useMemo(() => {
        const moveDuration = 40000 + Math.random() * 20000;
        const stepDuration = moveDuration / 4;
        const startDelay = Math.random() * 2000 + (index * 500);

        const waypoints = Array.from({ length: 4 }, () => ({
            x: (Math.random() - 0.5) * width * 0.8,
            y: (Math.random() - 0.5) * height * 0.8,
        }));

        const rotationDegrees = Math.random() > 0.5 ? 360 : -360;

        return { waypoints, moveDuration, stepDuration, startDelay, rotationDegrees };
    }, [index]);

    // Drift + rotation (always running)
    useEffect(() => {
        const { waypoints, moveDuration, stepDuration, startDelay, rotationDegrees } = randomPath;

        translateX.value = withDelay(
            startDelay,
            withRepeat(
                withSequence(...waypoints.map(wp =>
                    withTiming(wp.x, { duration: stepDuration, easing: Easing.inOut(Easing.ease) })
                )),
                -1,
                true
            )
        );
        translateY.value = withDelay(
            startDelay,
            withRepeat(
                withSequence(...waypoints.map(wp =>
                    withTiming(wp.y, { duration: stepDuration, easing: Easing.inOut(Easing.ease) })
                )),
                -1,
                true
            )
        );

        // Entrance fade
        featureOpacity.value = withDelay(
            startDelay,
            withTiming(SMALL_OPACITY, { duration: 2000, easing: Easing.out(Easing.quad) })
        );

        rotate.value = withRepeat(
            withTiming(rotationDegrees, { duration: moveDuration * 1.5, easing: Easing.linear }),
            -1,
            false
        );

        return () => {
            cancelAnimation(translateX);
            cancelAnimation(translateY);
            cancelAnimation(rotate);
        };
    }, [randomPath]);

    // Featured state transition
    useEffect(() => {
        featureScale.value = withTiming(
            isFeatured ? FEATURED_SCALE : SMALL_SCALE,
            { duration: TRANSITION_DURATION, easing: Easing.inOut(Easing.ease) }
        );
        featureOpacity.value = withTiming(
            isFeatured ? FEATURED_OPACITY : SMALL_OPACITY,
            { duration: TRANSITION_DURATION, easing: Easing.inOut(Easing.ease) }
        );
    }, [isFeatured]);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: featureOpacity.value,
        transform: [
            { translateX: translateX.value },
            { translateY: translateY.value },
            { scale: featureScale.value },
            { rotate: `${rotate.value}deg` }
        ],
        zIndex: isFeatured ? 100 : 1,
    }));

    return (
        <Animated.View style={[styles.bubble, animatedStyle]}>
            <Image
                source={{ uri }}
                style={styles.image}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={1000}
            />
        </Animated.View>
    );
};

// ── Mode Component ───────────────────────────────────────────────────
export const ObsyDriftMode = ({ captures }: ObsyDriftModeProps) => {
    const [featuredIndex, setFeaturedIndex] = useState(0);

    // Rotate featured bubble on a timer
    useEffect(() => {
        if (captures.length <= 1) return;

        const interval = setInterval(() => {
            setFeaturedIndex(prev => (prev + 1) % captures.length);
        }, FEATURE_DURATION);

        return () => clearInterval(interval);
    }, [captures.length]);

    return (
        <>
            {captures.map((capture, index) => (
                <FloatingBubble
                    key={capture.id}
                    uri={capture.image_url}
                    index={index}
                    isFeatured={index === featuredIndex}
                />
            ))}
        </>
    );
};

const styles = StyleSheet.create({
    bubble: {
        position: 'absolute',
        width: BUBBLE_SIZE,
        height: BUBBLE_SIZE,
        left: width / 2 - BUBBLE_SIZE / 2,
        top: height / 2 - BUBBLE_SIZE / 2,
        borderRadius: BUBBLE_SIZE / 2,
        overflow: 'hidden',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    image: {
        width: '100%',
        height: '100%',
    }
});

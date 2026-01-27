import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Dimensions } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    Easing,
    withSequence,
    withDelay,
    interpolate,
    cancelAnimation
} from 'react-native-reanimated';
import { Image } from 'expo-image';

const { width, height } = Dimensions.get('window');

interface StaticDriftModeProps {
    captures: any[];
}

const FloatingBubble = ({ uri, index }: { uri: string; index: number }) => {
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const opacityValue = useSharedValue(0);
    const rotate = useSharedValue(0);

    const randomPath = useMemo(() => {
        const moveDuration = 50000 + Math.random() * 20000; // Slower than Obsy Drift
        const stepDuration = moveDuration / 4;
        const entranceDuration = 4000;
        const startDelay = index * 800;

        const waypoints = Array.from({ length: 4 }, () => ({
            x: (Math.random() - 0.5) * width * 0.7,
            y: (Math.random() - 0.5) * height * 0.7,
        }));

        const rotationDegrees = Math.random() > 0.5 ? 45 : -45; // Subtle rotation

        return { waypoints, moveDuration, stepDuration, entranceDuration, startDelay, rotationDegrees };
    }, [index]);

    useEffect(() => {
        const { waypoints, stepDuration, entranceDuration, startDelay, rotationDegrees, moveDuration } = randomPath;

        translateX.value = withRepeat(
            withSequence(...waypoints.map(wp => withTiming(wp.x, { duration: stepDuration, easing: Easing.linear }))),
            -1,
            true
        );
        translateY.value = withRepeat(
            withSequence(...waypoints.map(wp => withTiming(wp.y, { duration: stepDuration, easing: Easing.linear }))),
            -1,
            true
        );

        opacityValue.value = withDelay(
            startDelay,
            withTiming(0.7, { duration: entranceDuration })
        );

        rotate.value = withRepeat(
            withTiming(rotationDegrees, { duration: moveDuration * 2, easing: Easing.inOut(Easing.ease) }),
            -1,
            true
        );

        return () => {
            cancelAnimation(translateX);
            cancelAnimation(translateY);
            cancelAnimation(opacityValue);
            cancelAnimation(rotate);
        };
    }, [randomPath]);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            opacity: opacityValue.value,
            transform: [
                { translateX: translateX.value },
                { translateY: translateY.value },
                { rotate: `${rotate.value}deg` }
            ],
            // Static size, no scale
        };
    });

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

export const StaticDriftMode = ({ captures }: StaticDriftModeProps) => {
    return (
        <>
            {captures.map((capture, index) => (
                <FloatingBubble
                    key={capture.id}
                    uri={capture.image_url}
                    index={index}
                />
            ))}
        </>
    );
};

const styles = StyleSheet.create({
    bubble: {
        position: 'absolute',
        width: 70, // Slightly smaller than default
        height: 70,
        left: width / 2 - 35,
        top: height / 2 - 35,
        borderRadius: 35,
        overflow: 'hidden',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
        elevation: 3,
    },
    image: {
        width: '100%',
        height: '100%',
    }
});

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

interface ObsyDriftModeProps {
    captures: any[];
}

const FloatingBubble = ({ uri, index }: { uri: string; index: number }) => {
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const depth = useSharedValue(0);
    const rotate = useSharedValue(0);

    const randomPath = useMemo(() => {
        const moveDuration = 40000 + Math.random() * 20000;
        const stepDuration = moveDuration / 4;
        const breatheDuration = 3000 + Math.random() * 4000;
        const entranceDuration = 6000 + Math.random() * 3000;
        const startDelay = Math.random() * 2000 + (index * 500);

        const waypoints = Array.from({ length: 4 }, () => ({
            x: (Math.random() - 0.5) * width * 0.8,
            y: (Math.random() - 0.5) * height * 0.8,
        }));

        const rotationDegrees = Math.random() > 0.5 ? 360 : -360;

        return { waypoints, moveDuration, stepDuration, breatheDuration, entranceDuration, startDelay, rotationDegrees };
    }, [index]);

    useEffect(() => {
        const { waypoints, moveDuration, stepDuration, breatheDuration, entranceDuration, startDelay, rotationDegrees } = randomPath;

        translateX.value = withRepeat(
            withSequence(...waypoints.map(wp => withTiming(wp.x, { duration: stepDuration, easing: Easing.inOut(Easing.ease) }))),
            -1,
            true
        );
        translateY.value = withRepeat(
            withSequence(...waypoints.map(wp => withTiming(wp.y, { duration: stepDuration, easing: Easing.inOut(Easing.ease) }))),
            -1,
            true
        );

        depth.value = withDelay(
            startDelay,
            withSequence(
                withTiming(1, { duration: entranceDuration, easing: Easing.out(Easing.quad) }),
                withRepeat(
                    withSequence(
                        withTiming(0.15, { duration: breatheDuration, easing: Easing.inOut(Easing.ease) }),
                        withTiming(1, { duration: breatheDuration, easing: Easing.inOut(Easing.ease) })
                    ),
                    -1,
                    true
                )
            )
        );

        rotate.value = withRepeat(
            withTiming(rotationDegrees, { duration: moveDuration * 1.5, easing: Easing.linear }),
            -1,
            false
        );

        return () => {
            cancelAnimation(translateX);
            cancelAnimation(translateY);
            cancelAnimation(depth);
            cancelAnimation(rotate);
        };
    }, [randomPath]);

    const animatedStyle = useAnimatedStyle(() => {
        const scale = interpolate(depth.value, [0, 0.15, 1], [0.0, 0.15, 1]);
        const opacity = interpolate(depth.value, [0, 0.15, 1], [0, 0.2, 0.85]);

        return {
            opacity,
            transform: [
                { translateX: translateX.value },
                { translateY: translateY.value },
                { scale },
                { rotate: `${rotate.value}deg` }
            ],
            zIndex: Math.round(depth.value * 100),
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

export const ObsyDriftMode = ({ captures }: ObsyDriftModeProps) => {
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
        width: 80,
        height: 80,
        left: width / 2 - 40,
        top: height / 2 - 40,
        borderRadius: 40,
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

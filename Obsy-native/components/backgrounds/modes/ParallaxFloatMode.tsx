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

interface ParallaxFloatModeProps {
    captures: any[];
}

const FloatingBubble = ({ uri, index }: { uri: string; index: number }) => {
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const opacityValue = useSharedValue(0);

    const parallaxConfig = useMemo(() => {
        // 3 layers of depth
        const layer = (index % 3) + 1;
        const size = 50 + layer * 15; // 65, 80, 95
        const speedMultiplier = 1 / (layer * 0.8); // Higher layer (background) is slower

        const moveDuration = (30000 + Math.random() * 20000) * speedMultiplier;
        const stepDuration = moveDuration / 4;
        const entranceDuration = 3000;
        const startDelay = index * 500;

        const waypoints = Array.from({ length: 4 }, () => ({
            x: (Math.random() - 0.5) * width * 0.9,
            y: (Math.random() - 0.5) * height * 0.9,
        }));

        return { waypoints, moveDuration, stepDuration, entranceDuration, startDelay, layer, size };
    }, [index]);

    useEffect(() => {
        const { waypoints, stepDuration, entranceDuration, startDelay } = parallaxConfig;

        translateX.value = withRepeat(
            withSequence(...waypoints.map(wp => withTiming(wp.x, { duration: stepDuration, easing: Easing.inOut(Easing.quad) }))),
            -1,
            true
        );
        translateY.value = withRepeat(
            withSequence(...waypoints.map(wp => withTiming(wp.y, { duration: stepDuration, easing: Easing.inOut(Easing.quad) }))),
            -1,
            true
        );

        opacityValue.value = withDelay(
            startDelay,
            withTiming(0.4 + (parallaxConfig.layer * 0.15), { duration: entranceDuration })
        );

        return () => {
            cancelAnimation(translateX);
            cancelAnimation(translateY);
            cancelAnimation(opacityValue);
        };
    }, [parallaxConfig]);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            opacity: opacityValue.value,
            transform: [
                { translateX: translateX.value },
                { translateY: translateY.value },
            ],
            zIndex: parallaxConfig.layer * 10,
        };
    });

    return (
        <Animated.View style={[
            styles.bubble,
            { width: parallaxConfig.size, height: parallaxConfig.size, borderRadius: parallaxConfig.size / 2, left: width / 2 - parallaxConfig.size / 2, top: height / 2 - parallaxConfig.size / 2 },
            animatedStyle
        ]}>
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

export const ParallaxFloatMode = ({ captures }: ParallaxFloatModeProps) => {
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
        overflow: 'hidden',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 4,
    },
    image: {
        width: '100%',
        height: '100%',
    }
});

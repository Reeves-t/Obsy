import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Dimensions } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    Easing,
    withDelay,
    cancelAnimation,
    useDerivedValue,
} from 'react-native-reanimated';
import { Image } from 'expo-image';

const { width, height } = Dimensions.get('window');
const CTA_CENTER_X = 0; // Relative to screen center
const CTA_CENTER_Y = height * 0.35; // Positioned lower on screen, adjust based on actual CTA placement

interface OrbitalFloatModeProps {
    captures: any[];
}

const FloatingBubble = ({ uri, index }: { uri: string; index: number }) => {
    const angle = useSharedValue(0);
    const opacityValue = useSharedValue(0);

    const orbitConfig = useMemo(() => {
        const radiusX = 120 + (index % 3) * 60;
        const radiusY = radiusX * 0.8;
        const duration = 20000 + Math.random() * 30000;
        const startAngle = Math.random() * Math.PI * 2;
        const entranceDuration = 3000;
        const startDelay = index * 400;

        return { radiusX, radiusY, duration, startAngle, entranceDuration, startDelay };
    }, [index]);

    useEffect(() => {
        const { duration, startAngle, entranceDuration, startDelay } = orbitConfig;

        angle.value = startAngle;
        angle.value = withRepeat(
            withTiming(startAngle + Math.PI * 2, { duration, easing: Easing.linear }),
            -1,
            false
        );

        opacityValue.value = withDelay(
            startDelay,
            withTiming(0.65, { duration: entranceDuration })
        );

        return () => {
            cancelAnimation(angle);
            cancelAnimation(opacityValue);
        };
    }, [orbitConfig]);

    const animatedStyle = useAnimatedStyle(() => {
        const x = Math.cos(angle.value) * orbitConfig.radiusX;
        const y = Math.sin(angle.value) * orbitConfig.radiusY + CTA_CENTER_Y;

        return {
            opacity: opacityValue.value,
            transform: [
                { translateX: x },
                { translateY: y },
                // Orbiting images are slightly smaller
                { scale: 0.8 }
            ],
            zIndex: 10,
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

export const OrbitalFloatMode = ({ captures }: OrbitalFloatModeProps) => {
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
        width: 60,
        height: 60,
        left: width / 2 - 30,
        top: height / 2 - 30,
        borderRadius: 30,
        overflow: 'hidden',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.15,
        shadowRadius: 2,
        elevation: 2,
    },
    image: {
        width: '100%',
        height: '100%',
    }
});

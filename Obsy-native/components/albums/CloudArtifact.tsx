import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    Easing,
    withSequence,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useMemo } from 'react';
import { Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

// Cloud size - the SVG is 362x315, we'll scale it down
const CLOUD_WIDTH = 80;
const CLOUD_HEIGHT = 70;

interface CloudArtifactProps {
    /** Author's avatar URL */
    avatarUrl?: string | null;
    /** Index for positioning variation */
    index: number;
    /** Called when cloud is tapped */
    onPress: () => void;
    /** Whether the canvas is in generating state */
    isGenerating?: boolean;
}

/**
 * CloudArtifact - A floating thought cloud representing a shared insight
 * Visual: Custom SVG cloud with author avatar badge
 */
export function CloudArtifact({ avatarUrl, index, onPress, isGenerating }: CloudArtifactProps) {
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const rotate = useSharedValue(0);
    const scale = useSharedValue(1);

    // Generate random floating path
    const randomPath = useMemo(() => {
        const waypoints = Array.from({ length: 4 }, () => ({
            x: (Math.random() - 0.5) * width * 0.6,
            y: (Math.random() - 0.5) * height * 0.4,
        }));
        const duration = 40000 + Math.random() * 20000;
        const rotationDegrees = (Math.random() - 0.5) * 8; // Subtle rotation
        return { waypoints, duration, rotationDegrees };
    }, []);

    useEffect(() => {
        if (isGenerating) {
            // Animate out when generating
            translateY.value = withTiming(height / 2 + 100, { duration: 1000, easing: Easing.in(Easing.ease) });
            scale.value = withTiming(0, { duration: 1000 });
        } else {
            const { waypoints, duration, rotationDegrees } = randomPath;
            const stepDuration = duration / 4;

            scale.value = withTiming(1, { duration: 500 });

            // Continuous floating animation
            translateX.value = withRepeat(
                withSequence(
                    withTiming(waypoints[0].x, { duration: stepDuration, easing: Easing.inOut(Easing.ease) }),
                    withTiming(waypoints[1].x, { duration: stepDuration, easing: Easing.inOut(Easing.ease) }),
                    withTiming(waypoints[2].x, { duration: stepDuration, easing: Easing.inOut(Easing.ease) }),
                    withTiming(waypoints[3].x, { duration: stepDuration, easing: Easing.inOut(Easing.ease) })
                ),
                -1,
                true
            );

            translateY.value = withRepeat(
                withSequence(
                    withTiming(waypoints[0].y, { duration: stepDuration, easing: Easing.inOut(Easing.ease) }),
                    withTiming(waypoints[1].y, { duration: stepDuration, easing: Easing.inOut(Easing.ease) }),
                    withTiming(waypoints[2].y, { duration: stepDuration, easing: Easing.inOut(Easing.ease) }),
                    withTiming(waypoints[3].y, { duration: stepDuration, easing: Easing.inOut(Easing.ease) })
                ),
                -1,
                true
            );

            rotate.value = withRepeat(
                withTiming(rotationDegrees, { duration: duration / 2, easing: Easing.inOut(Easing.ease) }),
                -1,
                true
            );
        }
    }, [randomPath, isGenerating]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: translateX.value },
            { translateY: translateY.value },
            { rotate: `${rotate.value}deg` },
            { scale: scale.value }
        ]
    }));

    return (
        <Animated.View style={[styles.container, animatedStyle]}>
            <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
                <View style={styles.cloudWrapper}>
                    {/* Custom Cloud SVG */}
                    <Image
                        source={require('@/assets/images/albuminsightcloud.svg')}
                        style={styles.cloudImage}
                        contentFit="contain"
                    />
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        left: width / 2 - CLOUD_WIDTH / 2,
        top: height / 2 - CLOUD_HEIGHT / 2,
        zIndex: 15,
    },
    cloudWrapper: {
        width: CLOUD_WIDTH,
        height: CLOUD_HEIGHT,
        justifyContent: 'center',
        alignItems: 'center',
        // Subtle glow effect
        shadowColor: 'rgba(168, 85, 247, 0.6)',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 10,
    },
    cloudImage: {
        width: CLOUD_WIDTH,
        height: CLOUD_HEIGHT,
    },
    avatarBadge: {
        position: 'absolute',
        bottom: 4,
        right: 4,
        width: 20,
        height: 20,
        borderRadius: 10,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.8)',
        backgroundColor: 'rgba(30, 30, 40, 0.95)',
    },
    avatarImage: {
        width: '100%',
        height: '100%',
    },
    avatarPlaceholder: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(168, 85, 247, 0.4)',
    },
});

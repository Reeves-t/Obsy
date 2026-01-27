import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    Easing,
    cancelAnimation
} from 'react-native-reanimated';

interface ProgressSegmentProps {
    isActive: boolean;
    isCompleted: boolean;
}

const ProgressSegment: React.FC<ProgressSegmentProps> = ({ isActive, isCompleted }) => {
    const fillWidth = useSharedValue(isCompleted ? 1 : 0);

    useEffect(() => {
        if (isActive) {
            // Always start from 0 for active segment to ensure fill animation
            fillWidth.value = 0;
            fillWidth.value = withTiming(1, {
                duration: 4500, // Slowed down by 3x for a calmer feel
                easing: Easing.linear,
            });
        } else if (isCompleted) {
            fillWidth.value = 1;
        } else {
            fillWidth.value = 0;
        }

        return () => cancelAnimation(fillWidth);
    }, [isActive, isCompleted]);

    const animatedStyle = useAnimatedStyle(() => ({
        width: `${fillWidth.value * 100}%`,
    }));

    return (
        <View style={styles.segmentBackground}>
            <Animated.View style={[styles.segmentFill, animatedStyle]} />
        </View>
    );
};

interface ProgressIndicatorProps {
    current: number; // 0-indexed
    total: number;
}

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({ current, total }) => {
    return (
        <View style={styles.container}>
            {Array.from({ length: total }).map((_, i) => (
                <ProgressSegment
                    key={i}
                    isActive={i === current}
                    isCompleted={i < current}
                />
            ))}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        gap: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    segmentBackground: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        overflow: 'hidden',
    },
    segmentFill: {
        height: '100%',
        backgroundColor: '#FFFFFF',
    },
});

import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
    interpolate,
    Extrapolation,
    useAnimatedStyle,
    type SharedValue,
} from 'react-native-reanimated';

interface PageDotsProps {
    scrollX: SharedValue<number>;
    count: number;
    pageWidth: number;
}

function Dot({ index, scrollX, pageWidth }: { index: number; scrollX: SharedValue<number>; pageWidth: number }) {
    const animatedStyle = useAnimatedStyle(() => {
        const inputRange = [(index - 1) * pageWidth, index * pageWidth, (index + 1) * pageWidth];
        const width = interpolate(scrollX.value, inputRange, [6, 18, 6], Extrapolation.CLAMP);
        const opacity = interpolate(scrollX.value, inputRange, [0.3, 1, 0.3], Extrapolation.CLAMP);
        return { width, opacity };
    });

    return <Animated.View style={[styles.dot, animatedStyle]} />;
}

/** Animated page indicator driven by the pager's horizontal scroll offset. */
export function PageDots({ scrollX, count, pageWidth }: PageDotsProps) {
    return (
        <View style={styles.row} pointerEvents="none">
            {Array.from({ length: count }).map((_, i) => (
                <Dot key={i} index={i} scrollX={scrollX} pageWidth={pageWidth} />
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    dot: {
        height: 6,
        borderRadius: 3,
        backgroundColor: '#fff',
    },
});

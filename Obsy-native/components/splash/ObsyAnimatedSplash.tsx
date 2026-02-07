import React, { useEffect } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import Animated, {
    useSharedValue,
    withTiming,
    withDelay,
    Easing,
    runOnJS,
    useAnimatedStyle,
} from 'react-native-reanimated';

const AnimatedView = Animated.createAnimatedComponent(View);

interface ObsyAnimatedSplashProps {
    onAnimationComplete?: () => void;
}

export const ObsyAnimatedSplash = ({ onAnimationComplete }: ObsyAnimatedSplashProps) => {
    const logoOpacity = useSharedValue(0);
    const containerOpacity = useSharedValue(1);

    useEffect(() => {
        // Fade in the logo
        logoOpacity.value = withDelay(
            200,
            withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) })
        );

        // Hold, then fade everything out
        const exitTimer = setTimeout(() => {
            containerOpacity.value = withTiming(0, { duration: 600 }, (finished) => {
                if (finished && onAnimationComplete) {
                    runOnJS(onAnimationComplete)();
                }
            });
        }, 2400);

        return () => clearTimeout(exitTimer);
    }, []);

    const containerStyle = useAnimatedStyle(() => ({
        opacity: containerOpacity.value,
    }));

    const logoStyle = useAnimatedStyle(() => ({
        opacity: logoOpacity.value,
    }));

    return (
        <AnimatedView style={[styles.container, containerStyle]}>
            <View style={styles.baseLayer} />
            <AnimatedView style={[styles.logoWrapper, logoStyle]}>
                <Image
                    source={require('../../assets/images/icon.png')}
                    style={styles.logo}
                    resizeMode="contain"
                />
            </AnimatedView>
        </AnimatedView>
    );
};

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 99999,
    },
    baseLayer: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#000000',
    },
    logoWrapper: {
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
    },
    logo: {
        width: 120,
        height: 120,
    },
});

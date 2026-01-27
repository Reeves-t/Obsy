import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
    useSharedValue,
    useAnimatedProps,
    withTiming,
    withDelay,
    withRepeat,
    withSequence,
    Easing,
    runOnJS,
    useAnimatedStyle,
} from 'react-native-reanimated';
import { ORB_VIEWPORT_SIZE, SPLASH_ORBS_SORTED, OrbData } from './orbLayout';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedView = Animated.createAnimatedComponent(View);
const AnimatedText = Animated.createAnimatedComponent(Text);

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Corner wash size (~38% of screen, contained to corners)
const CORNER_WASH_SIZE = Math.max(SCREEN_WIDTH, SCREEN_HEIGHT) * 0.38;

// Corner colors (same as AmbientBackground)
const CORNER_COLORS = {
    orange: '#FB923C',
    blue: '#60A5FA',
    green: '#34D399',
    purple: '#A78BFA',
};

// Silver grey for orbs and text
const SILVER_GREY = '#E5E7EB';

// Helper to add opacity hex suffix
const withOpacity = (hex: string, opacity: number): string => {
    const opacityHex = Math.round(opacity * 255).toString(16).padStart(2, '0').toUpperCase();
    return `${hex}${opacityHex}`;
};

interface ObsyAnimatedSplashProps {
    onAnimationComplete?: () => void;
}

// Reusable Orb Component
const Orb = ({ data }: { data: OrbData }) => {
    const translateX = useSharedValue(data.scatterX);
    const translateY = useSharedValue(data.scatterY);
    const breatheOffset = useSharedValue(0);

    useEffect(() => {
        const startTime = 100 + data.convergeDelay;
        const duration = 2000;

        translateX.value = withDelay(
            startTime,
            withTiming(0, { duration, easing: Easing.out(Easing.cubic) })
        );
        translateY.value = withDelay(
            startTime,
            withTiming(0, { duration, easing: Easing.out(Easing.cubic) }, (finished) => {
                if (finished) {
                    breatheOffset.value = withDelay(
                        600,
                        withRepeat(
                            withSequence(
                                withTiming(1.5, { duration: 3000, easing: Easing.inOut(Easing.sin) }),
                                withTiming(0, { duration: 3000, easing: Easing.inOut(Easing.sin) })
                            ),
                            -1,
                            false
                        )
                    );
                }
            })
        );
    }, []);

    const animatedProps = useAnimatedProps(() => {
        const dx = data.cx - 50;
        const dy = data.cy - 50;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const dirX = dx / dist;
        const dirY = dy / dist;

        return {
            transform: [
                { translateX: translateX.value + (dirX * breatheOffset.value) },
                { translateY: translateY.value + (dirY * breatheOffset.value) }
            ]
        };
    });

    return (
        <AnimatedCircle
            cx={data.cx}
            cy={data.cy}
            r={data.r}
            fill={`url(#orbGradient)`}
            opacity={1}
            animatedProps={animatedProps}
        />
    );
};

export const ObsyAnimatedSplash = ({ onAnimationComplete }: ObsyAnimatedSplashProps) => {
    const containerOpacity = useSharedValue(1);
    const textOpacity = useSharedValue(0);
    const taglineOpacity = useSharedValue(0);

    useEffect(() => {
        textOpacity.value = withDelay(2800, withTiming(1, { duration: 600 }));
        taglineOpacity.value = withDelay(3200, withTiming(1, { duration: 600 }));

        const exitTimer = setTimeout(() => {
            containerOpacity.value = withTiming(0, { duration: 800 }, (finished) => {
                if (finished && onAnimationComplete) {
                    runOnJS(onAnimationComplete)();
                }
            });
        }, 5500);

        return () => clearTimeout(exitTimer);
    }, []);

    const containerStyle = useAnimatedStyle(() => ({
        opacity: containerOpacity.value,
    }));

    const textStyle = useAnimatedStyle(() => ({
        opacity: textOpacity.value,
    }));

    const taglineStyle = useAnimatedStyle(() => ({
        opacity: taglineOpacity.value,
    }));

    return (
        <AnimatedView style={[styles.container, containerStyle]}>
            {/* Base black layer */}
            <View style={styles.baseLayer} />

            {/* Corner washes - matching AmbientBackground */}
            {/* Top-Left: Orange */}
            <View style={[styles.cornerWashContainer, { top: -CORNER_WASH_SIZE * 0.15, left: -CORNER_WASH_SIZE * 0.15 }]}>
                <LinearGradient
                    colors={[
                        withOpacity(CORNER_COLORS.orange, 0.5),
                        withOpacity(CORNER_COLORS.orange, 0.175),
                        withOpacity(CORNER_COLORS.orange, 0.04),
                        'transparent',
                    ]}
                    locations={[0, 0.15, 0.35, 0.55]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.cornerWash}
                />
            </View>

            {/* Top-Right: Blue */}
            <View style={[styles.cornerWashContainer, { top: -CORNER_WASH_SIZE * 0.15, right: -CORNER_WASH_SIZE * 0.15 }]}>
                <LinearGradient
                    colors={[
                        withOpacity(CORNER_COLORS.blue, 0.5),
                        withOpacity(CORNER_COLORS.blue, 0.175),
                        withOpacity(CORNER_COLORS.blue, 0.04),
                        'transparent',
                    ]}
                    locations={[0, 0.15, 0.35, 0.55]}
                    start={{ x: 1, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={styles.cornerWash}
                />
            </View>

            {/* Bottom-Left: Green */}
            <View style={[styles.cornerWashContainer, { bottom: -CORNER_WASH_SIZE * 0.15, left: -CORNER_WASH_SIZE * 0.15 }]}>
                <LinearGradient
                    colors={[
                        withOpacity(CORNER_COLORS.green, 0.5),
                        withOpacity(CORNER_COLORS.green, 0.175),
                        withOpacity(CORNER_COLORS.green, 0.04),
                        'transparent',
                    ]}
                    locations={[0, 0.15, 0.35, 0.55]}
                    start={{ x: 0, y: 1 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.cornerWash}
                />
            </View>

            {/* Bottom-Right: Purple */}
            <View style={[styles.cornerWashContainer, { bottom: -CORNER_WASH_SIZE * 0.15, right: -CORNER_WASH_SIZE * 0.15 }]}>
                <LinearGradient
                    colors={[
                        withOpacity(CORNER_COLORS.purple, 0.5),
                        withOpacity(CORNER_COLORS.purple, 0.175),
                        withOpacity(CORNER_COLORS.purple, 0.04),
                        'transparent',
                    ]}
                    locations={[0, 0.15, 0.35, 0.55]}
                    start={{ x: 1, y: 1 }}
                    end={{ x: 0, y: 0 }}
                    style={styles.cornerWash}
                />
            </View>

            {/* Center Content */}
            <View style={styles.centerContent}>
                <View style={styles.logoRow}>
                    <View style={styles.orbContainer}>
                        <Svg width="100%" height="100%" viewBox={`0 0 ${ORB_VIEWPORT_SIZE} ${ORB_VIEWPORT_SIZE}`}>
                            <Defs>
                                {/* Silver grey gradient for orbs */}
                                <RadialGradient id="orbGradient" cx="50%" cy="50%" rx="50%" ry="50%">
                                    <Stop offset="0%" stopColor="#F3F4F6" stopOpacity="1" />
                                    <Stop offset="60%" stopColor={SILVER_GREY} stopOpacity="1" />
                                    <Stop offset="100%" stopColor="#D1D5DB" stopOpacity="1" />
                                </RadialGradient>
                            </Defs>
                            {SPLASH_ORBS_SORTED.map(orb => (
                                <Orb key={orb.id} data={orb} />
                            ))}
                        </Svg>
                    </View>

                    <AnimatedText style={[styles.wordmarkText, textStyle]}>
                        BSY
                    </AnimatedText>
                </View>

                <AnimatedText style={[styles.tagline, taglineStyle]}>
                    observe your day
                </AnimatedText>
            </View>
        </AnimatedView>
    );
};

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 99999,
        overflow: 'hidden',
    },
    baseLayer: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#000000',
    },
    cornerWashContainer: {
        position: 'absolute',
        width: CORNER_WASH_SIZE,
        height: CORNER_WASH_SIZE,
    },
    cornerWash: {
        width: CORNER_WASH_SIZE,
        height: CORNER_WASH_SIZE,
    },
    centerContent: {
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
    },
    logoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    orbContainer: {
        width: 90,
        height: 90,
        marginRight: 6,
        overflow: 'visible',
    },
    wordmarkText: {
        color: SILVER_GREY,
        fontFamily: 'Inter_700Bold',
        fontSize: 48,
        letterSpacing: -1,
        includeFontPadding: false,
        marginBottom: 4,
    },
    tagline: {
        marginTop: 16,
        color: SILVER_GREY,
        fontFamily: 'Inter_400Regular',
        fontSize: 18,
        letterSpacing: 0.5,
        opacity: 0.7,
    }
});

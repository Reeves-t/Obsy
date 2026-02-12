import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
    useSharedValue,
    withTiming,
    withDelay,
    Easing,
    runOnJS,
    useAnimatedStyle,
} from 'react-native-reanimated';
import Svg, {
    Ellipse,
    Defs,
    LinearGradient,
    Stop,
} from 'react-native-svg';

const AnimatedView = Animated.createAnimatedComponent(View);

// Display size and scale from the 1024x1024 SVG viewBox
const LOGO_SIZE = 150;
const S = LOGO_SIZE / 1024;

// Orb data extracted from the SVG paths
// Positions/sizes are in original 1024-viewBox coordinates, scaled at render time
const ORBS = [
    {
        // Large orb — right of center
        cx: 564, cy: 527, rx: 58, ry: 57,
        color1: '#5A0C8A', color2: '#871E13',
        startOffsetY: -50,
        stagger: 0,
    },
    {
        // Medium orb — lower center
        cx: 493, cy: 631, rx: 32, ry: 26,
        color1: '#5A0C8A', color2: '#076403',
        startOffsetY: 50,
        stagger: 200,
    },
    {
        // Small orb — left of center
        cx: 436, cy: 483, rx: 23, ry: 23,
        color1: '#5A0C8A', color2: '#871E13',
        startOffsetY: -35,
        stagger: 400,
    },
];

interface ObsyAnimatedSplashProps {
    onAnimationComplete?: () => void;
}

export const ObsyAnimatedSplash = ({ onAnimationComplete }: ObsyAnimatedSplashProps) => {
    const containerOpacity = useSharedValue(1);
    const ringOpacity = useSharedValue(0);

    // Orb shared values (opacity + translateY for each)
    const orb0Opacity = useSharedValue(0);
    const orb0Y = useSharedValue(ORBS[0].startOffsetY * S);
    const orb1Opacity = useSharedValue(0);
    const orb1Y = useSharedValue(ORBS[1].startOffsetY * S);
    const orb2Opacity = useSharedValue(0);
    const orb2Y = useSharedValue(ORBS[2].startOffsetY * S);

    useEffect(() => {
        const easeOut = Easing.out(Easing.cubic);

        // Phase 1: Ring + fill fade in
        ringOpacity.value = withDelay(200, withTiming(1, { duration: 800, easing: easeOut }));

        // Phase 2: Orbs fade in and drift to final position (staggered)
        const orbBase = 700;
        const orbDur = 900;

        orb0Opacity.value = withDelay(orbBase + ORBS[0].stagger, withTiming(1, { duration: orbDur, easing: easeOut }));
        orb0Y.value = withDelay(orbBase + ORBS[0].stagger, withTiming(0, { duration: orbDur, easing: easeOut }));

        orb1Opacity.value = withDelay(orbBase + ORBS[1].stagger, withTiming(1, { duration: orbDur, easing: easeOut }));
        orb1Y.value = withDelay(orbBase + ORBS[1].stagger, withTiming(0, { duration: orbDur, easing: easeOut }));

        orb2Opacity.value = withDelay(orbBase + ORBS[2].stagger, withTiming(1, { duration: orbDur, easing: easeOut }));
        orb2Y.value = withDelay(orbBase + ORBS[2].stagger, withTiming(0, { duration: orbDur, easing: easeOut }));

        // Phase 3: Hold, then fade everything out
        const exitTimer = setTimeout(() => {
            containerOpacity.value = withTiming(0, { duration: 600 }, (finished) => {
                if (finished && onAnimationComplete) {
                    runOnJS(onAnimationComplete)();
                }
            });
        }, 2800);

        return () => clearTimeout(exitTimer);
    }, []);

    const containerStyle = useAnimatedStyle(() => ({ opacity: containerOpacity.value }));
    const ringStyle = useAnimatedStyle(() => ({ opacity: ringOpacity.value }));

    const orbStyles = [
        useAnimatedStyle(() => ({ opacity: orb0Opacity.value, transform: [{ translateY: orb0Y.value }] })),
        useAnimatedStyle(() => ({ opacity: orb1Opacity.value, transform: [{ translateY: orb1Y.value }] })),
        useAnimatedStyle(() => ({ opacity: orb2Opacity.value, transform: [{ translateY: orb2Y.value }] })),
    ];

    return (
        <AnimatedView style={[styles.container, containerStyle]}>
            <View style={styles.baseLayer} />
            <View style={[styles.logoWrapper, { width: LOGO_SIZE, height: LOGO_SIZE }]}>
                {/* Ring + inner fill */}
                <AnimatedView style={[StyleSheet.absoluteFill, ringStyle]}>
                    <Svg width={LOGO_SIZE} height={LOGO_SIZE} viewBox="0 0 1024 1024">
                        <Defs>
                            <LinearGradient id="ringGrad" x1="511.5" y1="213" x2="511.5" y2="810" gradientUnits="userSpaceOnUse">
                                <Stop offset="0.038" stopColor="#868080" />
                                <Stop offset="0.221" stopColor="#434040" />
                                <Stop offset="0.346" stopColor="#2E2C2C" />
                                <Stop offset="0.538" stopColor="#121111" />
                                <Stop offset="0.889" stopColor="#A9A2A2" />
                            </LinearGradient>
                            <LinearGradient id="fillGrad" x1="511.5" y1="241" x2="511.5" y2="782" gradientUnits="userSpaceOnUse">
                                <Stop offset="0" stopColor="#000000" />
                                <Stop offset="0.538" stopColor="#222121" />
                                <Stop offset="1" stopColor="#060606" />
                            </LinearGradient>
                        </Defs>
                        {/* Outer metallic ring */}
                        <Ellipse cx={511.5} cy={511.5} rx={308.5} ry={298.5} fill="url(#ringGrad)" />
                        {/* Inner dark fill */}
                        <Ellipse cx={511.5} cy={511.5} rx={279.578} ry={270.071} fill="url(#fillGrad)" />
                    </Svg>
                </AnimatedView>

                {/* Orbs — each in its own Animated.View for independent animation */}
                {ORBS.map((orb, i) => {
                    const orbW = orb.rx * 2 * S + 4;
                    const orbH = orb.ry * 2 * S + 4;
                    const orbLeft = orb.cx * S - orbW / 2;
                    const orbTop = orb.cy * S - orbH / 2;

                    return (
                        <AnimatedView
                            key={i}
                            style={[
                                styles.orbContainer,
                                {
                                    left: orbLeft,
                                    top: orbTop,
                                    width: orbW,
                                    height: orbH,
                                },
                                orbStyles[i],
                            ]}
                        >
                            <Svg width={orbW} height={orbH} viewBox={`0 0 ${orbW} ${orbH}`}>
                                <Defs>
                                    <LinearGradient id={`orbGrad${i}`} x1="0" y1="0" x2={String(orbW)} y2={String(orbH)} gradientUnits="userSpaceOnUse">
                                        <Stop offset="0" stopColor={orb.color1} />
                                        <Stop offset="1" stopColor={orb.color2} />
                                    </LinearGradient>
                                    <LinearGradient id={`orbStroke${i}`} x1="0" y1="0" x2={String(orbW)} y2="0" gradientUnits="userSpaceOnUse">
                                        <Stop offset="0.038" stopColor="#868080" />
                                        <Stop offset="0.35" stopColor="#2E2C2C" />
                                        <Stop offset="0.889" stopColor="#A9A2A2" />
                                    </LinearGradient>
                                </Defs>
                                <Ellipse
                                    cx={orbW / 2}
                                    cy={orbH / 2}
                                    rx={orb.rx * S}
                                    ry={orb.ry * S}
                                    fill={`url(#orbGrad${i})`}
                                    stroke={`url(#orbStroke${i})`}
                                    strokeWidth={0.5}
                                />
                            </Svg>
                        </AnimatedView>
                    );
                })}
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
    },
    baseLayer: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#000000',
    },
    logoWrapper: {
        zIndex: 1,
    },
    orbContainer: {
        position: 'absolute',
    },
});

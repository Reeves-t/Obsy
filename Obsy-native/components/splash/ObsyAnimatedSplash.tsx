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
    Circle,
    Defs,
    LinearGradient,
    RadialGradient,
    Stop,
} from 'react-native-svg';

const AnimatedView = Animated.createAnimatedComponent(View);

// Display size and scale from the new 500x500 SVG viewBox (obsy.cobalt.logo)
const LOGO_SIZE = 150;
const VIEWBOX = 500;
const S = LOGO_SIZE / VIEWBOX;

// Orb data extracted from obsy.cobalt.logo.svg.
// Positions/sizes are in original 500-viewBox coordinates, scaled at render time.
type OrbDef = {
    cx: number;
    cy: number;
    r: number;
    grad: { cx: string; cy: string; r: string };
    stops: { offset: string; color: string; opacity: string }[];
    startOffsetY: number;
    stagger: number;
};

const ORBS: OrbDef[] = [
    {
        // Large orb — right-bottom of center, cobalt primary
        cx: 290, cy: 290, r: 76.70,
        grad: { cx: '30%', cy: '30%', r: '70%' },
        stops: [
            { offset: '0%', color: '#41caec', opacity: '1' },
            { offset: '31.76%', color: '#118dac', opacity: '0.95' },
            { offset: '73.76%', color: '#1d4d72', opacity: '0.7' },
            { offset: '100%', color: '#1a2643', opacity: '0' },
        ],
        startOffsetY: -50,
        stagger: 0,
    },
    {
        // Small orb — upper-left, slate-blue secondary
        cx: 180, cy: 220, r: 31.86,
        grad: { cx: '68%', cy: '32%', r: '68%' },
        stops: [
            { offset: '0%', color: '#899fd2', opacity: '1' },
            { offset: '31.76%', color: '#4160aa', opacity: '0.95' },
            { offset: '73.76%', color: '#1a5071', opacity: '0.7' },
            { offset: '100%', color: '#04222a', opacity: '0' },
        ],
        startOffsetY: -35,
        stagger: 200,
    },
    {
        // Tiny orb — lower-left, mid-blue blend
        cx: 200, cy: 340, r: 25.96,
        grad: { cx: '38%', cy: '60%', r: '65%' },
        stops: [
            { offset: '0%', color: '#61a9d9', opacity: '1' },
            { offset: '31.76%', color: '#2b7db3', opacity: '0.95' },
            { offset: '73.76%', color: '#174361', opacity: '0.7' },
            { offset: '100%', color: '#091b27', opacity: '0' },
        ],
        startOffsetY: 50,
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

        // Phase 1: Bezel ring + disc fill fade in
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
                {/* Bezel ring + disc fill + highlight + inner shadow */}
                <AnimatedView style={[StyleSheet.absoluteFill, ringStyle]}>
                    <Svg width={LOGO_SIZE} height={LOGO_SIZE} viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}>
                        <Defs>
                            <RadialGradient id="discFill" cx="50%" cy="42%" r="62%">
                                <Stop offset="0%" stopColor="#242424" />
                                <Stop offset="55%" stopColor="#0a0a0a" />
                                <Stop offset="100%" stopColor="#000000" />
                            </RadialGradient>
                            <LinearGradient id="bezelGrad" x1="50%" y1="0%" x2="50%" y2="100%">
                                <Stop offset="0%" stopColor="#9a9a9e" />
                                <Stop offset="8%" stopColor="#cfcfd3" />
                                <Stop offset="22%" stopColor="#5e5e63" />
                                <Stop offset="55%" stopColor="#1f1f22" />
                                <Stop offset="80%" stopColor="#3a3a3e" />
                                <Stop offset="92%" stopColor="#b8b8bc" />
                                <Stop offset="100%" stopColor="#5c5c60" />
                            </LinearGradient>
                            <LinearGradient id="bezelHi" x1="50%" y1="0%" x2="50%" y2="100%">
                                <Stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
                                <Stop offset="40%" stopColor="#ffffff" stopOpacity="0.05" />
                                <Stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                            </LinearGradient>
                            <RadialGradient id="innerShadow" cx="50%" cy="50%" r="50%">
                                <Stop offset="80%" stopColor="#000000" stopOpacity="0" />
                                <Stop offset="100%" stopColor="#000000" stopOpacity="0.7" />
                            </RadialGradient>
                        </Defs>
                        {/* Black backplate */}
                        <Circle cx={250} cy={250} r={230} fill="#000000" />
                        {/* Metallic bezel ring */}
                        <Circle cx={250} cy={250} r={220} fill="url(#bezelGrad)" />
                        {/* Inner disc fill */}
                        <Circle cx={250} cy={250} r={208} fill="url(#discFill)" />
                        {/* Bezel highlight stroke */}
                        <Circle cx={250} cy={250} r={220} fill="none" stroke="url(#bezelHi)" strokeWidth={3} />
                        {/* Inner vignette */}
                        <Circle cx={250} cy={250} r={208} fill="url(#innerShadow)" />
                    </Svg>
                </AnimatedView>

                {/* Orbs — each in its own Animated.View for independent fade + drift */}
                {ORBS.map((orb, i) => {
                    const orbW = orb.r * 2 * S + 6;
                    const orbH = orb.r * 2 * S + 6;
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
                                    <RadialGradient
                                        id={`orbBody${i}`}
                                        cx={orb.grad.cx}
                                        cy={orb.grad.cy}
                                        r={orb.grad.r}
                                    >
                                        {orb.stops.map((s, j) => (
                                            <Stop key={j} offset={s.offset} stopColor={s.color} stopOpacity={s.opacity} />
                                        ))}
                                    </RadialGradient>
                                </Defs>
                                <Circle
                                    cx={orbW / 2}
                                    cy={orbH / 2}
                                    r={orb.r * S}
                                    fill={`url(#orbBody${i})`}
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

import React, { useEffect } from 'react';
import { Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
    Easing,
    cancelAnimation,
    interpolate,
    runOnJS,
    useAnimatedProps,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withTiming,
} from 'react-native-reanimated';
import Svg, {
    Circle,
    Defs,
    G,
    LinearGradient,
    Path,
    RadialGradient,
    Stop,
} from 'react-native-svg';

const AnimatedImage = Animated.createAnimatedComponent(Image);

// Design handoff: claude design/splashscreen update (design_handoff_obsy_splash).
// Timeline recreated 1:1 from the HTML prototype at the confirmed 0.8x speed —
// only the phase timers divide by speed; tween durations stay as specced.
const SPEED = 0.8;
const T_INTRO = 120; // prototype does not scale the intro timer
const T_MORPH = 1900 / SPEED; // 2375ms
const T_DONE = 3100 / SPEED; // 3875ms
const T_EXIT = 5500;

const ICON_SIZE = 170;
const GLOW_SIZE = 340;
const INTRO_SCALE = 0.32;

// Transform easing from the spec: cubic-bezier(0.55, 0.05, 0.25, 1)
const MORPH_EASE = Easing.bezier(0.55, 0.05, 0.25, 1);
const WORDMARK_EASE = Easing.bezier(0.2, 0.7, 0.2, 1);

// Daystruct mark, hand-built from assets/images/daystruct-logo.svg (400 viewBox).
// The source SVG cuts the S-curve out of the D via <mask>, but react-native-svg
// doesn't render stroked/transformed mask content. The splash background is pure
// black, so painting the S-curve strokes in black on top is visually identical.
const DS_D_PATH = 'M126 78 H198 A122 122 0 0 1 198 322 H126 A22 22 0 0 1 104 300 V100 A22 22 0 0 1 126 78 Z';
const DS_S_PATH = 'M340 138 C310 112 224 104 182 126 C142 147 148 192 187 205 L227 218 C266 231 270 274 232 292 C194 310 112 298 76 266';

const DaystructLogo = ({ size }: { size: number }) => (
    <Svg width={size} height={size} viewBox="0 0 400 400" fill="none">
        <Defs>
            <LinearGradient id="dsMetal" gradientUnits="userSpaceOnUse" x1="90" y1="80" x2="290" y2="330">
                <Stop offset="0%" stopColor="#e9ebee" />
                <Stop offset="55%" stopColor="#cfd3d9" />
                <Stop offset="100%" stopColor="#b3b9c1" />
            </LinearGradient>
            <LinearGradient id="dsEdge" gradientUnits="userSpaceOnUse" x1="200" y1="60" x2="200" y2="345">
                <Stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
                <Stop offset="60%" stopColor="#ffffff" stopOpacity="0.35" />
                <Stop offset="100%" stopColor="#ffffff" stopOpacity="0.1" />
            </LinearGradient>
        </Defs>
        <Path
            d={DS_D_PATH}
            fill="url(#dsMetal)"
            stroke="url(#dsEdge)"
            strokeWidth={2.2}
            strokeLinejoin="round"
        />
        <G rotation={-18} origin="200, 200">
            <Path
                d={DS_S_PATH}
                stroke="#000000"
                strokeWidth={30}
                strokeLinecap="round"
            />
            <Path
                d={DS_S_PATH}
                y={-28}
                stroke="#000000"
                strokeWidth={8}
                strokeLinecap="round"
            />
        </G>
    </Svg>
);

interface DaystructMorphSplashProps {
    onAnimationComplete?: () => void;
}

export const DaystructMorphSplash = ({ onAnimationComplete }: DaystructMorphSplashProps) => {
    const { height } = useWindowDimensions();
    const introTranslateY = height * 0.37;

    const containerOpacity = useSharedValue(1);
    // 0 = intro "bottom" transform, 1 = settled at center; drives both marks
    const morphProgress = useSharedValue(0);
    const dsOpacity = useSharedValue(0);
    const obOpacity = useSharedValue(0);
    const obBlur = useSharedValue(8);
    const captionOpacity = useSharedValue(0);
    const glowOpacity = useSharedValue(0);
    const glowPulse = useSharedValue(0.5);
    const wordmarkOpacity = useSharedValue(0);
    const wordmarkY = useSharedValue(14);

    useEffect(() => {
        const timers = [
            setTimeout(() => {
                // intro: logo + caption fade in at the bottom
                dsOpacity.value = withTiming(1, { duration: 800, easing: Easing.ease });
                captionOpacity.value = withTiming(1, { duration: 800, easing: Easing.ease });
            }, T_INTRO),

            setTimeout(() => {
                // morph: lift to center, rotate, crossfade Daystruct -> Obsy
                morphProgress.value = withTiming(1, { duration: 1150, easing: MORPH_EASE });
                dsOpacity.value = withDelay(450, withTiming(0, { duration: 700, easing: Easing.ease }));
                obOpacity.value = withDelay(350, withTiming(1, { duration: 800, easing: Easing.ease }));
                obBlur.value = withDelay(300, withTiming(0, { duration: 1000, easing: Easing.ease }));
                captionOpacity.value = withTiming(0, { duration: 800, easing: Easing.ease });
                glowOpacity.value = withTiming(1, { duration: 1200, easing: Easing.ease });
                glowPulse.value = withRepeat(
                    withSequence(
                        withTiming(0.9, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
                        withTiming(0.5, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
                    ),
                    -1,
                    false,
                );
            }, T_MORPH),

            setTimeout(() => {
                // done: wordmark rises in
                wordmarkOpacity.value = withTiming(1, { duration: 900, easing: Easing.ease });
                wordmarkY.value = withTiming(0, { duration: 900, easing: WORDMARK_EASE });
            }, T_DONE),

            setTimeout(() => {
                containerOpacity.value = withTiming(0, { duration: 600 }, (finished) => {
                    if (finished && onAnimationComplete) {
                        runOnJS(onAnimationComplete)();
                    }
                });
            }, T_EXIT),
        ];

        return () => {
            timers.forEach(clearTimeout);
            cancelAnimation(glowPulse);
        };
    }, []);

    const containerStyle = useAnimatedStyle(() => ({ opacity: containerOpacity.value }));

    const dsStyle = useAnimatedStyle(() => ({
        opacity: dsOpacity.value,
        transform: [
            { translateY: interpolate(morphProgress.value, [0, 1], [introTranslateY, 0]) },
            { scale: interpolate(morphProgress.value, [0, 1], [INTRO_SCALE, 1.05]) },
            { rotate: `${interpolate(morphProgress.value, [0, 1], [0, 170])}deg` },
        ],
    }));

    const obStyle = useAnimatedStyle(() => ({
        opacity: obOpacity.value,
        transform: [
            { translateY: interpolate(morphProgress.value, [0, 1], [introTranslateY, 0]) },
            { scale: interpolate(morphProgress.value, [0, 1], [INTRO_SCALE, 1]) },
        ],
    }));

    const obProps = useAnimatedProps(() => ({ blurRadius: obBlur.value }));
    const captionStyle = useAnimatedStyle(() => ({ opacity: captionOpacity.value }));
    const glowStyle = useAnimatedStyle(() => ({ opacity: glowOpacity.value }));
    const glowPulseStyle = useAnimatedStyle(() => ({ opacity: glowPulse.value }));
    const wordmarkStyle = useAnimatedStyle(() => ({
        opacity: wordmarkOpacity.value,
        transform: [{ translateY: wordmarkY.value }],
    }));

    return (
        <Animated.View style={[styles.container, containerStyle]}>
            <View style={styles.baseLayer} />

            {/* Glow: outer layer owns the fade-in, inner layer owns the pulse */}
            <Animated.View style={[styles.glow, glowStyle]}>
                <Animated.View style={glowPulseStyle}>
                    <Svg width={GLOW_SIZE} height={GLOW_SIZE} viewBox={`0 0 ${GLOW_SIZE} ${GLOW_SIZE}`}>
                        <Defs>
                            <RadialGradient id="splashGlow" cx="50%" cy="50%" r="50%">
                                <Stop offset="0%" stopColor="#2596be" stopOpacity="0.22" />
                                <Stop offset="65%" stopColor="#2596be" stopOpacity="0" />
                                <Stop offset="100%" stopColor="#2596be" stopOpacity="0" />
                            </RadialGradient>
                        </Defs>
                        <Circle cx={GLOW_SIZE / 2} cy={GLOW_SIZE / 2} r={GLOW_SIZE / 2} fill="url(#splashGlow)" />
                    </Svg>
                </Animated.View>
            </Animated.View>

            <Animated.View style={[styles.mark, dsStyle]}>
                <DaystructLogo size={ICON_SIZE} />
            </Animated.View>

            <AnimatedImage
                source={require('../../assets/images/obsy-icon-1024.png')}
                animatedProps={obProps}
                style={[styles.mark, styles.obsyIcon, obStyle]}
            />

            <Animated.View style={[styles.captionWrap, captionStyle]}>
                <Text style={styles.caption}>Designed by Daystruct</Text>
            </Animated.View>

            <View style={styles.wordmarkWrap}>
                <Animated.Text style={[styles.wordmark, wordmarkStyle]}>obsy</Animated.Text>
            </View>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 99999,
    },
    baseLayer: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#000000',
    },
    glow: {
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: GLOW_SIZE,
        height: GLOW_SIZE,
        marginLeft: -GLOW_SIZE / 2,
        marginTop: -GLOW_SIZE / 2,
    },
    mark: {
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: ICON_SIZE,
        height: ICON_SIZE,
        marginLeft: -ICON_SIZE / 2,
        marginTop: -ICON_SIZE / 2,
    },
    obsyIcon: {
        borderRadius: ICON_SIZE / 2,
        overflow: 'hidden',
    },
    captionWrap: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: '5.5%',
    },
    caption: {
        textAlign: 'center',
        color: '#8a919c',
        fontFamily: 'SpaceGrotesk_500Medium',
        fontSize: 12,
        letterSpacing: 12 * 0.34,
        textTransform: 'uppercase',
    },
    wordmarkWrap: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: '50%',
        marginTop: 108,
    },
    wordmark: {
        textAlign: 'center',
        color: '#e8edf2',
        fontFamily: 'SpaceGrotesk_500Medium',
        fontSize: 34,
        letterSpacing: 34 * 0.12,
    },
});

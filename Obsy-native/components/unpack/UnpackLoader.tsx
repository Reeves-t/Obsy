import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
    Easing,
    FadeIn,
    FadeOut,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
    cancelAnimation,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

/**
 * Obsy-branded full-screen loader for the Unpack flow. The three logo orbs
 * tumble/rotate inside the mark while the mark breathes; a rotating subtext
 * cross-fades beneath the title. Calm, premium, not a generic spinner.
 */

const LOGO_SIZE = 150;
const VIEWBOX = 500;
const S = LOGO_SIZE / VIEWBOX;

const ORBS = [
    {
        cx: 290, cy: 290, r: 76.7,
        grad: { cx: '30%', cy: '30%', r: '70%' },
        stops: [
            { offset: '0%', color: '#41caec', opacity: '1' },
            { offset: '31.76%', color: '#118dac', opacity: '0.95' },
            { offset: '73.76%', color: '#1d4d72', opacity: '0.7' },
            { offset: '100%', color: '#1a2643', opacity: '0' },
        ],
    },
    {
        cx: 180, cy: 220, r: 31.86,
        grad: { cx: '68%', cy: '32%', r: '68%' },
        stops: [
            { offset: '0%', color: '#899fd2', opacity: '1' },
            { offset: '31.76%', color: '#4160aa', opacity: '0.95' },
            { offset: '73.76%', color: '#1a5071', opacity: '0.7' },
            { offset: '100%', color: '#04222a', opacity: '0' },
        ],
    },
    {
        cx: 200, cy: 340, r: 25.96,
        grad: { cx: '38%', cy: '60%', r: '65%' },
        stops: [
            { offset: '0%', color: '#61a9d9', opacity: '1' },
            { offset: '31.76%', color: '#2b7db3', opacity: '0.95' },
            { offset: '73.76%', color: '#174361', opacity: '0.7' },
            { offset: '100%', color: '#091b27', opacity: '0' },
        ],
    },
];

interface UnpackLoaderProps {
    title?: string;
    phrases: string[];
    /** ms between subtext swaps. */
    interval?: number;
}

export function UnpackLoader({
    title = 'Unpacking your moment',
    phrases,
    interval = 2200,
}: UnpackLoaderProps) {
    const rotation = useSharedValue(0);
    const breathe = useSharedValue(1);
    const glow = useSharedValue(0.35);
    const [phraseIndex, setPhraseIndex] = useState(0);

    useEffect(() => {
        rotation.value = withRepeat(
            withTiming(360, { duration: 9000, easing: Easing.linear }),
            -1,
            false,
        );
        breathe.value = withRepeat(
            withSequence(
                withTiming(1.05, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
                withTiming(0.97, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
            ),
            -1,
            true,
        );
        glow.value = withRepeat(
            withSequence(
                withTiming(0.55, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
                withTiming(0.3, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
            ),
            -1,
            true,
        );
        return () => {
            cancelAnimation(rotation);
            cancelAnimation(breathe);
            cancelAnimation(glow);
        };
    }, [breathe, glow, rotation]);

    useEffect(() => {
        if (phrases.length <= 1) return;
        const id = setInterval(() => {
            setPhraseIndex((prev) => (prev + 1) % phrases.length);
        }, interval);
        return () => clearInterval(id);
    }, [phrases, interval]);

    const breatheStyle = useAnimatedStyle(() => ({ transform: [{ scale: breathe.value }] }));
    const rotateStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));
    const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={['#050a16', '#071019', '#04121a']}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.8, y: 1 }}
                style={StyleSheet.absoluteFill}
            />

            <View style={styles.center}>
                <Animated.View style={[styles.logoWrapper, breatheStyle]}>
                    {/* Soft glow halo behind the orbs */}
                    <Animated.View style={[styles.halo, glowStyle]} />

                    {/* Rotating orb group */}
                    <Animated.View style={[styles.orbLayer, rotateStyle]}>
                        {ORBS.map((orb, i) => {
                            const orbW = orb.r * 2 * S + 6;
                            const orbLeft = orb.cx * S - orbW / 2;
                            const orbTop = orb.cy * S - orbW / 2;
                            return (
                                <View
                                    key={i}
                                    style={[styles.orb, { left: orbLeft, top: orbTop, width: orbW, height: orbW }]}
                                >
                                    <Svg width={orbW} height={orbW} viewBox={`0 0 ${orbW} ${orbW}`}>
                                        <Defs>
                                            <RadialGradient
                                                id={`unpackOrb${i}`}
                                                cx={orb.grad.cx}
                                                cy={orb.grad.cy}
                                                r={orb.grad.r}
                                            >
                                                {orb.stops.map((s, j) => (
                                                    <Stop key={j} offset={s.offset} stopColor={s.color} stopOpacity={s.opacity} />
                                                ))}
                                            </RadialGradient>
                                        </Defs>
                                        <Circle cx={orbW / 2} cy={orbW / 2} r={orb.r * S} fill={`url(#unpackOrb${i})`} />
                                    </Svg>
                                </View>
                            );
                        })}
                    </Animated.View>
                </Animated.View>

                <Text style={styles.title}>{title}</Text>

                <View style={styles.subtextWrap}>
                    <Animated.Text
                        key={phraseIndex}
                        entering={FadeIn.duration(600)}
                        exiting={FadeOut.duration(400)}
                        style={styles.subtext}
                    >
                        {phrases[phraseIndex] ?? ''}
                    </Animated.Text>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    center: {
        alignItems: 'center',
    },
    logoWrapper: {
        width: LOGO_SIZE,
        height: LOGO_SIZE,
        justifyContent: 'center',
        alignItems: 'center',
    },
    halo: {
        position: 'absolute',
        width: LOGO_SIZE * 1.25,
        height: LOGO_SIZE * 1.25,
        borderRadius: LOGO_SIZE,
        backgroundColor: '#41caec',
        opacity: 0.35,
        // Soft radial-ish glow via shadow.
        shadowColor: '#41caec',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 40,
    },
    orbLayer: {
        width: LOGO_SIZE,
        height: LOGO_SIZE,
    },
    orb: {
        position: 'absolute',
    },
    title: {
        marginTop: 40,
        fontSize: 20,
        fontWeight: '600',
        color: '#EAF6FB',
        textAlign: 'center',
        letterSpacing: 0.2,
    },
    subtextWrap: {
        marginTop: 12,
        height: 22,
        justifyContent: 'center',
    },
    subtext: {
        fontSize: 14.5,
        color: 'rgba(200,220,235,0.65)',
        textAlign: 'center',
    },
});
